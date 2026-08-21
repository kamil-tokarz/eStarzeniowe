import { NextRequest, NextResponse } from "next/server";
import { CriterionKind, Evaluation, ReferenceStatus, SampleExecutionStatus, SampleRole, StudyStatus, UserRole } from "@/generated/prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { publicUrl } from "@/lib/request-origin";

function text(form: FormData, key: string) { return String(form.get(key) ?? "").trim(); }
function numberOrNull(form: FormData, key: string) {
  const raw = text(form, key).replace(",", ".");
  if (!raw) return null;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error("Nieprawidłowa wartość liczbowa.");
  return value;
}
function evaluate(kind: CriterionKind, version: { minValue: number | null; maxValue: number | null; expectedText: string | null; expectedBoolean: boolean | null }, result: { numericValue: number | null; textValue: string | null; booleanValue: boolean | null }): Evaluation {
  if (kind === CriterionKind.RANGE && result.numericValue != null) return (version.minValue == null || result.numericValue >= version.minValue) && (version.maxValue == null || result.numericValue <= version.maxValue) ? Evaluation.OK : Evaluation.NOK;
  if (kind === CriterionKind.MINIMUM && result.numericValue != null && version.minValue != null) return result.numericValue >= version.minValue ? Evaluation.OK : Evaluation.NOK;
  if (kind === CriterionKind.MAXIMUM && result.numericValue != null && version.maxValue != null) return result.numericValue <= version.maxValue ? Evaluation.OK : Evaluation.NOK;
  if (kind === CriterionKind.EXPECTED_VALUE && result.textValue != null && version.expectedText != null) return result.textValue === version.expectedText ? Evaluation.OK : Evaluation.NOK;
  if (kind === CriterionKind.BOOLEAN_EXPECTED && result.booleanValue != null && version.expectedBoolean != null) return result.booleanValue === version.expectedBoolean ? Evaluation.OK : Evaluation.NOK;
  return Evaluation.NOT_APPLICABLE;
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || (user.role !== UserRole.TECHNOLOGIST && user.role !== UserRole.ADMIN)) return NextResponse.json({ error: "Brak uprawnień." }, { status: 403 });
  const { id } = await params;
  const form = await request.formData();
  const intent = text(form, "intent");

  if (intent === "activate-reference") {
    const sourceResultId = text(form, "sourceResultId");
    const reason = text(form, "reason");
    if (!sourceResultId || !reason) return NextResponse.redirect(publicUrl(request, `/studies/${id}#attention`), 303);
    const source = await prisma.testResult.findUnique({
      where: { id: sourceResultId },
      include: { sampleTest: { include: { sample: { include: { study: true } }, testDefinition: true } } },
    });
    if (!source || source.currentEvaluation !== Evaluation.NOK || source.sampleTest.sample.studyId !== id || source.sampleTest.sample.study.status !== StudyStatus.ACTIVE) return NextResponse.redirect(publicUrl(request, `/studies/${id}#attention`), 303);
    const sourceSample = source.sampleTest.sample;
    const reference = await prisma.sample.findFirst({ where: { studyId: id, role: SampleRole.REFERENCE, referenceStatus: ReferenceStatus.AVAILABLE, storageCondition: sourceSample.storageCondition }, orderBy: { code: "asc" } });
    if (!reference) return NextResponse.redirect(publicUrl(request, `/studies/${id}?error=no-reference#attention`), 303);

    await prisma.$transaction(async (tx) => {
      await tx.sample.update({ where: { id: reference.id }, data: { referenceStatus: ReferenceStatus.ACTIVATED, executionStatus: SampleExecutionStatus.NOT_STARTED, activatedAt: new Date(), activatedById: user.id, sourceSampleId: sourceSample.id, sourceTestResultId: source.id, activationReason: reason } });
      await tx.sampleTest.create({ data: { sampleId: reference.id, testDefinitionId: source.sampleTest.testDefinitionId, studyCriterionId: source.sampleTest.studyCriterionId, sortOrder: 1 } });
      await tx.auditEvent.create({ data: { studyId: id, authorId: user.id, type: "REFERENCE_ACTIVATED", message: `${sourceSample.code} · ${source.sampleTest.testDefinition.name} NOK → aktywowano ${reference.code}. Powód: ${reason}` } });
    });
    return NextResponse.redirect(publicUrl(request, `/studies/${id}#attention`), 303);
  }

  if (intent === "change-criterion") {
    const criterionId = text(form, "criterionId");
    const reason = text(form, "reason");
    if (!criterionId || !reason) return NextResponse.redirect(publicUrl(request, `/studies/${id}#criteria`), 303);
    const criterion = await prisma.studyCriterion.findUnique({ where: { id: criterionId }, include: { study: true, currentVersion: true, versions: { orderBy: { version: "desc" }, take: 1 }, testDefinition: true } });
    if (!criterion || criterion.studyId !== id || criterion.study.status !== StudyStatus.ACTIVE || !criterion.currentVersion) return NextResponse.redirect(publicUrl(request, `/studies/${id}#criteria`), 303);

    let minValue = criterion.currentVersion.minValue;
    let maxValue = criterion.currentVersion.maxValue;
    let expectedText = criterion.currentVersion.expectedText;
    let expectedBoolean = criterion.currentVersion.expectedBoolean;
    if (criterion.kind === CriterionKind.RANGE || criterion.kind === CriterionKind.MINIMUM || criterion.kind === CriterionKind.MAXIMUM) {
      minValue = numberOrNull(form, "minValue"); maxValue = numberOrNull(form, "maxValue");
      if (criterion.kind === CriterionKind.RANGE && (minValue == null || maxValue == null || minValue > maxValue)) return NextResponse.redirect(publicUrl(request, `/studies/${id}?error=criterion#criteria`), 303);
      if (criterion.kind === CriterionKind.MINIMUM && minValue == null) return NextResponse.redirect(publicUrl(request, `/studies/${id}?error=criterion#criteria`), 303);
      if (criterion.kind === CriterionKind.MAXIMUM && maxValue == null) return NextResponse.redirect(publicUrl(request, `/studies/${id}?error=criterion#criteria`), 303);
    } else if (criterion.kind === CriterionKind.EXPECTED_VALUE) {
      expectedText = text(form, "expectedText"); if (!expectedText) return NextResponse.redirect(publicUrl(request, `/studies/${id}?error=criterion#criteria`), 303);
    } else if (criterion.kind === CriterionKind.BOOLEAN_EXPECTED) {
      expectedBoolean = text(form, "expectedBoolean") === "true";
    }

    const nextVersion = (criterion.versions[0]?.version ?? 0) + 1;
    await prisma.$transaction(async (tx) => {
      const version = await tx.criterionVersion.create({ data: { studyCriterionId: criterion.id, version: nextVersion, minValue, maxValue, expectedText, expectedBoolean, reason, authorId: user.id } });
      await tx.studyCriterion.update({ where: { id: criterion.id }, data: { currentVersionId: version.id } });
      const sampleTests = await tx.sampleTest.findMany({ where: { studyCriterionId: criterion.id, result: { isNot: null } }, include: { result: true } });
      for (const sampleTest of sampleTests) {
        if (!sampleTest.result || sampleTest.result.state === "NOT_PERFORMED") continue;
        const currentEvaluation = evaluate(criterion.kind, { minValue, maxValue, expectedText, expectedBoolean }, sampleTest.result);
        await tx.testResult.update({ where: { id: sampleTest.result.id }, data: { currentEvaluation } });
      }
      await tx.auditEvent.create({ data: { studyId: id, authorId: user.id, type: "CRITERION_CHANGED", message: `${criterion.testDefinition.name} · kryterium zmienione do v${nextVersion}. Powód: ${reason}` } });
    });
    return NextResponse.redirect(publicUrl(request, `/studies/${id}#criteria`), 303);
  }

  return NextResponse.json({ error: "Nieznana operacja." }, { status: 400 });
}
