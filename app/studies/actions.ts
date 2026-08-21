"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  CriterionKind,
  SampleExecutionStatus,
  SampleRole,
  StandardStatus,
  StudyStatus,
  UserRole,
} from "@/generated/prisma/client";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const DAY = 24 * 60 * 60 * 1000;

function requiredString(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();
  if (!value) throw new Error(`Brak wymaganego pola: ${key}`);
  return value;
}

function optionalNumber(formData: FormData, key: string) {
  const raw = String(formData.get(key) ?? "").trim();
  if (!raw) return null;
  const value = Number(raw.replace(",", "."));
  if (!Number.isFinite(value)) throw new Error(`Nieprawidłowa liczba: ${key}`);
  return value;
}

async function requireTechnologist() {
  const user = await requireUser();
  if (user.role !== UserRole.TECHNOLOGIST && user.role !== UserRole.ADMIN) {
    throw new Error("Ta operacja jest dostępna wyłącznie dla Technologa lub Administratora.");
  }
  return user;
}

export async function createStudyAction(formData: FormData) {
  const user = await requireTechnologist();
  const projectName = requiredString(formData, "projectName");
  const clientId = requiredString(formData, "clientId");
  const responsibleTechnologistId = requiredString(formData, "responsibleTechnologistId");
  const standardId = requiredString(formData, "standardId");
  const productionDate = new Date(requiredString(formData, "productionDate") + "T12:00:00");
  const startDate = new Date(requiredString(formData, "startDate") + "T12:00:00");
  const aerosol = formData.get("aerosol") === "on";
  const year = new Date().getFullYear();

  const selectedCodes = ["PH", "DENSITY", "APPEARANCE", "ODOR"].filter((code) => formData.get(`criterion_${code}`) === "on");
  if (selectedCodes.length === 0) throw new Error("Wybierz co najmniej jedno kryterium akceptacji.");

  const study = await prisma.$transaction(async (tx) => {
    await tx.$queryRawUnsafe("SELECT pg_advisory_xact_lock($1)", year);
    const prefix = `ES-${year}-`;
    const latest = await tx.study.findFirst({
      where: { studyNumber: { startsWith: prefix } },
      orderBy: { studyNumber: "desc" },
      select: { studyNumber: true },
    });
    const lastSequence = latest ? Number(latest.studyNumber.slice(-4)) || 0 : 0;
    const studyNumber = `${prefix}${String(lastSequence + 1).padStart(4, "0")}`;

    const standard = await tx.stabilityStandard.findUnique({ where: { id: standardId } });
    if (!standard || standard.status !== StandardStatus.ACTIVE) throw new Error("Wybrany standard nie jest aktywny.");

    const created = await tx.study.create({
      data: {
        studyNumber,
        projectName,
        clientId,
        etsNumber: String(formData.get("etsNumber") ?? "").trim() || null,
        productionDate,
        startDate,
        responsibleTechnologistId,
        createdById: user.id,
        aerosol,
        gasType: aerosol ? String(formData.get("gasType") ?? "").trim() || null : null,
        gasWeightG: aerosol ? optionalNumber(formData, "gasWeightG") : null,
        fillWeightG: optionalNumber(formData, "fillWeightG"),
        totalWeightG: optionalNumber(formData, "totalWeightG"),
        volumeMl: optionalNumber(formData, "volumeMl"),
        internalTest: formData.get("testType") !== "customer",
        purpose: String(formData.get("purpose") ?? "").trim() || null,
        status: StudyStatus.DRAFT,
        standardId,
      },
    });

    const componentRows = [1, 2, 3]
      .map((index) => ({
        kind: String(formData.get(`componentKind_${index}`) ?? "").trim(),
        code: String(formData.get(`componentCode_${index}`) ?? "").trim(),
        name: String(formData.get(`componentName_${index}`) ?? "").trim(),
        supplier: String(formData.get(`componentSupplier_${index}`) ?? "").trim(),
      }))
      .filter((row) => row.kind && row.name);

    if (componentRows.length) {
      await tx.studyComponent.createMany({
        data: componentRows.map((row) => ({
          studyId: created.id,
          kind: row.kind,
          code: row.code || null,
          name: row.name,
          supplier: row.supplier || null,
        })),
      });
    }

    const definitions = await tx.testDefinition.findMany({ where: { code: { in: selectedCodes } } });
    for (const definition of definitions) {
      let kind: CriterionKind = CriterionKind.EXPECTED_VALUE;
      let minValue: number | null = null;
      let maxValue: number | null = null;
      let expectedText: string | null = null;

      if (definition.code === "PH" || definition.code === "DENSITY") {
        kind = CriterionKind.RANGE;
        minValue = optionalNumber(formData, `${definition.code}_min`);
        maxValue = optionalNumber(formData, `${definition.code}_max`);
        if (minValue === null || maxValue === null) throw new Error(`Podaj zakres dla ${definition.name}.`);
      } else {
        expectedText = requiredString(formData, `${definition.code}_expected`);
      }

      const criterion = await tx.studyCriterion.create({
        data: { studyId: created.id, testDefinitionId: definition.id, kind },
      });
      const version = await tx.criterionVersion.create({
        data: {
          studyCriterionId: criterion.id,
          version: 1,
          minValue,
          maxValue,
          expectedText,
          authorId: user.id,
        },
      });
      await tx.studyCriterion.update({ where: { id: criterion.id }, data: { currentVersionId: version.id } });
    }

    await tx.auditEvent.create({
      data: { studyId: created.id, authorId: user.id, type: "STUDY_CREATED", message: `Utworzono zlecenie ${studyNumber}.` },
    });
    return created;
  });

  redirect(`/studies/${study.id}`);
}

export async function handoverStudyAction(formData: FormData) {
  const user = await requireTechnologist();
  const studyId = requiredString(formData, "studyId");

  await prisma.$transaction(async (tx) => {
    const study = await tx.study.findUnique({
      where: { id: studyId },
      include: {
        standard: { include: { definitions: { orderBy: { sortOrder: "asc" } } } },
        criteria: true,
        samples: true,
      },
    });
    if (!study) throw new Error("Nie znaleziono zlecenia.");
    if (study.status !== StudyStatus.DRAFT) throw new Error("Do Laboratorium można przekazać wyłącznie zlecenie robocze.");
    if (!study.standard || study.standard.status !== StandardStatus.ACTIVE) throw new Error("Zlecenie nie ma aktywnego standardu.");
    if (study.samples.length) throw new Error("Próbki dla tego zlecenia zostały już wygenerowane.");

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const startDay = new Date(study.startDate);
    startDay.setHours(0, 0, 0, 0);
    if (startDay < today) throw new Error("Data rozpoczęcia testów nie może być wcześniejsza niż dzień przekazania do Laboratorium.");

    const measurementTests = await tx.testDefinition.findMany({ where: { code: { in: ["WEIGHT", "PRESSURE"] } } });
    const weight = measurementTests.find((test) => test.code === "WEIGHT");
    const pressure = measurementTests.find((test) => test.code === "PRESSURE");
    if (!weight || (study.aerosol && !pressure)) throw new Error("Brakuje definicji pomiarów bazowych.");

    for (const definition of study.standard.definitions) {
      const quantity = Math.max(definition.quantity, 1);
      for (let i = 0; i < quantity; i++) {
        const code = quantity === 1 ? definition.code : `${definition.code}-${i + 1}`;
        const sample = await tx.sample.create({
          data: {
            studyId: study.id,
            code,
            role: definition.role,
            checkpointLabel: definition.checkpointLabel,
            checkpointDays: definition.checkpointDays,
            nominalDate: definition.checkpointDays === null ? null : new Date(study.startDate.getTime() + definition.checkpointDays * DAY),
            storageCondition: definition.storageCondition,
            position: definition.position,
            referenceStatus: definition.role === SampleRole.REFERENCE ? "AVAILABLE" : null,
            executionStatus: SampleExecutionStatus.NOT_STARTED,
          },
        });

        await tx.initialMeasurement.create({ data: { sampleId: sample.id } });

        if (definition.role === SampleRole.STANDARD) {
          await tx.sampleTest.create({ data: { sampleId: sample.id, testDefinitionId: weight.id, sortOrder: 1 } });
          let sortOrder = 2;
          if (study.aerosol && pressure) {
            await tx.sampleTest.create({ data: { sampleId: sample.id, testDefinitionId: pressure.id, sortOrder: sortOrder++ } });
          }
          for (const criterion of study.criteria) {
            await tx.sampleTest.create({
              data: {
                sampleId: sample.id,
                testDefinitionId: criterion.testDefinitionId,
                studyCriterionId: criterion.id,
                sortOrder: sortOrder++,
              },
            });
          }
        }
      }
    }

    await tx.stabilityStandard.update({ where: { id: study.standard.id }, data: { locked: true } });
    await tx.study.update({ where: { id: study.id }, data: { status: StudyStatus.ACTIVE, handedToLabAt: new Date() } });
    await tx.auditEvent.create({
      data: { studyId: study.id, authorId: user.id, type: "HANDED_TO_LAB", message: "Przekazano zlecenie do Laboratorium i wygenerowano komplet próbek." },
    });
  });

  revalidatePath("/");
  revalidatePath("/studies");
  revalidatePath(`/studies/${studyId}`);
  revalidatePath("/lab");
}

export async function cancelStudyAction(formData: FormData) {
  const user = await requireTechnologist();
  const studyId = requiredString(formData, "studyId");
  const reason = requiredString(formData, "reason");
  const study = await prisma.study.findUnique({ where: { id: studyId } });
  if (!study || study.status !== StudyStatus.DRAFT) throw new Error("Anulować można wyłącznie zlecenie robocze.");
  await prisma.$transaction([
    prisma.study.update({ where: { id: studyId }, data: { status: StudyStatus.CANCELLED, cancelledAt: new Date(), cancellationReason: reason } }),
    prisma.auditEvent.create({ data: { studyId, authorId: user.id, type: "STUDY_CANCELLED", message: `Anulowano zlecenie. Powód: ${reason}` } }),
  ]);
  revalidatePath("/studies");
  redirect(`/studies/${studyId}`);
}
