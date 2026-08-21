import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { CriterionKind, StandardStatus, StudyStatus, TestValueType, UserRole } from "@/generated/prisma/client";
import { criterionCatalog, parsePresetRange } from "@/lib/criterion-catalog";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { publicUrl } from "@/lib/request-origin";

function text(form: FormData, key: string) {
  return String(form.get(key) ?? "").trim();
}

function numberOrNull(form: FormData, key: string) {
  const raw = text(form, key).replace(",", ".");
  if (!raw) return null;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`Nieprawidłowa liczba: ${key}`);
  if (value < 0) throw new Error(`Wartość nie może być ujemna: ${key}`);
  return value;
}

function dateValue(form: FormData, key: string) {
  const raw = text(form, key);
  if (!raw) throw new Error(`Brak daty: ${key}`);
  const value = new Date(`${raw}T12:00:00`);
  if (Number.isNaN(value.getTime())) throw new Error(`Nieprawidłowa data: ${key}`);
  return value;
}

function substanceCode(name: string) {
  return `SUBSTANCE_${createHash("sha1").update(name.trim().toLocaleLowerCase("pl-PL")).digest("hex").slice(0, 12).toUpperCase()}`;
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || (user.role !== UserRole.TECHNOLOGIST && user.role !== UserRole.ADMIN)) {
    return NextResponse.json({ error: "Brak uprawnień." }, { status: 403 });
  }

  const { id } = await params;
  const form = await request.formData();
  const study = await prisma.study.findUnique({ where: { id } });
  if (!study || study.status !== StudyStatus.DRAFT) return NextResponse.redirect(publicUrl(request, `/studies/${id}`), 303);

  try {
    const projectName = text(form, "projectName");
    const clientId = text(form, "clientId");
    const responsibleTechnologistId = text(form, "responsibleTechnologistId");
    const standardId = text(form, "standardId");
    if (!projectName || !clientId || !responsibleTechnologistId || !standardId) throw new Error("Uzupełnij wymagane dane zlecenia.");

    const productionDate = dateValue(form, "productionDate");
    const startDate = dateValue(form, "startDate");
    const aerosol = form.get("aerosol") === "on";
    const gasWeightG = aerosol ? numberOrNull(form, "gasWeightG") : null;
    const fillWeightG = numberOrNull(form, "fillWeightG");
    const volumeMl = numberOrNull(form, "volumeMl");
    const totalWeightG = fillWeightG != null && (!aerosol || gasWeightG != null) ? fillWeightG + (gasWeightG ?? 0) : null;

    const selectedCodes = criterionCatalog.filter((item) => form.get(`criterion_${item.code}`) === "on").map((item) => item.code);
    const microScope = [...new Set(form.getAll("microTests").map((entry) => String(entry).trim()).filter(Boolean))];
    const components = Array.from({ length: 5 }, (_, index) => index + 1).map((index) => ({
      kind: text(form, `componentKind_${index}`),
      code: text(form, `componentCode_${index}`),
      name: text(form, `componentName_${index}`),
      supplier: text(form, `componentSupplier_${index}`),
    })).filter((row) => row.kind || row.code || row.name || row.supplier);
    for (const row of components) {
      if (!row.kind || !row.name) throw new Error("Każdy uzupełniony komponent musi mieć rodzaj i nazwę.");
    }

    const substances = Array.from({ length: 5 }, (_, index) => index + 1).map((index) => ({
      name: text(form, `substanceName_${index}`),
      min: numberOrNull(form, `substanceMin_${index}`),
      max: numberOrNull(form, `substanceMax_${index}`),
    })).filter((row) => row.name || row.min != null || row.max != null);
    if (!selectedCodes.length && !substances.length) throw new Error("Wybierz co najmniej jedno kryterium akceptacji.");
    for (const row of substances) {
      if (!row.name || row.min == null || row.max == null || row.min > row.max) throw new Error("Podaj nazwę i poprawny zakres dla każdej substancji.");
    }

    await prisma.$transaction(async (tx) => {
      const [client, technologist, standard, sourceDictionaryEntries] = await Promise.all([
        tx.client.findUnique({ where: { id: clientId } }),
        tx.user.findUnique({ where: { id: responsibleTechnologistId } }),
        tx.stabilityStandard.findUnique({ where: { id: standardId } }),
        tx.dictionaryEntry.findMany({
          where: { active: true, category: { in: ["appearance", "odor", "color", "spray", "crimp_width_setup", "crimp_height_setup", "microbiology", "component_kind"] } },
          select: { category: true, value: true },
        }),
      ]);

      if (!client || (!client.active && client.id !== study.clientId)) throw new Error("Wybrany klient nie jest dostępny.");
      if (!technologist || !technologist.active || technologist.role !== UserRole.TECHNOLOGIST) throw new Error("Wybrany Technolog nie jest aktywny.");
      if (!standard || standard.status !== StandardStatus.ACTIVE) throw new Error("Wybrany standard nie jest aktywny.");

      const dictionaryMap = new Map<string, Set<string>>();
      for (const entry of sourceDictionaryEntries) {
        const values = dictionaryMap.get(entry.category) ?? new Set<string>();
        values.add(entry.value);
        dictionaryMap.set(entry.category, values);
      }
      for (const value of microScope) {
        if (!dictionaryMap.get("microbiology")?.has(value)) throw new Error(`Nieaktywne badanie mikrobiologiczne: ${value}`);
      }
      for (const component of components) {
        if (!dictionaryMap.get("component_kind")?.has(component.kind)) throw new Error(`Nieaktywny rodzaj komponentu: ${component.kind}`);
      }

      await tx.study.update({
        where: { id },
        data: {
          projectName,
          clientId,
          responsibleTechnologistId,
          standardId,
          etsNumber: text(form, "etsNumber") || null,
          productionDate,
          startDate,
          aerosol,
          gasType: aerosol ? text(form, "gasType") || null : null,
          gasWeightG,
          fillWeightG,
          totalWeightG,
          volumeMl,
          internalTest: text(form, "testType") !== "customer",
          purpose: text(form, "purpose") || null,
        },
      });

      await tx.studyComponent.deleteMany({ where: { studyId: id } });
      const componentData = [
        ...components.map((row) => ({ studyId: id, kind: row.kind, code: row.code || null, name: row.name, supplier: row.supplier || null })),
        ...microScope.map((name, index) => ({ studyId: id, kind: "Badanie mikrobiologiczne", code: `MICRO-${String(index + 1).padStart(2, "0")}`, name, supplier: null })),
      ];
      if (componentData.length) await tx.studyComponent.createMany({ data: componentData });

      await tx.studyCriterion.deleteMany({ where: { studyId: id } });

      const definitions = await tx.testDefinition.findMany({ where: { active: true, code: { in: selectedCodes } } });
      const definitionMap = new Map(definitions.map((definition) => [definition.code, definition]));
      for (const item of criterionCatalog.filter((catalogItem) => selectedCodes.includes(catalogItem.code))) {
        const definition = definitionMap.get(item.code);
        if (!definition) throw new Error(`Brakuje aktywnej definicji badania: ${item.label}`);

        let kind: CriterionKind;
        let minValue: number | null = null;
        let maxValue: number | null = null;
        let expectedText: string | null = null;
        let expectedBoolean: boolean | null = null;

        if (item.input === "range") {
          kind = CriterionKind.RANGE;
          minValue = numberOrNull(form, `${item.code}_min`);
          maxValue = numberOrNull(form, `${item.code}_max`);
          if (minValue == null || maxValue == null || minValue > maxValue) throw new Error(`Nieprawidłowy zakres: ${item.label}`);
        } else if (item.input === "minimum") {
          kind = CriterionKind.MINIMUM;
          minValue = numberOrNull(form, `${item.code}_min`);
          if (minValue == null) throw new Error(`Brak minimum: ${item.label}`);
        } else if (item.input === "expected") {
          kind = CriterionKind.EXPECTED_VALUE;
          expectedText = text(form, `${item.code}_expected`);
          if (!expectedText || !item.dictionaryKey || !dictionaryMap.get(item.dictionaryKey)?.has(expectedText)) throw new Error(`Wybierz aktywną wartość słownikową dla: ${item.label}`);
        } else if (item.input === "boolean") {
          kind = CriterionKind.BOOLEAN_EXPECTED;
          expectedBoolean = true;
        } else {
          kind = CriterionKind.RANGE;
          const preset = text(form, `${item.code}_preset`);
          if (!preset || !item.dictionaryKey || !dictionaryMap.get(item.dictionaryKey)?.has(preset)) throw new Error(`Wybierz aktywną konfigurację dla: ${item.label}`);
          const parsed = preset === "INNE" ? null : parsePresetRange(preset);
          minValue = parsed?.min ?? numberOrNull(form, `${item.code}_min`);
          maxValue = parsed?.max ?? numberOrNull(form, `${item.code}_max`);
          expectedText = preset;
          if (minValue == null || maxValue == null || minValue > maxValue) throw new Error(`Nieprawidłowy zakres: ${item.label}`);
        }

        const criterion = await tx.studyCriterion.create({ data: { studyId: id, testDefinitionId: definition.id, kind } });
        const version = await tx.criterionVersion.create({ data: { studyCriterionId: criterion.id, version: 1, minValue, maxValue, expectedText, expectedBoolean, authorId: user.id } });
        await tx.studyCriterion.update({ where: { id: criterion.id }, data: { currentVersionId: version.id } });
      }

      for (const row of substances) {
        const code = substanceCode(row.name);
        const definition = await tx.testDefinition.upsert({
          where: { code },
          update: { name: `Zawartość: ${row.name}`, category: "Zawartość substancji", valueType: TestValueType.NUMBER, unit: "%", active: true },
          create: { code, name: `Zawartość: ${row.name}`, category: "Zawartość substancji", valueType: TestValueType.NUMBER, unit: "%", active: true, sortOrder: 1000 },
        });
        const criterion = await tx.studyCriterion.create({ data: { studyId: id, testDefinitionId: definition.id, kind: CriterionKind.RANGE } });
        const version = await tx.criterionVersion.create({ data: { studyCriterionId: criterion.id, version: 1, minValue: row.min, maxValue: row.max, expectedText: row.name, authorId: user.id } });
        await tx.studyCriterion.update({ where: { id: criterion.id }, data: { currentVersionId: version.id } });
      }

      await tx.auditEvent.create({ data: { studyId: id, authorId: user.id, type: "DRAFT_UPDATED", message: "Zaktualizowano dane i pełny zakres zlecenia roboczego." } });
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Nie udało się zapisać zmian.";
    return NextResponse.redirect(publicUrl(request, `/studies/${id}/edit?error=${encodeURIComponent(message)}`), 303);
  }

  return NextResponse.redirect(publicUrl(request, `/studies/${id}?saved=draft`), 303);
}
