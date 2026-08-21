import { NextRequest, NextResponse } from "next/server";
import { CriterionKind, StandardStatus, StudyStatus, UserRole } from "@/generated/prisma/client";
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

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || (user.role !== UserRole.TECHNOLOGIST && user.role !== UserRole.ADMIN)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const form = await request.formData();
  const study = await prisma.study.findUnique({ where: { id }, include: { criteria: { include: { testDefinition: true } } } });
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

  const aerosol = form.get("aerosol") === "on";
  const supportedCodes = ["PH", "DENSITY", "APPEARANCE", "ODOR"];
  const selectedCodes = supportedCodes.filter((code) => form.get(`criterion_${code}`) === "on");
  if (!selectedCodes.length) return NextResponse.redirect(publicUrl(request, `/studies/${id}/edit?error=criteria`), 303);

  try {
    await prisma.$transaction(async (tx) => {
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
      const components = [1, 2, 3, 4, 5].map((index) => ({
        kind: text(form, `componentKind_${index}`),
        code: text(form, `componentCode_${index}`),
        name: text(form, `componentName_${index}`),
        supplier: text(form, `componentSupplier_${index}`),
      })).filter((row) => row.kind && row.name);
      if (components.length) await tx.studyComponent.createMany({ data: components.map((row) => ({ studyId: id, kind: row.kind, code: row.code || null, name: row.name, supplier: row.supplier || null })) });

      const definitions = await tx.testDefinition.findMany({ where: { code: { in: supportedCodes } } });
      const existing = await tx.studyCriterion.findMany({ where: { studyId: id, testDefinition: { code: { in: supportedCodes } } }, include: { testDefinition: true, currentVersion: true } });
      for (const code of supportedCodes) {
        const current = existing.find((item) => item.testDefinition.code === code);
        if (!selectedCodes.includes(code)) {
          if (current) await tx.studyCriterion.delete({ where: { id: current.id } });
          continue;
        }
        const definition = definitions.find((item) => item.code === code);
        if (!definition) continue;
        const numeric = code === "PH" || code === "DENSITY";
        const minValue = numeric ? numberOrNull(form, `${code}_min`) : null;
        const maxValue = numeric ? numberOrNull(form, `${code}_max`) : null;
        const expectedText = numeric ? null : text(form, `${code}_expected`);
        if (numeric && (minValue == null || maxValue == null)) throw new Error(`Brak zakresu ${code}`);
        if (!numeric && !expectedText) throw new Error(`Brak wartości ${code}`);

        if (current) {
          if (!current.currentVersion) throw new Error(`Brak wersji kryterium ${code}`);
          await tx.criterionVersion.update({ where: { id: current.currentVersion.id }, data: { minValue, maxValue, expectedText } });
        } else {
          const criterion = await tx.studyCriterion.create({ data: { studyId: id, testDefinitionId: definition.id, kind: numeric ? CriterionKind.RANGE : CriterionKind.EXPECTED_VALUE } });
          const version = await tx.criterionVersion.create({ data: { studyCriterionId: criterion.id, version: 1, minValue, maxValue, expectedText, authorId: user.id } });
          await tx.studyCriterion.update({ where: { id: criterion.id }, data: { currentVersionId: version.id } });
        }
      }

      await tx.auditEvent.create({ data: { studyId: id, authorId: user.id, type: "DRAFT_UPDATED", message: "Zaktualizowano dane zlecenia roboczego." } });
    });
  } catch {
    return NextResponse.redirect(publicUrl(request, `/studies/${id}/edit?error=validation`), 303);
  }

  return NextResponse.redirect(publicUrl(request, `/studies/${id}?saved=draft`), 303);
}
