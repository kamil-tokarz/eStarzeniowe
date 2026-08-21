"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  CriterionKind,
  Evaluation,
  ReferenceStatus,
  SampleExecutionStatus,
  SampleRole,
  StudyStatus,
  UserRole,
} from "@/generated/prisma/client";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function required(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();
  if (!value) throw new Error(`Brak wymaganego pola: ${key}`);
  return value;
}

function numberOrNull(value: FormDataEntryValue | null) {
  const raw = String(value ?? "").trim().replace(",", ".");
  if (!raw) return null;
  const number = Number(raw);
  if (!Number.isFinite(number)) throw new Error("Nieprawidłowa wartość liczbowa.");
  return number;
}

async function requireTechnologist() {
  const user = await requireUser();
  if (user.role !== UserRole.TECHNOLOGIST && user.role !== UserRole.ADMIN) throw new Error("Operacja dostępna wyłącznie dla Technologa lub Administratora.");
  return user;
}

function evaluate(kind: CriterionKind, version: { minValue: number | null; maxValue: number | null; expectedText: string | null; expectedBoolean: boolean | null }, result: { numericValue: number | null; textValue: string | null; booleanValue: boolean | null }): Evaluation {
  if (kind === CriterionKind.RANGE && result.numericValue != null) return (version.minValue == null || result.numericValue >= version.minValue) && (version.maxValue == null || result.numericValue <= version.maxValue) ? Evaluation.OK : Evaluation.NOK;
  if (kind === CriterionKind.MINIMUM && result.numericValue != null && version.minValue != null) return result.numericValue >= version.minValue ? Evaluation.OK : Evaluation.NOK;
  if (kind === CriterionKind.MAXIMUM && result.numericValue != null && version.maxValue != null) return result.numericValue <= version.maxValue ? Evaluation.OK : Evaluation.NOK;
  if (kind === CriterionKind.EXPECTED_VALUE && result.textValue != null && version.expectedText != null) return result.textValue === version.expectedText ? Evaluation.OK : Evaluation.NOK;
  if (kind === CriterionKind.BOOLEAN_EXPECTED && result.booleanValue != null && version.expectedBoolean != null) return result.booleanValue === version.expectedBoolean ? Evaluation.OK : Evaluation.NOK;
  return Evaluation.NOT_APPLICABLE;
}

export async function activateReferenceAction(formData: FormData) {
  const user = await requireTechnologist();
  const sourceResultId = required(formData, "sourceResultId");
  const reason = required(formData, "reason");

  const source = await prisma.testResult.findUnique({
    where: { id: sourceResultId },
    include: {
      sampleTest: {
        include: {
          sample: { include: { study: true } },
          testDefinition: true,
          studyCriterion: true,
        },
      },
    },
  });
  if (!source || source.currentEvaluation !== Evaluation.NOK) throw new Error("RF można aktywować tylko dla aktualnego wyniku NOK.");
  const sourceSample = source.sampleTest.sample;
  if (sourceSample.study.status !== StudyStatus.ACTIVE) throw new Error("Badanie nie jest aktywne.");

  const reference = await prisma.sample.findFirst({
    where: {
      studyId: sourceSample.studyId,
      role: SampleRole.REFERENCE,
      referenceStatus: ReferenceStatus.AVAILABLE,
      storageCondition: sourceSample.storageCondition,
    },
    orderBy: { code: "asc" },
  });
  if (!reference) throw new Error("Brak dostępnej próbki RF dla tego warunku przechowywania.");

  await prisma.$transaction(async (tx) => {
    await tx.sample.update({
      where: { id: reference.id },
      data: {
        referenceStatus: ReferenceStatus.ACTIVATED,
        executionStatus: SampleExecutionStatus.NOT_STARTED,
        activatedAt: new Date(),
        activatedById: user.id,
        sourceSampleId: sourceSample.id,
        sourceTestResultId: source.id,
        activationReason: reason,
      },
    });
    await tx.sampleTest.create({
      data: {
        sampleId: reference.id,
        testDefinitionId: source.sampleTest.testDefinitionId,
        studyCriterionId: source.sampleTest.studyCriterionId,
        sortOrder: 1,
      },
    });
    await tx.auditEvent.create({
      data: {
        studyId: sourceSample.studyId,
        authorId: user.id,
        type: "REFERENCE_ACTIVATED",
        message: `${sourceSample.code} · ${source.sampleTest.testDefinition.name} NOK → aktywowano ${reference.code}. Powód: ${reason}`,
      },
    });
  });

  revalidatePath("/");
  revalidatePath("/lab");
  revalidatePath(`/studies/${sourceSample.studyId}`);
  redirect(`/studies/${sourceSample.studyId}#results`);
}

export async function changeCriterionAction(formData: FormData) {
  const user = await requireTechnologist();
  const criterionId = required(formData, "criterionId");
  const reason = required(formData, "reason");
  const criterion = await prisma.studyCriterion.findUnique({
    where: { id: criterionId },
    include: {
      study: true,
      currentVersion: true,
      versions: { orderBy: { version: "desc" }, take: 1 },
      testDefinition: true,
    },
  });
  if (!criterion || criterion.study.status !== StudyStatus.ACTIVE || !criterion.currentVersion) throw new Error("Kryterium nie należy do aktywnego badania.");

  let minValue = criterion.currentVersion.minValue;
  let maxValue = criterion.currentVersion.maxValue;
  let expectedText = criterion.currentVersion.expectedText;
  let expectedBoolean = criterion.currentVersion.expectedBoolean;

  if ([CriterionKind.RANGE, CriterionKind.MINIMUM, CriterionKind.MAXIMUM].includes(criterion.kind)) {
    minValue = numberOrNull(formData.get("minValue"));
    maxValue = numberOrNull(formData.get("maxValue"));
    if (criterion.kind === CriterionKind.RANGE && (minValue == null || maxValue == null)) throw new Error("Zakres wymaga wartości minimalnej i maksymalnej.");
  } else if (criterion.kind === CriterionKind.EXPECTED_VALUE) {
    expectedText = required(formData, "expectedText");
  } else if (criterion.kind === CriterionKind.BOOLEAN_EXPECTED) {
    expectedBoolean = required(formData, "expectedBoolean") === "true";
  }

  const nextVersion = (criterion.versions[0]?.version ?? 0) + 1;
  await prisma.$transaction(async (tx) => {
    const version = await tx.criterionVersion.create({
      data: {
        studyCriterionId: criterion.id,
        version: nextVersion,
        minValue,
        maxValue,
        expectedText,
        expectedBoolean,
        reason,
        authorId: user.id,
      },
    });
    await tx.studyCriterion.update({ where: { id: criterion.id }, data: { currentVersionId: version.id } });

    const sampleTests = await tx.sampleTest.findMany({
      where: { studyCriterionId: criterion.id, result: { isNot: null } },
      include: { result: true },
    });
    for (const sampleTest of sampleTests) {
      if (!sampleTest.result || sampleTest.result.state === "NOT_PERFORMED") continue;
      const currentEvaluation = evaluate(criterion.kind, { minValue, maxValue, expectedText, expectedBoolean }, sampleTest.result);
      await tx.testResult.update({ where: { id: sampleTest.result.id }, data: { currentEvaluation } });
    }

    await tx.auditEvent.create({
      data: {
        studyId: criterion.studyId,
        authorId: user.id,
        type: "CRITERION_CHANGED",
        message: `${criterion.testDefinition.name} · kryterium zmienione do v${nextVersion}. Powód: ${reason}`,
      },
    });
  });

  revalidatePath("/");
  revalidatePath("/lab");
  revalidatePath(`/studies/${criterion.studyId}`);
  redirect(`/studies/${criterion.studyId}#criteria`);
}

export async function interruptStudyAction(formData: FormData) {
  const user = await requireTechnologist();
  const studyId = required(formData, "studyId");
  const reason = required(formData, "reason");
  const study = await prisma.study.findUnique({ where: { id: studyId } });
  if (!study || study.status !== StudyStatus.ACTIVE) throw new Error("Przerwać można wyłącznie aktywne badanie.");
  await prisma.$transaction([
    prisma.study.update({ where: { id: studyId }, data: { status: StudyStatus.INTERRUPTED, interruptedAt: new Date(), interruptionReason: reason } }),
    prisma.auditEvent.create({ data: { studyId, authorId: user.id, type: "STUDY_INTERRUPTED", message: `Przerwano badanie. Powód: ${reason}` } }),
  ]);
  revalidatePath("/");
  revalidatePath("/studies");
  revalidatePath("/lab");
  redirect(`/studies/${studyId}`);
}
