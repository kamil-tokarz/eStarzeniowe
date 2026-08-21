import { NextRequest, NextResponse } from "next/server";
import {
  Evaluation,
  ReferenceStatus,
  ResultState,
  SampleExecutionStatus,
  SampleRole,
  StudyStatus,
  TestValueType,
  UserRole,
} from "@/generated/prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { allStudyInitialsComplete, evaluateLabResult, parseLabNumber, refreshSampleExecution, refreshStudyCompletion } from "@/lib/lab-results";
import { prisma } from "@/lib/prisma";
import { publicUrl } from "@/lib/request-origin";

function text(form: FormData, key: string) { return String(form.get(key) ?? "").trim(); }

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || (user.role !== UserRole.LAB_TECHNICIAN && user.role !== UserRole.ADMIN)) return NextResponse.json({ error: "Brak uprawnień do zapisu wyników." }, { status: 403 });
  const { id: sampleId } = await params;
  const form = await request.formData();
  const intent = text(form, "intent");

  const sample = await prisma.sample.findUnique({
    where: { id: sampleId },
    include: {
      study: true,
      tests: {
        orderBy: { sortOrder: "asc" },
        include: { testDefinition: true, studyCriterion: { include: { currentVersion: true } }, result: true },
      },
    },
  });
  if (!sample || sample.study.status !== StudyStatus.ACTIVE) return NextResponse.redirect(publicUrl(request, `/lab/sample/${sampleId}?error=inactive`), 303);

  if (intent === "initial") {
    const weightNotPerformed = form.get("weightNotPerformed") === "on";
    const pressureNotPerformed = form.get("pressureNotPerformed") === "on";
    const weight = weightNotPerformed ? null : parseLabNumber(text(form, "initialWeightG"));
    const pressure = !sample.study.aerosol || pressureNotPerformed ? null : parseLabNumber(text(form, "initialPressureBar"));
    const weightReason = weightNotPerformed ? text(form, "weightReason") : null;
    const pressureReason = sample.study.aerosol && pressureNotPerformed ? text(form, "pressureReason") : null;

    if ((!weightNotPerformed && weight == null) || (weightNotPerformed && !weightReason)) return NextResponse.redirect(publicUrl(request, `/lab/sample/${sampleId}?error=initial-weight`), 303);
    if (sample.study.aerosol && ((!pressureNotPerformed && pressure == null) || (pressureNotPerformed && !pressureReason))) return NextResponse.redirect(publicUrl(request, `/lab/sample/${sampleId}?error=initial-pressure`), 303);

    await prisma.$transaction([
      prisma.initialMeasurement.upsert({
        where: { sampleId },
        create: { sampleId, initialWeightG: weight, initialPressureBar: pressure, weightNotPerformed, weightNotPerformedReason: weightReason, pressureNotPerformed: sample.study.aerosol ? pressureNotPerformed : false, pressureNotPerformedReason: pressureReason, recordedById: user.id, recordedAt: new Date() },
        update: { initialWeightG: weight, initialPressureBar: pressure, weightNotPerformed, weightNotPerformedReason: weightReason, pressureNotPerformed: sample.study.aerosol ? pressureNotPerformed : false, pressureNotPerformedReason: pressureReason, recordedById: user.id, recordedAt: new Date() },
      }),
      prisma.auditEvent.create({ data: { studyId: sample.studyId, authorId: user.id, type: "INITIAL_MEASUREMENT", message: `${sample.code} · zapisano badania wstępne.` } }),
    ]);
    return NextResponse.redirect(publicUrl(request, `/lab/sample/${sampleId}?saved=initial`), 303);
  }

  if (intent !== "results") return NextResponse.json({ error: "Nieznana operacja." }, { status: 400 });
  if (sample.role === SampleRole.MICROBIOLOGY) return NextResponse.redirect(publicUrl(request, `/lab/sample/${sampleId}?error=micro`), 303);
  if (sample.role === SampleRole.REFERENCE && sample.referenceStatus !== ReferenceStatus.ACTIVATED) return NextResponse.redirect(publicUrl(request, `/lab/sample/${sampleId}?error=reference`), 303);
  if (!(await allStudyInitialsComplete(sample.studyId))) return NextResponse.redirect(publicUrl(request, `/lab/sample/${sampleId}?error=initials`), 303);

  let saved = 0;
  let conflicts = 0;
  let errors = 0;

  for (const test of sample.tests) {
    const stateRaw = text(form, `state_${test.id}`) || ResultState.RECORDED;
    const valueRaw = text(form, `value_${test.id}`);
    const reasonRaw = text(form, `reason_${test.id}`);
    const touched = stateRaw === ResultState.NOT_PERFORMED || valueRaw !== "";
    if (!touched) continue;

    const current = await prisma.testResult.findUnique({ where: { sampleTestId: test.id } });
    const expectedVersionRaw = text(form, `version_${test.id}`);
    const expectedVersion = expectedVersionRaw ? Number(expectedVersionRaw) : null;
    if ((current && current.version !== expectedVersion) || (!current && expectedVersion !== null)) { conflicts++; continue; }

    const state = stateRaw === ResultState.NOT_PERFORMED ? ResultState.NOT_PERFORMED : ResultState.RECORDED;
    let numeric: number | null = null;
    let textValue: string | null = null;
    let booleanValue: boolean | null = null;
    let evaluation: Evaluation = Evaluation.NOT_APPLICABLE;

    if (state === ResultState.NOT_PERFORMED) {
      if (!reasonRaw) { errors++; continue; }
    } else {
      if (!valueRaw) { errors++; continue; }
      if (test.testDefinition.valueType === TestValueType.NUMBER) {
        numeric = parseLabNumber(valueRaw); if (numeric == null) { errors++; continue; }
      } else if (test.testDefinition.valueType === TestValueType.BOOLEAN) {
        if (!["true", "false"].includes(valueRaw)) { errors++; continue; }
        booleanValue = valueRaw === "true";
      } else textValue = valueRaw;
      evaluation = evaluateLabResult(test.studyCriterion, { numeric, text: textValue, boolean: booleanValue });
    }

    if (current) {
      const previous = current.state === ResultState.NOT_PERFORMED ? `Nie wykonano: ${current.notPerformedReason}` : String(current.numericValue ?? current.textValue ?? current.booleanValue ?? "");
      const next = state === ResultState.NOT_PERFORMED ? `Nie wykonano: ${reasonRaw}` : String(numeric ?? textValue ?? booleanValue ?? "");
      await prisma.$transaction([
        prisma.testResultHistory.create({ data: { testResultId: current.id, previousValue: previous, newValue: next, previousEvaluation: current.currentEvaluation, newEvaluation: evaluation, authorId: user.id } }),
        prisma.testResult.update({ where: { id: current.id }, data: { state, numericValue: numeric, textValue, booleanValue, notPerformedReason: state === ResultState.NOT_PERFORMED ? reasonRaw : null, currentEvaluation: evaluation, authorId: user.id, version: { increment: 1 } } }),
      ]);
    } else {
      await prisma.testResult.create({ data: { sampleTestId: test.id, state, numericValue: numeric, textValue, booleanValue, notPerformedReason: state === ResultState.NOT_PERFORMED ? reasonRaw : null, evaluationAtEntry: evaluation, currentEvaluation: evaluation, criterionVersionAtEntryId: test.studyCriterion?.currentVersionId ?? null, authorId: user.id } });
    }
    if (evaluation === Evaluation.NOK) await prisma.auditEvent.create({ data: { studyId: sample.studyId, authorId: user.id, type: "NOK_RECORDED", message: `${sample.code} · ${test.testDefinition.name} · zapisano NOK.` } });
    saved++;
  }

  const before = sample.executionStatus;
  const refreshed = await refreshSampleExecution(sampleId);
  if (before !== SampleExecutionStatus.COMPLETED && refreshed.status === SampleExecutionStatus.COMPLETED) {
    await prisma.auditEvent.create({ data: { studyId: sample.studyId, authorId: user.id, type: "SAMPLE_COMPLETED", message: `${sample.code} · próbka kompletna.` } });
  }
  await refreshStudyCompletion(sample.studyId);

  const query = new URLSearchParams({ saved: String(saved), conflicts: String(conflicts), errors: String(errors) });
  return NextResponse.redirect(publicUrl(request, `/lab/sample/${sampleId}?${query.toString()}`), 303);
}
