import { NextRequest, NextResponse } from "next/server";
import { ReferenceStatus, SampleExecutionStatus, SampleRole, StandardStatus, StudyStatus, UserRole } from "@/generated/prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { publicUrl } from "@/lib/request-origin";

const DAY = 24 * 60 * 60 * 1000;
function text(form: FormData, key: string) { return String(form.get(key) ?? "").trim(); }

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || (user.role !== UserRole.TECHNOLOGIST && user.role !== UserRole.ADMIN)) return NextResponse.json({ error: "Brak uprawnień." }, { status: 403 });
  const { id } = await params;
  const form = await request.formData();
  const intent = text(form, "intent");

  if (intent === "cancel") {
    const reason = text(form, "reason");
    if (!reason) return NextResponse.redirect(publicUrl(request, `/studies/${id}?error=reason`), 303);
    const study = await prisma.study.findUnique({ where: { id } });
    if (!study || study.status !== StudyStatus.DRAFT) return NextResponse.redirect(publicUrl(request, `/studies/${id}`), 303);
    await prisma.$transaction([
      prisma.study.update({ where: { id }, data: { status: StudyStatus.CANCELLED, cancelledAt: new Date(), cancellationReason: reason } }),
      prisma.auditEvent.create({ data: { studyId: id, authorId: user.id, type: "STUDY_CANCELLED", message: `Anulowano zlecenie. Powód: ${reason}` } }),
    ]);
    return NextResponse.redirect(publicUrl(request, `/studies/${id}`), 303);
  }

  if (intent === "interrupt") {
    const reason = text(form, "reason");
    if (!reason) return NextResponse.redirect(publicUrl(request, `/studies/${id}?error=reason`), 303);
    const study = await prisma.study.findUnique({ where: { id } });
    if (!study || study.status !== StudyStatus.ACTIVE) return NextResponse.redirect(publicUrl(request, `/studies/${id}`), 303);
    await prisma.$transaction([
      prisma.study.update({ where: { id }, data: { status: StudyStatus.INTERRUPTED, interruptedAt: new Date(), interruptionReason: reason } }),
      prisma.auditEvent.create({ data: { studyId: id, authorId: user.id, type: "STUDY_INTERRUPTED", message: `Przerwano badanie. Powód: ${reason}` } }),
    ]);
    return NextResponse.redirect(publicUrl(request, `/studies/${id}`), 303);
  }

  if (intent !== "handover") return NextResponse.json({ error: "Nieznana operacja." }, { status: 400 });

  try {
    await prisma.$transaction(async (tx) => {
      const study = await tx.study.findUnique({
        where: { id },
        include: {
          standard: { include: { definitions: { orderBy: { sortOrder: "asc" } } } },
          criteria: true,
          components: true,
          samples: true,
        },
      });
      if (!study || study.status !== StudyStatus.DRAFT) throw new Error("Do Laboratorium można przekazać wyłącznie zlecenie robocze.");
      if (!study.standard || study.standard.status !== StandardStatus.ACTIVE) throw new Error("Zlecenie nie ma aktywnego standardu.");
      if (!study.standard.definitions.length) throw new Error("Standard nie zawiera planu próbek.");
      if (study.samples.length) throw new Error("Próbki zostały już wygenerowane.");
      if (!study.criteria.length) throw new Error("Zlecenie nie ma kryteriów akceptacji.");

      const today = new Date(); today.setHours(0, 0, 0, 0);
      const startDay = new Date(study.startDate); startDay.setHours(0, 0, 0, 0);
      if (startDay < today) throw new Error("Data rozpoczęcia nie może być wcześniejsza niż dzień przekazania.");

      const microSelected = study.components.some((component) => component.kind === "Badanie mikrobiologiczne");
      const hasMicroSample = study.standard.definitions.some((definition) => definition.role === SampleRole.MICROBIOLOGY);
      if (microSelected && !hasMicroSample) throw new Error("Wybrano mikrobiologię, ale standard nie ma próbki mikrobiologicznej.");

      const measurementTests = await tx.testDefinition.findMany({ where: { code: { in: ["WEIGHT", "PRESSURE"] } } });
      const weight = measurementTests.find((test) => test.code === "WEIGHT");
      const pressure = measurementTests.find((test) => test.code === "PRESSURE");
      if (!weight || (study.aerosol && !pressure)) throw new Error("Brakuje definicji pomiarów bazowych.");

      for (const definition of study.standard.definitions) {
        if (definition.role === SampleRole.MICROBIOLOGY && !microSelected) continue;
        const quantity = Math.max(definition.quantity, 1);
        for (let index = 0; index < quantity; index++) {
          const code = quantity === 1 ? definition.code : `${definition.code}-${index + 1}`;
          const sample = await tx.sample.create({
            data: {
              studyId: study.id,
              code,
              role: definition.role,
              checkpointLabel: definition.checkpointLabel,
              checkpointDays: definition.checkpointDays,
              nominalDate: definition.checkpointDays == null ? null : new Date(study.startDate.getTime() + definition.checkpointDays * DAY),
              storageCondition: definition.storageCondition,
              position: definition.position,
              referenceStatus: definition.role === SampleRole.REFERENCE ? ReferenceStatus.AVAILABLE : null,
              executionStatus: SampleExecutionStatus.NOT_STARTED,
            },
          });
          await tx.initialMeasurement.create({ data: { sampleId: sample.id } });

          if (definition.role === SampleRole.STANDARD) {
            await tx.sampleTest.create({ data: { sampleId: sample.id, testDefinitionId: weight.id, sortOrder: 1 } });
            let sortOrder = 2;
            if (study.aerosol && pressure) await tx.sampleTest.create({ data: { sampleId: sample.id, testDefinitionId: pressure.id, sortOrder: sortOrder++ } });
            for (const criterion of study.criteria) {
              await tx.sampleTest.create({ data: { sampleId: sample.id, testDefinitionId: criterion.testDefinitionId, studyCriterionId: criterion.id, sortOrder: sortOrder++ } });
            }
          }
        }
      }

      await tx.stabilityStandard.update({ where: { id: study.standard.id }, data: { locked: true } });
      await tx.study.update({ where: { id: study.id }, data: { status: StudyStatus.ACTIVE, handedToLabAt: new Date() } });
      await tx.auditEvent.create({ data: { studyId: study.id, authorId: user.id, type: "HANDED_TO_LAB", message: "Przekazano zlecenie do Laboratorium i wygenerowano komplet wymaganych próbek." } });
    });
    return NextResponse.redirect(publicUrl(request, `/studies/${id}`), 303);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Nie udało się przekazać zlecenia.";
    return NextResponse.redirect(publicUrl(request, `/studies/${id}?error=${encodeURIComponent(message)}`), 303);
  }
}
