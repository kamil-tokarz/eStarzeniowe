import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { CriterionKind, StandardStatus, StudyStatus, TestValueType, UserRole } from "@/generated/prisma/client";
import { criterionCatalog, parsePresetRange } from "@/lib/criterion-catalog";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function required(formData: FormData, key: string) {
  const value = text(formData, key);
  if (!value) throw new Error(`Brak wymaganego pola: ${key}`);
  return value;
}

function numberOrNull(formData: FormData, key: string) {
  const raw = text(formData, key).replace(",", ".");
  if (!raw) return null;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`Nieprawidłowa wartość: ${key}`);
  return value;
}

function publicOrigin(request: NextRequest) {
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  if (forwardedHost) return `${forwardedProto || "https"}://${forwardedHost}`;
  return request.nextUrl.origin;
}

function substanceCode(name: string) {
  return `SUBSTANCE_${createHash("sha1").update(name.trim().toLocaleLowerCase("pl-PL")).digest("hex").slice(0, 12).toUpperCase()}`;
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || (user.role !== UserRole.TECHNOLOGIST && user.role !== UserRole.ADMIN)) {
    return NextResponse.json({ error: "Zlecenie może utworzyć Technolog lub Administrator." }, { status: 403 });
  }

  const formData = await request.formData();
  try {
    const projectName = required(formData, "projectName");
    const clientId = required(formData, "clientId");
    const responsibleTechnologistId = required(formData, "responsibleTechnologistId");
    const standardId = required(formData, "standardId");
    const productionDate = new Date(`${required(formData, "productionDate")}T12:00:00`);
    const startDate = new Date(`${required(formData, "startDate")}T12:00:00`);
    const aerosol = formData.get("aerosol") === "on";
    const selectedCodes = criterionCatalog.filter((item) => formData.get(`criterion_${item.code}`) === "on").map((item) => item.code);
    const microbiologyScope = formData.getAll("microTests").map((item) => String(item).trim()).filter(Boolean);

    const substances = Array.from({ length: 5 }, (_, index) => index + 1).map((index) => ({
      name: text(formData, `substanceName_${index}`),
      min: numberOrNull(formData, `substanceMin_${index}`),
      max: numberOrNull(formData, `substanceMax_${index}`),
    })).filter((row) => row.name);

    if (selectedCodes.length === 0 && substances.length === 0) throw new Error("Wybierz co najmniej jedno kryterium akceptacji.");
    for (const row of substances) {
      if (row.min == null || row.max == null || row.min > row.max) throw new Error(`Podaj poprawny zakres dla substancji: ${row.name}.`);
    }

    const year = new Date().getFullYear();
    const study = await prisma.$transaction(async (tx) => {
      await tx.$queryRawUnsafe("SELECT pg_advisory_xact_lock($1)", year);
      const prefix = `ES-${year}-`;
      const latest = await tx.study.findFirst({ where: { studyNumber: { startsWith: prefix } }, orderBy: { studyNumber: "desc" }, select: { studyNumber: true } });
      const lastSequence = latest ? Number(latest.studyNumber.slice(-4)) || 0 : 0;
      const studyNumber = `${prefix}${String(lastSequence + 1).padStart(4, "0")}`;

      const standard = await tx.stabilityStandard.findUnique({ where: { id: standardId } });
      if (!standard || standard.status !== StandardStatus.ACTIVE) throw new Error("Wybrany standard nie jest aktywny.");

      const created = await tx.study.create({
        data: {
          studyNumber,
          projectName,
          clientId,
          etsNumber: text(formData, "etsNumber") || null,
          productionDate,
          startDate,
          responsibleTechnologistId,
          createdById: user.id,
          aerosol,
          gasType: aerosol ? text(formData, "gasType") || null : null,
          gasWeightG: aerosol ? numberOrNull(formData, "gasWeightG") : null,
          fillWeightG: numberOrNull(formData, "fillWeightG"),
          totalWeightG: numberOrNull(formData, "totalWeightG"),
          volumeMl: numberOrNull(formData, "volumeMl"),
          internalTest: text(formData, "testType") !== "customer",
          purpose: text(formData, "purpose") || null,
          status: StudyStatus.DRAFT,
          standardId,
        },
      });

      const components = Array.from({ length: 5 }, (_, index) => index + 1).map((index) => ({
        kind: text(formData, `componentKind_${index}`),
        code: text(formData, `componentCode_${index}`),
        name: text(formData, `componentName_${index}`),
        supplier: text(formData, `componentSupplier_${index}`),
      })).filter((row) => row.kind && row.name);
      if (components.length) {
        await tx.studyComponent.createMany({
          data: components.map((row) => ({ studyId: created.id, kind: row.kind, code: row.code || null, name: row.name, supplier: row.supplier || null })),
        });
      }
      if (microbiologyScope.length) {
        await tx.studyComponent.createMany({
          data: microbiologyScope.map((name, index) => ({ studyId: created.id, kind: "Badanie mikrobiologiczne", code: `MICRO-${String(index + 1).padStart(2, "0")}`, name })),
        });
      }

      const definitions = await tx.testDefinition.findMany({ where: { code: { in: selectedCodes } } });
      const definitionMap = new Map(definitions.map((definition) => [definition.code, definition]));
      for (const item of criterionCatalog.filter((catalogItem) => selectedCodes.includes(catalogItem.code))) {
        const definition = definitionMap.get(item.code);
        if (!definition) throw new Error(`Brakuje definicji badania: ${item.label}.`);

        let kind: CriterionKind;
        let minValue: number | null = null;
        let maxValue: number | null = null;
        let expectedText: string | null = null;
        let expectedBoolean: boolean | null = null;

        if (item.input === "range") {
          kind = CriterionKind.RANGE;
          minValue = numberOrNull(formData, `${item.code}_min`);
          maxValue = numberOrNull(formData, `${item.code}_max`);
          if (minValue == null || maxValue == null || minValue > maxValue) throw new Error(`Podaj poprawny zakres dla: ${item.label}.`);
        } else if (item.input === "minimum") {
          kind = CriterionKind.MINIMUM;
          minValue = numberOrNull(formData, `${item.code}_min`);
          if (minValue == null) throw new Error(`Podaj minimum dla: ${item.label}.`);
        } else if (item.input === "expected") {
          kind = CriterionKind.EXPECTED_VALUE;
          expectedText = required(formData, `${item.code}_expected`);
        } else if (item.input === "boolean") {
          kind = CriterionKind.BOOLEAN_EXPECTED;
          expectedBoolean = true;
        } else {
          kind = CriterionKind.RANGE;
          const preset = required(formData, `${item.code}_preset`);
          const parsed = preset === "INNE" ? null : parsePresetRange(preset);
          minValue = parsed?.min ?? numberOrNull(formData, `${item.code}_min`);
          maxValue = parsed?.max ?? numberOrNull(formData, `${item.code}_max`);
          expectedText = preset;
          if (minValue == null || maxValue == null || minValue > maxValue) throw new Error(`Podaj poprawny zakres dla: ${item.label}.`);
        }

        const criterion = await tx.studyCriterion.create({ data: { studyId: created.id, testDefinitionId: definition.id, kind } });
        const version = await tx.criterionVersion.create({
          data: { studyCriterionId: criterion.id, version: 1, minValue, maxValue, expectedText, expectedBoolean, authorId: user.id },
        });
        await tx.studyCriterion.update({ where: { id: criterion.id }, data: { currentVersionId: version.id } });
      }

      for (const row of substances) {
        const code = substanceCode(row.name);
        const definition = await tx.testDefinition.upsert({
          where: { code },
          update: { name: `Zawartość: ${row.name}`, category: "Zawartość substancji", valueType: TestValueType.NUMBER, unit: "%", active: true },
          create: { code, name: `Zawartość: ${row.name}`, category: "Zawartość substancji", valueType: TestValueType.NUMBER, unit: "%", active: true, sortOrder: 1000 },
        });
        const criterion = await tx.studyCriterion.create({ data: { studyId: created.id, testDefinitionId: definition.id, kind: CriterionKind.RANGE } });
        const version = await tx.criterionVersion.create({
          data: { studyCriterionId: criterion.id, version: 1, minValue: row.min, maxValue: row.max, expectedText: row.name, authorId: user.id },
        });
        await tx.studyCriterion.update({ where: { id: criterion.id }, data: { currentVersionId: version.id } });
      }

      await tx.auditEvent.create({ data: { studyId: created.id, authorId: user.id, type: "STUDY_CREATED", message: `Utworzono zlecenie ${studyNumber}.` } });
      return created;
    });

    return NextResponse.redirect(new URL(`/studies/${study.id}`, publicOrigin(request)), 303);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Nie udało się utworzyć zlecenia." }, { status: 400 });
  }
}
