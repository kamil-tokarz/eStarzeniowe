import { NextRequest, NextResponse } from "next/server";
import { Evaluation, ReferenceStatus, ResultState, SampleRole, StudyStatus, TestValueType, UserRole } from "@/generated/prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { evaluateLabResult, initialMeasurementComplete, parseLabNumber, refreshSampleExecution, refreshStudyCompletion } from "@/lib/lab-results";
import { prisma } from "@/lib/prisma";
import { publicUrl } from "@/lib/request-origin";

function text(form: FormData, key: string) { return String(form.get(key) ?? "").trim(); }

export async function POST(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const user = await getCurrentUser();
  if (!user || (user.role !== UserRole.LAB_TECHNICIAN && user.role !== UserRole.ADMIN)) return NextResponse.json({ error: "Brak uprawnień do zapisu wyników." }, { status: 403 });
  const { code } = await params;
  const form = await request.formData();
  const ids = form.getAll("sampleTestId").map(String).filter(Boolean);
  const tests = await prisma.sampleTest.findMany({
    where: { id: { in: ids }, testDefinition: { code } },
    include: {
      testDefinition: true,
      result: true,
      studyCriterion: { include: { currentVersion: true } },
      sample: { include: { study: { include: { samples: { select: { initialMeasurement: true } } } } } },
    },
  });

  let saved = 0;
  let conflicts = 0;
  let errors = 0;
  const affectedSamples = new Set<string>();
  const affectedStudies = new Set<string>();

  for (const test of tests) {
    const sample = test.sample;
    if (sample.study.status !== StudyStatus.ACTIVE) { errors++; continue; }
    if (sample.role === SampleRole.REFERENCE && sample.referenceStatus !== ReferenceStatus.ACTIVATED) { errors++; continue; }
    if (!sample.study.samples.every((row) => initialMeasurementComplete(sample.study.aerosol, row.initialMeasurement))) { errors++; continue; }

    const stateRaw = text(form, `state_${test.id}`) || ResultState.RECORDED;
    const valueRaw = text(form, `value_${test.id}`);
    const reasonRaw = text(form, `reason_${test.id}`);
    const touched = stateRaw === ResultState.NOT_PERFORMED || valueRaw !== "";
    if (!touched) continue;

    const current = await prisma.testResult.findUnique({ where: { sampleTestId: test.id } });
    const versionRaw = text(form, `version_${test.id}`);
    const expectedVersion = versionRaw ? Number(versionRaw) : null;
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
    affectedSamples.add(sample.id);
    affectedStudies.add(sample.studyId);
  }

  for (const sampleId of affectedSamples) await refreshSampleExecution(sampleId);
  for (const studyId of affectedStudies) await refreshStudyCompletion(studyId);

  const query = new URLSearchParams({ saved: String(saved), conflicts: String(conflicts), errors: String(errors) });
  return NextResponse.redirect(publicUrl(request, `/lab/test/${encodeURIComponent(code)}?${query.toString()}`), 303);
}
