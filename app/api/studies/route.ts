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
  if (value < 0) throw new Error(`Wartość nie może być ujemna: ${key}`);
  return value;
}

function rowCount(formData: FormData, key: string) {
  const parsed = Number(text(formData, key));
  if (!Number.isInteger(parsed) || parsed < 1) return 1;
  return Math.min(parsed, 100);
}

function dateValue(formData: FormData, key: string) {
  const raw = required(formData, key);
  const value = new Date(`${raw}T12:00:00`);
  if (Number.isNaN(value.getTime())) throw new Error(`Nieprawidłowa data: ${key}`);
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
    const productionDate = dateValue(formData, "productionDate");
    const startDate = dateValue(formData, "startDate");
    const aerosol = formData.get("aerosol") === "on";
    const gasType = aerosol ? required(formData, "gasType") : null;
    const gasWeightG = aerosol ? numberOrNull(formData, "gasWeightG") : null;
    const fillWeightG = numberOrNull(formData, "fillWeightG");
    const volumeMl = numberOrNull(formData, "volumeMl");
    const totalWeightG = fillWeightG != null && (!aerosol || gasWeightG != null) ? fillWeightG + (gasWeightG ?? 0) : null;
    const purpose = text(formData, "purpose") || null;
    const selectedCodes = criterionCatalog.filter((item) => formData.get(`criterion_${item.code}`) === "on").map((item) => item.code);
    const microbiologyScope = [...new Set(formData.getAll("microTests").map((item) => String(item).trim()).filter(Boolean))];

    const components = Array.from({ length: rowCount(formData, "componentCount") }, (_, index) => index + 1).map((index) => ({
      kind: text(formData, `componentKind_${index}`),
      code: text(formData, `componentCode_${index}`),
      name: text(formData, `componentName_${index}`),
      supplier: text(formData, `componentSupplier_${index}`),
    })).filter((row) => row.kind || row.code || row.name || row.supplier);
    for (const row of components) {
      if (!row.kind || !row.name) throw new Error("Każdy uzupełniony komponent musi mieć rodzaj i nazwę.");
    }

    const substances = Array.from({ length: rowCount(formData, "substanceCount") }, (_, index) => index + 1).map((index) => ({
      name: text(formData, `substanceName_${index}`),
      present: text(formData, `substancePresent_${index}`) !== "no",
      min: numberOrNull(formData, `substanceMin_${index}`),
      max: numberOrNull(formData, `substanceMax_${index}`),
      sortOrder: index,
    })).filter((row) => row.name || row.min != null || row.max != null);

    const seenSubstances = new Set<string>();
    for (const row of substances) {
      if (!row.name) throw new Error("Podaj nazwę każdej uzupełnionej substancji.");
      const normalized = row.name.toLocaleLowerCase("pl-PL");
      if (seenSubstances.has(normalized)) throw new Error(`Substancja „${row.name}” została dodana więcej niż raz.`);
      seenSubstances.add(normalized);
      if (row.present && (row.min == null || row.max == null || row.min > row.max)) throw new Error(`Podaj poprawny zakres dla substancji: ${row.name}.`);
    }

    if (selectedCodes.length === 0 && !substances.some((row) => row.present)) throw new Error("Wybierz co najmniej jedno kryterium akceptacji.");

    const year = new Date().getFullYear();
    const study = await prisma.$transaction(async (tx) => {
      const [standard, client, technologist, sourceDictionaryEntries] = await Promise.all([
        tx.stabilityStandard.findUnique({ where: { id: standardId } }),
        tx.client.findUnique({ where: { id: clientId } }),
        tx.user.findUnique({ where: { id: responsibleTechnologistId } }),
        tx.dictionaryEntry.findMany({
          where: { active: true, category: { in: ["appearance", "odor", "color", "spray", "crimp_width_setup", "crimp_height_setup", "microbiology", "component_kind", "gas_type", "study_purpose"] } },
          select: { category: true, value: true },
        }),
      ]);

      if (!standard || standard.status !== StandardStatus.ACTIVE) throw new Error("Wybrany standard nie jest aktywny.");
      if (!client || !client.active) throw new Error("Wybrany klient nie jest aktywny.");
      if (!technologist || !technologist.active || technologist.role !== UserRole.TECHNOLOGIST) throw new Error("Wybrany Technolog nie jest aktywny.");

      const dictionaryMap = new Map<string, Set<string>>();
      for (const entry of sourceDictionaryEntries) {
        const values = dictionaryMap.get(entry.category) ?? new Set<string>();
        values.add(entry.value);
        dictionaryMap.set(entry.category, values);
      }
      for (const value of microbiologyScope) {
        if (!dictionaryMap.get("microbiology")?.has(value)) throw new Error(`Nieaktywne badanie mikrobiologiczne: ${value}`);
      }
      for (const component of components) {
        if (!dictionaryMap.get("component_kind")?.has(component.kind)) throw new Error(`Nieaktywny rodzaj komponentu: ${component.kind}`);
      }
      if (gasType && !dictionaryMap.get("gas_type")?.has(gasType)) throw new Error("Wybierz aktywny rodzaj gazu ze słownika.");
      if (purpose && !dictionaryMap.get("study_purpose")?.has(purpose)) throw new Error("Wybierz aktywny cel testów ze słownika.");

      await tx.$queryRawUnsafe<Array<{ locked: number }>>("SELECT 1 AS locked FROM pg_advisory_xact_lock($1)", year);
      const prefix = `ES-${year}-`;
      const latest = await tx.study.findFirst({ where: { studyNumber: { startsWith: prefix } }, orderBy: { studyNumber: "desc" }, select: { studyNumber: true } });
      const lastSequence = latest ? Number(latest.studyNumber.slice(-4)) || 0 : 0;
      const studyNumber = `${prefix}${String(lastSequence + 1).padStart(4, "0")}`;

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
          gasType,
          gasWeightG,
          fillWeightG,
          totalWeightG,
          volumeMl,
          internalTest: text(formData, "testType") !== "customer",
          purpose,
          status: StudyStatus.DRAFT,
          standardId,
        },
      });

      if (components.length) {
        await tx.studyComponent.createMany({ data: components.map((row) => ({ studyId: created.id, kind: row.kind, code: row.code || null, name: row.name, supplier: row.supplier || null })) });
      }
      if (microbiologyScope.length) {
        await tx.studyComponent.createMany({ data: microbiologyScope.map((name, index) => ({ studyId: created.id, kind: "Badanie mikrobiologiczne", code: `MICRO-${String(index + 1).padStart(2, "0")}`, name })) });
      }
      if (substances.length) {
        await tx.studySubstance.createMany({ data: substances.map((row) => ({ studyId: created.id, name: row.name, present: row.present, minValue: row.present ? row.min : null, maxValue: row.present ? row.max : null, sortOrder: row.sortOrder })) });
      }

      const definitions = await tx.testDefinition.findMany({ where: { active: true, code: { in: selectedCodes } } });
      const definitionMap = new Map(definitions.map((definition) => [definition.code, definition]));
      for (const item of criterionCatalog.filter((catalogItem) => selectedCodes.includes(catalogItem.code))) {
        const definition = definitionMap.get(item.code);
        if (!definition) throw new Error(`Brakuje aktywnej definicji badania: ${item.label}.`);

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
          if (!item.dictionaryKey || !dictionaryMap.get(item.dictionaryKey)?.has(expectedText)) throw new Error(`Wybierz aktywną wartość słownikową dla: ${item.label}.`);
        } else if (item.input === "boolean") {
          kind = CriterionKind.BOOLEAN_EXPECTED;
          expectedBoolean = true;
        } else {
          kind = CriterionKind.RANGE;
          const preset = required(formData, `${item.code}_preset`);
          if (!item.dictionaryKey || !dictionaryMap.get(item.dictionaryKey)?.has(preset)) throw new Error(`Wybierz aktywną konfigurację dla: ${item.label}.`);
          const parsed = preset === "INNE" ? null : parsePresetRange(preset);
          minValue = parsed?.min ?? numberOrNull(formData, `${item.code}_min`);
          maxValue = parsed?.max ?? numberOrNull(formData, `${item.code}_max`);
          expectedText = preset;
          if (minValue == null || maxValue == null || minValue > maxValue) throw new Error(`Podaj poprawny zakres dla: ${item.label}.`);
        }

        const criterion = await tx.studyCriterion.create({ data: { studyId: created.id, testDefinitionId: definition.id, kind } });
        const version = await tx.criterionVersion.create({ data: { studyCriterionId: criterion.id, version: 1, minValue, maxValue, expectedText, expectedBoolean, authorId: user.id } });
        await tx.studyCriterion.update({ where: { id: criterion.id }, data: { currentVersionId: version.id } });
      }

      for (const row of substances.filter((item) => item.present)) {
        const code = substanceCode(row.name);
        const definition = await tx.testDefinition.upsert({
          where: { code },
          update: { name: `Zawartość: ${row.name}`, category: "Zawartość substancji", valueType: TestValueType.NUMBER, unit: "%", active: true },
          create: { code, name: `Zawartość: ${row.name}`, category: "Zawartość substancji", valueType: TestValueType.NUMBER, unit: "%", active: true, sortOrder: 1000 },
        });
        const criterion = await tx.studyCriterion.create({ data: { studyId: created.id, testDefinitionId: definition.id, kind: CriterionKind.RANGE } });
        const version = await tx.criterionVersion.create({ data: { studyCriterionId: criterion.id, version: 1, minValue: row.min, maxValue: row.max, expectedText: row.name, authorId: user.id } });
        await tx.studyCriterion.update({ where: { id: criterion.id }, data: { currentVersionId: version.id } });
      }

      await tx.auditEvent.create({ data: { studyId: created.id, authorId: user.id, type: "STUDY_CREATED", message: `Utworzono zlecenie ${studyNumber}.` } });
      return created;
    });

    return NextResponse.redirect(new URL(`/studies/${study.id}`, publicOrigin(request)), 303);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Nie udało się utworzyć zlecenia.";
    return NextResponse.redirect(new URL(`/studies/new?error=${encodeURIComponent(message)}`, publicOrigin(request)), 303);
  }
}
