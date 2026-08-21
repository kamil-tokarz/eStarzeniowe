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
  if (!user || (user.role !== UserRole.TECHNOLOGIST && user.role !== UserRole.ADMIN)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const form = await request.formData();
  const study = await prisma.study.findUnique({ where: { id } });
  if (!study || study.status !== StudyStatus.DRAFT) return NextResponse.redirect(publicUrl(request, `/studies/${id}`), 303);

  const projectName = text(form, "projectName");
  const clientId = text(form, "clientId");
  const responsibleTechnologistId = text(form, "responsibleTechnologistId");
  const standardId = text(form, "standardId");
  if (!projectName || !clientId || !responsibleTechnologistId || !standardId) return NextResponse.redirect(publicUrl(request, `/studies/${id}/edit?error=missing`), 303);

  const [client, technologist, standard] = await Promise.all([
    prisma.client.findUnique({ where: { id: clientId } }),
    prisma.user.findUnique({ where: { id: responsibleTechnologistId } }),
    prisma.stabilityStandard.findUnique({ where: { id: standardId } }),
  ]);
  if (!client || (!client.active && client.id !== study.clientId)) return NextResponse.redirect(publicUrl(request, `/studies/${id}/edit?error=client`), 303);
  if (!technologist || !technologist.active || technologist.role !== UserRole.TECHNOLOGIST) return NextResponse.redirect(publicUrl(request, `/studies/${id}/edit?error=technologist`), 303);
  if (!standard || standard.status !== StandardStatus.ACTIVE) return NextResponse.redirect(publicUrl(request, `/studies/${id}/edit?error=standard`), 303);

  const selectedCodes = criterionCatalog.filter((item) => form.get(`criterion_${item.code}`) === "on").map((item) => item.code);
  const microScope = form.getAll("microTests").map((entry) => String(entry).trim()).filter(Boolean);
  const substances = Array.from({ length: 5 }, (_, index) => index + 1).map((index) => ({
    name: text(form, `substanceName_${index}`),
    min: numberOrNull(form, `substanceMin_${index}`),
    max: numberOrNull(form, `substanceMax_${index}`),
  })).filter((row) => row.name);
  if (!selectedCodes.length && !substances.length) return NextResponse.redirect(publicUrl(request, `/studies/${id}/edit?error=criteria`), 303);

  try {
    for (const row of substances) {
      if (row.min == null || row.max == null || row.min > row.max) throw new Error(`Nieprawidłowy zakres: ${row.name}`);
    }

    await prisma.$transaction(async (tx) => {
      const aerosol = form.get("aerosol") === "on";
      await tx.study.update({
        where: { id },
        data: {
          projectName,
          clientId,
          responsibleTechnologistId,
          standardId,
          etsNumber: text(form, "etsNumber") || null,
          productionDate: dateValue(form, "productionDate"),
          startDate: dateValue(form, "startDate"),
          aerosol,
          gasType: aerosol ? text(form, "gasType") || null : null,
          gasWeightG: aerosol ? numberOrNull(form, "gasWeightG") : null,
          fillWeightG: numberOrNull(form, "fillWeightG"),
          totalWeightG: numberOrNull(form, "totalWeightG"),
          volumeMl: numberOrNull(form, "volumeMl"),
          internalTest: text(form, "testType") !== "customer",
          purpose: text(form, "purpose") || null,
        },
      });

      await tx.studyComponent.deleteMany({ where: { studyId: id } });
      const components = Array.from({ length: 5 }, (_, index) => index + 1).map((index) => ({
        kind: text(form, `componentKind_${index}`),
        code: text(form, `componentCode_${index}`),
        name: text(form, `componentName_${index}`),
        supplier: text(form, `componentSupplier_${index}`),
      })).filter((row) => row.kind && row.name);
      const componentData = [
        ...components.map((row) => ({ studyId: id, kind: row.kind, code: row.code || null, name: row.name, supplier: row.supplier || null })),
        ...microScope.map((name, index) => ({ studyId: id, kind: "Badanie mikrobiologiczne", code: `MICRO-${String(index + 1).padStart(2, "0")}`, name, supplier: null })),
      ];
      if (componentData.length) await tx.studyComponent.createMany({ data: componentData });

      // DRAFT nie ma jeszcze SampleTest, więc najczytelniej jest odtworzyć zakres kryteriów od zera.
      await tx.studyCriterion.deleteMany({ where: { studyId: id } });

      const definitions = await tx.testDefinition.findMany({ where: { code: { in: selectedCodes } } });
      const definitionMap = new Map(definitions.map((definition) => [definition.code, definition]));
      for (const item of criterionCatalog.filter((catalogItem) => selectedCodes.includes(catalogItem.code))) {
        const definition = definitionMap.get(item.code);
        if (!definition) throw new Error(`Brakuje definicji badania: ${item.label}`);

        let kind: CriterionKind;
        let minValue: number | null = null;
        let maxValue: number | null = null;
        let expectedText: string | null = null;
        let expectedBoolean: boolean | null = null;

        if (item.input === "range") {
          kind = CriterionKind.RANGE;
          minValue = numberOrNull(form, `${item.code}_min`);
          maxValue = numberOrNull(form, `${item.code}_max`);
          if (minValue == null || maxValue == null || minValue > maxValue) throw new Error(`Nieprawidłowy zakres ${item.label}`);
        } else if (item.input === "minimum") {
          kind = CriterionKind.MINIMUM;
          minValue = numberOrNull(form, `${item.code}_min`);
          if (minValue == null) throw new Error(`Brak minimum ${item.label}`);
        } else if (item.input === "expected") {
          kind = CriterionKind.EXPECTED_VALUE;
          expectedText = text(form, `${item.code}_expected`);
          if (!expectedText) throw new Error(`Brak wartości ${item.label}`);
        } else if (item.input === "boolean") {
          kind = CriterionKind.BOOLEAN_EXPECTED;
          expectedBoolean = true;
        } else {
          kind = CriterionKind.RANGE;
          const preset = text(form, `${item.code}_preset`);
          if (!preset) throw new Error(`Brak konfiguracji ${item.label}`);
          const parsed = preset === "INNE" ? null : parsePresetRange(preset);
          minValue = parsed?.min ?? numberOrNull(form, `${item.code}_min`);
          maxValue = parsed?.max ?? numberOrNull(form, `${item.code}_max`);
          expectedText = preset;
          if (minValue == null || maxValue == null || minValue > maxValue) throw new Error(`Nieprawidłowy zakres ${item.label}`);
        }

        const criterion = await tx.studyCriterion.create({ data: { studyId: id, testDefinitionId: definition.id, kind } });
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
        const criterion = await tx.studyCriterion.create({ data: { studyId: id, testDefinitionId: definition.id, kind: CriterionKind.RANGE } });
        const version = await tx.criterionVersion.create({
          data: { studyCriterionId: criterion.id, version: 1, minValue: row.min, maxValue: row.max, expectedText: row.name, authorId: user.id },
        });
        await tx.studyCriterion.update({ where: { id: criterion.id }, data: { currentVersionId: version.id } });
      }

      await tx.auditEvent.create({ data: { studyId: id, authorId: user.id, type: "DRAFT_UPDATED", message: "Zaktualizowano dane i pełny zakres zlecenia roboczego." } });
    });
  } catch {
    return NextResponse.redirect(publicUrl(request, `/studies/${id}/edit?error=validation`), 303);
  }

  return NextResponse.redirect(publicUrl(request, `/studies/${id}?saved=draft`), 303);
}
