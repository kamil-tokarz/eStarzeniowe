import {
  CriterionKind,
  Evaluation,
  ReferenceStatus,
  SampleExecutionStatus,
  SampleRole,
  StudyStatus,
} from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

export function parseLabNumber(value: string) {
  const parsed = Number(value.trim().replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

export function initialMeasurementComplete(
  aerosol: boolean,
  measurement: {
    initialWeightG: number | null;
    initialPressureBar: number | null;
    weightNotPerformed: boolean;
    weightNotPerformedReason: string | null;
    pressureNotPerformed: boolean;
    pressureNotPerformedReason: string | null;
  } | null,
) {
  if (!measurement) return false;
  const weight = measurement.initialWeightG != null || (measurement.weightNotPerformed && Boolean(measurement.weightNotPerformedReason));
  const pressure = !aerosol || measurement.initialPressureBar != null || (measurement.pressureNotPerformed && Boolean(measurement.pressureNotPerformedReason));
  return weight && pressure;
}

export function evaluateLabResult(
  criterion: {
    kind: CriterionKind;
    currentVersion: {
      minValue: number | null;
      maxValue: number | null;
      expectedText: string | null;
      expectedBoolean: boolean | null;
    } | null;
  } | null,
  value: { numeric: number | null; text: string | null; boolean: boolean | null },
): Evaluation {
  const v = criterion?.currentVersion;
  if (!criterion || !v) return Evaluation.NOT_APPLICABLE;
  if (criterion.kind === CriterionKind.RANGE && value.numeric != null) return (v.minValue == null || value.numeric >= v.minValue) && (v.maxValue == null || value.numeric <= v.maxValue) ? Evaluation.OK : Evaluation.NOK;
  if (criterion.kind === CriterionKind.MINIMUM && value.numeric != null && v.minValue != null) return value.numeric >= v.minValue ? Evaluation.OK : Evaluation.NOK;
  if (criterion.kind === CriterionKind.MAXIMUM && value.numeric != null && v.maxValue != null) return value.numeric <= v.maxValue ? Evaluation.OK : Evaluation.NOK;
  if (criterion.kind === CriterionKind.EXPECTED_VALUE && value.text != null && v.expectedText != null) return value.text === v.expectedText ? Evaluation.OK : Evaluation.NOK;
  if (criterion.kind === CriterionKind.BOOLEAN_EXPECTED && value.boolean != null && v.expectedBoolean != null) return value.boolean === v.expectedBoolean ? Evaluation.OK : Evaluation.NOK;
  return Evaluation.NOT_APPLICABLE;
}

export async function allStudyInitialsComplete(studyId: string) {
  const study = await prisma.study.findUnique({
    where: { id: studyId },
    select: { aerosol: true, samples: { select: { initialMeasurement: true } } },
  });
  if (!study || study.samples.length === 0) return false;
  return study.samples.every((sample) => initialMeasurementComplete(study.aerosol, sample.initialMeasurement));
}

export async function refreshSampleExecution(sampleId: string) {
  const [required, completed] = await Promise.all([
    prisma.sampleTest.count({ where: { sampleId, required: true } }),
    prisma.sampleTest.count({ where: { sampleId, required: true, result: { isNot: null } } }),
  ]);
  const status = required > 0 && required === completed ? SampleExecutionStatus.COMPLETED : completed > 0 ? SampleExecutionStatus.IN_PROGRESS : SampleExecutionStatus.NOT_STARTED;
  const sample = await prisma.sample.update({ where: { id: sampleId }, data: { executionStatus: status, completedAt: status === SampleExecutionStatus.COMPLETED ? new Date() : null } });
  if (status === SampleExecutionStatus.COMPLETED && sample.role === SampleRole.REFERENCE) {
    await prisma.sample.update({ where: { id: sampleId }, data: { referenceStatus: ReferenceStatus.COMPLETED } });
  }
  return { sample, status };
}

export async function refreshStudyCompletion(studyId: string) {
  const study = await prisma.study.findUnique({ where: { id: studyId }, include: { samples: true } });
  if (!study || study.status !== StudyStatus.ACTIVE) return false;
  const required = study.samples.filter((sample) => sample.role !== SampleRole.REFERENCE || sample.referenceStatus === ReferenceStatus.ACTIVATED);
  if (!required.length || required.some((sample) => sample.executionStatus !== SampleExecutionStatus.COMPLETED)) return false;
  await prisma.$transaction([
    prisma.sample.updateMany({ where: { studyId, role: SampleRole.REFERENCE, referenceStatus: ReferenceStatus.AVAILABLE }, data: { referenceStatus: ReferenceStatus.UNUSED } }),
    prisma.study.update({ where: { id: studyId }, data: { status: StudyStatus.COMPLETED, completedAt: new Date() } }),
    prisma.auditEvent.create({ data: { studyId, type: "STUDY_COMPLETED", message: "Badanie zakończone automatycznie — wszystkie wymagane próbki są kompletne." } }),
  ]);
  return true;
}
