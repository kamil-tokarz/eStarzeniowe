import { NextRequest, NextResponse } from "next/server";
import { Evaluation, ReferenceStatus, SampleExecutionStatus, SampleRole, StudyStatus, UserRole } from "@/generated/prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { deleteReportFile, saveReportFile } from "@/lib/storage";

function publicOrigin(request: NextRequest) {
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  if (forwardedHost) return `${forwardedProto || "https"}://${forwardedHost}`;
  return request.nextUrl.origin;
}

function initialComplete(aerosol: boolean, m: {
  initialWeightG: number | null;
  initialPressureBar: number | null;
  weightNotPerformed: boolean;
  weightNotPerformedReason: string | null;
  pressureNotPerformed: boolean;
  pressureNotPerformedReason: string | null;
} | null) {
  if (!m) return false;
  const weight = m.initialWeightG != null || (m.weightNotPerformed && Boolean(m.weightNotPerformedReason));
  const pressure = !aerosol || m.initialPressureBar != null || (m.pressureNotPerformed && Boolean(m.pressureNotPerformedReason));
  return weight && pressure;
}

async function refreshStudyCompletion(studyId: string) {
  const study = await prisma.study.findUnique({ where: { id: studyId }, include: { samples: true } });
  if (!study || study.status !== StudyStatus.ACTIVE) return;
  const required = study.samples.filter((sample) => sample.role !== SampleRole.REFERENCE || sample.referenceStatus === ReferenceStatus.ACTIVATED);
  if (required.length === 0 || required.some((sample) => sample.executionStatus !== SampleExecutionStatus.COMPLETED)) return;
  await prisma.$transaction([
    prisma.sample.updateMany({ where: { studyId, role: SampleRole.REFERENCE, referenceStatus: ReferenceStatus.AVAILABLE }, data: { referenceStatus: ReferenceStatus.UNUSED } }),
    prisma.study.update({ where: { id: studyId }, data: { status: StudyStatus.COMPLETED, completedAt: new Date() } }),
    prisma.auditEvent.create({ data: { studyId, type: "STUDY_COMPLETED", message: "Badanie zakończone automatycznie — wszystkie wymagane próbki są kompletne." } }),
  ]);
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || (user.role !== UserRole.LAB_TECHNICIAN && user.role !== UserRole.ADMIN)) {
    return NextResponse.json({ error: "Brak uprawnień." }, { status: 403 });
  }

  const formData = await request.formData();
  const sampleId = String(formData.get("sampleId") ?? "").trim();
  const evaluationRaw = String(formData.get("evaluation") ?? "").trim();
  const reportNameRaw = String(formData.get("reportName") ?? "").trim();
  if (!sampleId || ![Evaluation.OK, Evaluation.NOK].includes(evaluationRaw as Evaluation)) {
    return NextResponse.json({ error: "Nieprawidłowe dane wyniku mikrobiologii." }, { status: 400 });
  }
  const evaluation = evaluationRaw as Evaluation;

  const sample = await prisma.sample.findUnique({
    where: { id: sampleId },
    include: {
      study: { include: { samples: { select: { initialMeasurement: true } } } },
      microbiologyResult: true,
    },
  });
  if (!sample || sample.role !== SampleRole.MICROBIOLOGY || sample.study.status !== StudyStatus.ACTIVE) {
    return NextResponse.json({ error: "To nie jest aktywna próbka mikrobiologiczna." }, { status: 400 });
  }
  if (!sample.study.samples.every((row) => initialComplete(sample.study.aerosol, row.initialMeasurement))) {
    return NextResponse.json({ error: "Najpierw zakończ badania wstępne wszystkich próbek." }, { status: 400 });
  }

  const fileValue = formData.get("reportFile");
  const file = fileValue instanceof File && fileValue.size > 0 ? fileValue : null;
  let uploaded: Awaited<ReturnType<typeof saveReportFile>> | null = null;
  try {
    if (file) uploaded = await saveReportFile(file, sampleId);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Nie udało się zapisać raportu." }, { status: 400 });
  }

  const oldPath = sample.microbiologyResult?.reportPath ?? null;
  try {
    await prisma.$transaction([
      prisma.microbiologyResult.upsert({
        where: { sampleId },
        create: {
          sampleId,
          evaluation,
          authorId: user.id,
          reportName: reportNameRaw || uploaded?.originalName || null,
          reportPath: uploaded?.storageName || null,
        },
        update: {
          evaluation,
          authorId: user.id,
          reportName: reportNameRaw || uploaded?.originalName || sample.microbiologyResult?.reportName || null,
          ...(uploaded ? { reportPath: uploaded.storageName } : {}),
        },
      }),
      prisma.sample.update({ where: { id: sampleId }, data: { executionStatus: SampleExecutionStatus.COMPLETED, completedAt: new Date() } }),
      prisma.auditEvent.create({
        data: {
          studyId: sample.studyId,
          authorId: user.id,
          type: "MICRO_RESULT",
          message: `${sample.code} · mikrobiologia · ${evaluation}${uploaded ? " · dołączono raport" : ""}.`,
        },
      }),
    ]);
  } catch (error) {
    if (uploaded) await deleteReportFile(uploaded.storageName);
    throw error;
  }

  if (uploaded && oldPath && oldPath !== uploaded.storageName) await deleteReportFile(oldPath);
  await refreshStudyCompletion(sample.studyId);
  return NextResponse.redirect(new URL(`/lab/sample/${sampleId}?saved=1`, publicOrigin(request)), 303);
}
