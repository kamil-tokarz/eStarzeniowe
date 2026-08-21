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

function requiredString(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();
  if (!value) throw new Error(`Brak wymaganego pola: ${key}`);
  return value;
}

function numericValue(raw: FormDataEntryValue | null) {
  const text = String(raw ?? "").trim().replace(",", ".");
  if (!text) return null;
  const value = Number(text);
  if (!Number.isFinite(value)) throw new Error("Wprowadzono nieprawidłową wartość liczbową.");
  return value;
}

async function requireLaboratoryUser() {
  const user = await requireUser();
  if (user.role !== UserRole.LAB_TECHNICIAN && user.role !== UserRole.ADMIN) {
    throw new Error("Wyniki badań może zapisywać Laborant lub Administrator.");
  }
  return user;
}

function initialMeasurementComplete(
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

async function allStudyInitialsComplete(studyId: string) {
  const study = await prisma.study.findUnique({
    where: { id: studyId },
    select: { aerosol: true, samples: { select: { initialMeasurement: true } } },
  });
  if (!study || study.samples.length === 0) return false;
  return study.samples.every((sample) => initialMeasurementComplete(study.aerosol, sample.initialMeasurement));
}

function evaluateResult(
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
) {
  if (!criterion?.currentVersion) return Evaluation.NOT_APPLICABLE;
  const v = criterion.currentVersion;
  switch (criterion.kind) {
    case CriterionKind.RANGE:
      if (value.numeric == null) return Evaluation.NOT_APPLICABLE;
      return (v.minValue == null || value.numeric >= v.minValue) && (v.maxValue == null || value.numeric <= v.maxValue) ? Evaluation.OK : Evaluation.NOK;
    case CriterionKind.MINIMUM:
      if (value.numeric == null || v.minValue == null) return Evaluation.NOT_APPLICABLE;
      return value.numeric >= v.minValue ? Evaluation.OK : Evaluation.NOK;
    case CriterionKind.MAXIMUM:
      if (value.numeric == null || v.maxValue == null) return Evaluation.NOT_APPLICABLE;
      return value.numeric <= v.maxValue ? Evaluation.OK : Evaluation.NOK;
    case CriterionKind.EXPECTED_VALUE:
      if (value.text == null || v.expectedText == null) return Evaluation.NOT_APPLICABLE;
      return value.text === v.expectedText ? Evaluation.OK : Evaluation.NOK;
    case CriterionKind.BOOLEAN_EXPECTED:
      if (value.boolean == null || v.expectedBoolean == null) return Evaluation.NOT_APPLICABLE;
      return value.boolean === v.expectedBoolean ? Evaluation.OK : Evaluation.NOK;
    default:
      return Evaluation.NOT_APPLICABLE;
  }
}

async function refreshStudyCompletion(studyId: string) {
  const study = await prisma.study.findUnique({
    where: { id: studyId },
    include: { samples: true },
  });
  if (!study || study.status !== StudyStatus.ACTIVE) return;
  const required = study.samples.filter((sample) => sample.role !== SampleRole.REFERENCE || sample.referenceStatus === ReferenceStatus.ACTIVATED);
  if (required.length === 0 || required.some((sample) => sample.executionStatus !== SampleExecutionStatus.COMPLETED)) return;

  await prisma.$transaction([
    prisma.sample.updateMany({
      where: { studyId, role: SampleRole.REFERENCE, referenceStatus: ReferenceStatus.AVAILABLE },
      data: { referenceStatus: ReferenceStatus.UNUSED },
    }),
    prisma.study.update({ where: { id: studyId }, data: { status: StudyStatus.COMPLETED, completedAt: new Date() } }),
    prisma.auditEvent.create({ data: { studyId, type: "STUDY_COMPLETED", message: "Badanie zakończone automatycznie — wszystkie wymagane próbki są kompletne." } }),
  ]);
}

export async function saveInitialMeasurementAction(formData: FormData) {
  const user = await requireLaboratoryUser();
  const sampleId = requiredString(formData, "sampleId");
  const sample = await prisma.sample.findUnique({ where: { id: sampleId }, include: { study: true } });
  if (!sample || sample.study.status !== StudyStatus.ACTIVE) throw new Error("Próbka nie należy do aktywnego badania.");

  const weightNotPerformed = formData.get("weightNotPerformed") === "on";
  const pressureNotPerformed = formData.get("pressureNotPerformed") === "on";
  const weight = weightNotPerformed ? null : numericValue(formData.get("initialWeightG"));
  const pressure = !sample.study.aerosol || pressureNotPerformed ? null : numericValue(formData.get("initialPressureBar"));
  const weightReason = weightNotPerformed ? requiredString(formData, "weightReason") : null;
  const pressureReason = sample.study.aerosol && pressureNotPerformed ? requiredString(formData, "pressureReason") : null;

  if (!weightNotPerformed && weight == null) throw new Error("Podaj wagę początkową albo wybierz „Nie wykonano”.");
  if (sample.study.aerosol && !pressureNotPerformed && pressure == null) throw new Error("Podaj ciśnienie początkowe albo wybierz „Nie wykonano”.");

  await prisma.$transaction([
    prisma.initialMeasurement.upsert({
      where: { sampleId },
      create: {
        sampleId,
        initialWeightG: weight,
        initialPressureBar: pressure,
        weightNotPerformed,
        weightNotPerformedReason: weightReason,
        pressureNotPerformed: sample.study.aerosol ? pressureNotPerformed : false,
        pressureNotPerformedReason: pressureReason,
        recordedById: user.id,
        recordedAt: new Date(),
      },
      update: {
        initialWeightG: weight,
        initialPressureBar: pressure,
        weightNotPerformed,
        weightNotPerformedReason: weightReason,
        pressureNotPerformed: sample.study.aerosol ? pressureNotPerformed : false,
        pressureNotPerformedReason: pressureReason,
        recordedById: user.id,
        recordedAt: new Date(),
      },
    }),
    prisma.auditEvent.create({ data: { studyId: sample.studyId, authorId: user.id, type: "INITIAL_MEASUREMENT", message: `${sample.code} · zapisano badania wstępne.` } }),
  ]);

  revalidatePath("/lab");
  revalidatePath(`/lab/sample/${sampleId}`);
  revalidatePath(`/studies/${sample.studyId}`);
}

export async function saveSampleResultsAction(formData: FormData) {
  const user = await requireLaboratoryUser();
  const sampleId = requiredString(formData, "sampleId");
  const sample = await prisma.sample.findUnique({
    where: { id: sampleId },
    include: {
      study: true,
      tests: {
        orderBy: { sortOrder: "asc" },
        include: {
          testDefinition: true,
          studyCriterion: { include: { currentVersion: true } },
          result: true,
        },
      },
    },
  });
  if (!sample || sample.study.status !== StudyStatus.ACTIVE) throw new Error("Próbka nie należy do aktywnego badania.");
  if (sample.role === SampleRole.MICROBIOLOGY) throw new Error("Mikrobiologia ma osobny zapis wyniku zbiorczego.");
  if (sample.role === SampleRole.REFERENCE && sample.referenceStatus !== ReferenceStatus.ACTIVATED) throw new Error("Próbka RF nie została aktywowana przez Technologa.");
  if (!(await allStudyInitialsComplete(sample.studyId))) throw new Error("Najpierw zakończ badania wstępne wszystkich próbek w tym badaniu.");

  const conflicts: string[] = [];
  let saved = 0;

  for (const test of sample.tests) {
    const stateRaw = String(formData.get(`state_${test.id}`) ?? "");
    const valueRaw = String(formData.get(`value_${test.id}`) ?? "").trim();
    const reasonRaw = String(formData.get(`reason_${test.id}`) ?? "").trim();
    const touched = stateRaw === ResultState.NOT_PERFORMED || valueRaw !== "";
    if (!touched) continue;

    const expectedVersionRaw = String(formData.get(`version_${test.id}`) ?? "").trim();
    const expectedVersion = expectedVersionRaw ? Number(expectedVersionRaw) : null;
    const current = await prisma.testResult.findUnique({ where: { sampleTestId: test.id } });
    if ((current && expectedVersion !== current.version) || (!current && expectedVersion !== null)) {
      conflicts.push(`${sample.code} · ${test.testDefinition.name}`);
      continue;
    }

    const state = stateRaw === ResultState.NOT_PERFORMED ? ResultState.NOT_PERFORMED : ResultState.RECORDED;
    let numeric: number | null = null;
    let text: string | null = null;
    let bool: boolean | null = null;
    let evaluation = Evaluation.NOT_APPLICABLE;

    if (state === ResultState.NOT_PERFORMED) {
      if (!reasonRaw) throw new Error(`Podaj powód „Nie wykonano” dla: ${test.testDefinition.name}.`);
    } else {
      if (!valueRaw) throw new Error(`Uzupełnij wynik: ${test.testDefinition.name}.`);
      if (test.testDefinition.valueType === TestValueType.NUMBER) numeric = numericValue(valueRaw);
      else if (test.testDefinition.valueType === TestValueType.BOOLEAN) bool = ["true", "tak", "1"].includes(valueRaw.toLowerCase());
      else text = valueRaw;
      evaluation = evaluateResult(test.studyCriterion, { numeric, text, boolean: bool });
    }

    if (current) {
      const oldValue = current.state === ResultState.NOT_PERFORMED ? `Nie wykonano: ${current.notPerformedReason}` : String(current.numericValue ?? current.textValue ?? current.booleanValue ?? "");
      const newValue = state === ResultState.NOT_PERFORMED ? `Nie wykonano: ${reasonRaw}` : String(numeric ?? text ?? bool ?? "");
      await prisma.$transaction([
        prisma.testResultHistory.create({
          data: {
            testResultId: current.id,
            previousValue: oldValue,
            newValue,
            previousEvaluation: current.currentEvaluation,
            newEvaluation: evaluation,
            authorId: user.id,
          },
        }),
        prisma.testResult.update({
          where: { id: current.id },
          data: {
            state,
            numericValue: numeric,
            textValue: text,
            booleanValue: bool,
            notPerformedReason: state === ResultState.NOT_PERFORMED ? reasonRaw : null,
            currentEvaluation: evaluation,
            authorId: user.id,
            version: { increment: 1 },
          },
        }),
      ]);
    } else {
      await prisma.testResult.create({
        data: {
          sampleTestId: test.id,
          state,
          numericValue: numeric,
          textValue: text,
          booleanValue: bool,
          notPerformedReason: state === ResultState.NOT_PERFORMED ? reasonRaw : null,
          evaluationAtEntry: evaluation,
          currentEvaluation: evaluation,
          criterionVersionAtEntryId: test.studyCriterion?.currentVersionId ?? null,
          authorId: user.id,
        },
      });
    }
    saved++;
    if (evaluation === Evaluation.NOK) {
      await prisma.auditEvent.create({ data: { studyId: sample.studyId, authorId: user.id, type: "NOK_RECORDED", message: `${sample.code} · ${test.testDefinition.name} · zapisano NOK.` } });
    }
  }

  const resultCount = await prisma.sampleTest.count({ where: { sampleId, required: true, result: { isNot: null } } });
  const requiredCount = await prisma.sampleTest.count({ where: { sampleId, required: true } });
  const executionStatus = requiredCount > 0 && resultCount === requiredCount ? SampleExecutionStatus.COMPLETED : resultCount > 0 ? SampleExecutionStatus.IN_PROGRESS : SampleExecutionStatus.NOT_STARTED;
  await prisma.sample.update({ where: { id: sampleId }, data: { executionStatus, completedAt: executionStatus === SampleExecutionStatus.COMPLETED ? new Date() : null } });
  if (executionStatus === SampleExecutionStatus.COMPLETED) {
    await prisma.auditEvent.create({ data: { studyId: sample.studyId, authorId: user.id, type: "SAMPLE_COMPLETED", message: `${sample.code} · próbka kompletna.` } });
    if (sample.role === SampleRole.REFERENCE) await prisma.sample.update({ where: { id: sampleId }, data: { referenceStatus: ReferenceStatus.COMPLETED } });
  }

  await refreshStudyCompletion(sample.studyId);
  revalidatePath("/");
  revalidatePath("/lab");
  revalidatePath(`/lab/sample/${sampleId}`);
  revalidatePath(`/studies/${sample.studyId}`);
  const query = new URLSearchParams();
  if (saved) query.set("saved", String(saved));
  if (conflicts.length) query.set("conflicts", String(conflicts.length));
  redirect(`/lab/sample/${sampleId}?${query.toString()}`);
}

export async function saveMicrobiologyResultAction(formData: FormData) {
  const user = await requireLaboratoryUser();
  const sampleId = requiredString(formData, "sampleId");
  const evaluationRaw = requiredString(formData, "evaluation");
  const evaluation = evaluationRaw === Evaluation.NOK ? Evaluation.NOK : Evaluation.OK;
  const sample = await prisma.sample.findUnique({ where: { id: sampleId }, include: { study: true } });
  if (!sample || sample.role !== SampleRole.MICROBIOLOGY || sample.study.status !== StudyStatus.ACTIVE) throw new Error("To nie jest aktywna próbka mikrobiologiczna.");
  if (!(await allStudyInitialsComplete(sample.studyId))) throw new Error("Najpierw zakończ badania wstępne wszystkich próbek w tym badaniu.");

  await prisma.$transaction([
    prisma.microbiologyResult.upsert({
      where: { sampleId },
      create: { sampleId, evaluation, authorId: user.id, reportName: String(formData.get("reportName") ?? "").trim() || null },
      update: { evaluation, authorId: user.id, reportName: String(formData.get("reportName") ?? "").trim() || null },
    }),
    prisma.sample.update({ where: { id: sampleId }, data: { executionStatus: SampleExecutionStatus.COMPLETED, completedAt: new Date() } }),
    prisma.auditEvent.create({ data: { studyId: sample.studyId, authorId: user.id, type: "MICRO_RESULT", message: `${sample.code} · mikrobiologia · ${evaluation}.` } }),
  ]);

  await refreshStudyCompletion(sample.studyId);
  revalidatePath("/");
  revalidatePath("/lab");
  revalidatePath(`/studies/${sample.studyId}`);
  redirect(`/lab/sample/${sampleId}?saved=1`);
}
