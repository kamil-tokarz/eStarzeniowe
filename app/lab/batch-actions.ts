"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  CriterionKind,
  Evaluation,
  ReferenceStatus,
  ResultState,
  SampleExecutionStatus,
  SampleRole,
  StudyStatus,
  TestValueType,
  UserRole,
} from "@/generated/prisma/client";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function parseNumber(value: string) {
  const parsed = Number(value.trim().replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function initialComplete(aerosol: boolean, measurement: { initialWeightG: number | null; initialPressureBar: number | null; weightNotPerformed: boolean; weightNotPerformedReason: string | null; pressureNotPerformed: boolean; pressureNotPerformedReason: string | null } | null) {
  if (!measurement) return false;
  const weight = measurement.initialWeightG != null || (measurement.weightNotPerformed && Boolean(measurement.weightNotPerformedReason));
  const pressure = !aerosol || measurement.initialPressureBar != null || (measurement.pressureNotPerformed && Boolean(measurement.pressureNotPerformedReason));
  return weight && pressure;
}

function evaluate(criterion: { kind: CriterionKind; currentVersion: { minValue: number | null; maxValue: number | null; expectedText: string | null; expectedBoolean: boolean | null } | null } | null, value: { numeric: number | null; text: string | null; boolean: boolean | null }) {
  const v = criterion?.currentVersion;
  if (!criterion || !v) return Evaluation.NOT_APPLICABLE;
  if (criterion.kind === CriterionKind.RANGE && value.numeric != null) return (v.minValue == null || value.numeric >= v.minValue) && (v.maxValue == null || value.numeric <= v.maxValue) ? Evaluation.OK : Evaluation.NOK;
  if (criterion.kind === CriterionKind.MINIMUM && value.numeric != null && v.minValue != null) return value.numeric >= v.minValue ? Evaluation.OK : Evaluation.NOK;
  if (criterion.kind === CriterionKind.MAXIMUM && value.numeric != null && v.maxValue != null) return value.numeric <= v.maxValue ? Evaluation.OK : Evaluation.NOK;
  if (criterion.kind === CriterionKind.EXPECTED_VALUE && value.text != null && v.expectedText != null) return value.text === v.expectedText ? Evaluation.OK : Evaluation.NOK;
  if (criterion.kind === CriterionKind.BOOLEAN_EXPECTED && value.boolean != null && v.expectedBoolean != null) return value.boolean === v.expectedBoolean ? Evaluation.OK : Evaluation.NOK;
  return Evaluation.NOT_APPLICABLE;
}

async function refreshSample(sampleId: string) {
  const [required, completed] = await Promise.all([
    prisma.sampleTest.count({ where: { sampleId, required: true } }),
    prisma.sampleTest.count({ where: { sampleId, required: true, result: { isNot: null } } }),
  ]);
  const status = required > 0 && required === completed ? SampleExecutionStatus.COMPLETED : completed > 0 ? SampleExecutionStatus.IN_PROGRESS : SampleExecutionStatus.NOT_STARTED;
  const sample = await prisma.sample.update({ where: { id: sampleId }, data: { executionStatus: status, completedAt: status === SampleExecutionStatus.COMPLETED ? new Date() : null } });
  if (status === SampleExecutionStatus.COMPLETED && sample.role === SampleRole.REFERENCE) {
    await prisma.sample.update({ where: { id: sampleId }, data: { referenceStatus: ReferenceStatus.COMPLETED } });
  }
  return sample;
}

async function refreshStudy(studyId: string) {
  const study = await prisma.study.findUnique({ where: { id: studyId }, include: { samples: true } });
  if (!study || study.status !== StudyStatus.ACTIVE) return;
  const required = study.samples.filter((sample) => sample.role !== SampleRole.REFERENCE || sample.referenceStatus === ReferenceStatus.ACTIVATED);
  if (!required.length || required.some((sample) => sample.executionStatus !== SampleExecutionStatus.COMPLETED)) return;
  await prisma.$transaction([
    prisma.sample.updateMany({ where: { studyId, role: SampleRole.REFERENCE, referenceStatus: ReferenceStatus.AVAILABLE }, data: { referenceStatus: ReferenceStatus.UNUSED } }),
    prisma.study.update({ where: { id: studyId }, data: { status: StudyStatus.COMPLETED, completedAt: new Date() } }),
    prisma.auditEvent.create({ data: { studyId, type: "STUDY_COMPLETED", message: "Badanie zakończone automatycznie — wszystkie wymagane próbki są kompletne." } }),
  ]);
}

export async function saveBatchResultsAction(formData: FormData) {
  const user = await requireUser();
  if (user.role !== UserRole.LAB_TECHNICIAN && user.role !== UserRole.ADMIN) throw new Error("Brak uprawnień do zapisu wyników.");
  const code = String(formData.get("testCode") ?? "").trim();
  const ids = formData.getAll("sampleTestId").map(String).filter(Boolean);
  const tests = await prisma.sampleTest.findMany({
    where: { id: { in: ids } },
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
    if (!sample.study.samples.every((row) => initialComplete(sample.study.aerosol, row.initialMeasurement))) { errors++; continue; }

    const stateRaw = String(formData.get(`state_${test.id}`) ?? ResultState.RECORDED);
    const valueRaw = String(formData.get(`value_${test.id}`) ?? "").trim();
    const reasonRaw = String(formData.get(`reason_${test.id}`) ?? "").trim();
    const touched = stateRaw === ResultState.NOT_PERFORMED || valueRaw !== "";
    if (!touched) continue;

    const current = await prisma.testResult.findUnique({ where: { sampleTestId: test.id } });
    const versionRaw = String(formData.get(`version_${test.id}`) ?? "").trim();
    const expectedVersion = versionRaw ? Number(versionRaw) : null;
    if ((current && current.version !== expectedVersion) || (!current && expectedVersion !== null)) { conflicts++; continue; }

    const state = stateRaw === ResultState.NOT_PERFORMED ? ResultState.NOT_PERFORMED : ResultState.RECORDED;
    let numeric: number | null = null;
    let text: string | null = null;
    let bool: boolean | null = null;
    let evaluation = Evaluation.NOT_APPLICABLE;

    if (state === ResultState.NOT_PERFORMED) {
      if (!reasonRaw) { errors++; continue; }
    } else {
      if (!valueRaw) { errors++; continue; }
      if (test.testDefinition.valueType === TestValueType.NUMBER) {
        numeric = parseNumber(valueRaw);
        if (numeric == null) { errors++; continue; }
      } else if (test.testDefinition.valueType === TestValueType.BOOLEAN) {
        if (!["true", "false"].includes(valueRaw)) { errors++; continue; }
        bool = valueRaw === "true";
      } else text = valueRaw;
      evaluation = evaluate(test.studyCriterion, { numeric, text, boolean: bool });
    }

    if (current) {
      const previous = current.state === ResultState.NOT_PERFORMED ? `Nie wykonano: ${current.notPerformedReason}` : String(current.numericValue ?? current.textValue ?? current.booleanValue ?? "");
      const next = state === ResultState.NOT_PERFORMED ? `Nie wykonano: ${reasonRaw}` : String(numeric ?? text ?? bool ?? "");
      await prisma.$transaction([
        prisma.testResultHistory.create({ data: { testResultId: current.id, previousValue: previous, newValue: next, previousEvaluation: current.currentEvaluation, newEvaluation: evaluation, authorId: user.id } }),
        prisma.testResult.update({ where: { id: current.id }, data: { state, numericValue: numeric, textValue: text, booleanValue: bool, notPerformedReason: state === ResultState.NOT_PERFORMED ? reasonRaw : null, currentEvaluation: evaluation, authorId: user.id, version: { increment: 1 } } }),
      ]);
    } else {
      await prisma.testResult.create({ data: { sampleTestId: test.id, state, numericValue: numeric, textValue: text, booleanValue: bool, notPerformedReason: state === ResultState.NOT_PERFORMED ? reasonRaw : null, evaluationAtEntry: evaluation, currentEvaluation: evaluation, criterionVersionAtEntryId: test.studyCriterion?.currentVersionId ?? null, authorId: user.id } });
    }
    if (evaluation === Evaluation.NOK) await prisma.auditEvent.create({ data: { studyId: sample.studyId, authorId: user.id, type: "NOK_RECORDED", message: `${sample.code} · ${test.testDefinition.name} · zapisano NOK.` } });
    saved++;
    affectedSamples.add(sample.id);
    affectedStudies.add(sample.studyId);
  }

  for (const sampleId of affectedSamples) await refreshSample(sampleId);
  for (const studyId of affectedStudies) await refreshStudy(studyId);

  revalidatePath("/");
  revalidatePath("/lab");
  revalidatePath(`/lab/test/${code}`);
  const query = new URLSearchParams({ saved: String(saved), conflicts: String(conflicts), errors: String(errors) });
  redirect(`/lab/test/${code}?${query.toString()}`);
}
