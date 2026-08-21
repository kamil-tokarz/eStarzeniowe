import PDFDocument from "pdfkit";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { criterionValue, getStudyExportData, resultValue } from "@/lib/study-export";

export const runtime = "nodejs";

const FONT_REGULAR = "/usr/share/fonts/dejavu/DejaVuSans.ttf";
const FONT_BOLD = "/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf";
const TEAL = "#008c8d";
const INK = "#171c26";
const MUTED = "#6d7480";
const LINE = "#e4e8eb";
const DANGER = "#d8332f";

function createBuffer(doc: PDFKit.PDFDocument) {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
}
function ensureSpace(doc: PDFKit.PDFDocument, height = 70) {
  if (doc.y + height > doc.page.height - 50) doc.addPage();
}
function sectionTitle(doc: PDFKit.PDFDocument, title: string) {
  ensureSpace(doc, 48);
  doc.moveDown(.6).font("Bold").fontSize(12).fillColor(INK).text(title);
  doc.moveDown(.25).strokeColor(TEAL).lineWidth(1.2).moveTo(50, doc.y).lineTo(doc.page.width - 50, doc.y).stroke();
  doc.moveDown(.5);
}
function keyValue(doc: PDFKit.PDFDocument, label: string, value: string | number | null | undefined) {
  ensureSpace(doc, 28);
  const y = doc.y;
  doc.font("Bold").fontSize(8.5).fillColor(MUTED).text(label, 50, y, { width: 155 });
  doc.font("Regular").fillColor(INK).text(value == null || value === "" ? "—" : String(value), 210, y, { width: doc.page.width - 260 });
  doc.y = Math.max(doc.y, y + 17);
}
function row(doc: PDFKit.PDFDocument, left: string, right: string, danger = false) {
  ensureSpace(doc, 44);
  const y = doc.y;
  doc.font("Bold").fontSize(8.2).fillColor(INK).text(left, 50, y, { width: 205 });
  doc.font("Regular").fontSize(8.2).fillColor(danger ? DANGER : INK).text(right, 265, y, { width: doc.page.width - 315 });
  const bottom = Math.max(doc.y, y + 20);
  doc.strokeColor(LINE).lineWidth(.5).moveTo(50, bottom + 4).lineTo(doc.page.width - 50, bottom + 4).stroke();
  doc.y = bottom + 9;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Brak autoryzacji." }, { status: 401 });
  const { id } = await params;
  const study = await getStudyExportData(id);
  if (!study) return NextResponse.json({ error: "Nie znaleziono badania." }, { status: 404 });

  const doc = new PDFDocument({ size: "A4", margins: { top: 48, bottom: 48, left: 50, right: 50 }, info: { Title: `${study.studyNumber} · ${study.projectName}`, Author: "eStarzeniowe · JagoPro" } });
  doc.registerFont("Regular", FONT_REGULAR).registerFont("Bold", FONT_BOLD);
  const bufferPromise = createBuffer(doc);

  doc.font("Bold").fillColor(TEAL).fontSize(10).text("JagoPro · eStarzeniowe");
  doc.moveDown(.35).fontSize(22).fillColor(INK).text(study.projectName);
  doc.moveDown(.15).font("Regular").fontSize(10).fillColor(MUTED).text(`${study.studyNumber} · ${study.client.name} · wygenerowano ${new Date().toLocaleString("pl-PL")}`);

  sectionTitle(doc, "Badanie");
  keyValue(doc, "Status", study.status);
  keyValue(doc, "Technolog odpowiedzialny", study.responsibleTechnologist.name);
  keyValue(doc, "Standard", study.standard?.name ?? "—");
  keyValue(doc, "Numer ETS", study.etsNumber ?? "—");
  keyValue(doc, "Data produkcji próbek", study.productionDate.toLocaleDateString("pl-PL"));
  keyValue(doc, "Data rozpoczęcia", study.startDate.toLocaleDateString("pl-PL"));
  keyValue(doc, "Typ badania", study.internalTest ? "Wewnętrzne" : "Dla klienta");
  keyValue(doc, "Aerozol", study.aerosol ? "TAK" : "NIE");
  if (study.aerosol) { keyValue(doc, "Gaz", study.gasType); keyValue(doc, "Waga gazu [g]", study.gasWeightG); }
  keyValue(doc, "Waga nastawu [g]", study.fillWeightG);
  keyValue(doc, "Waga wsadu [g]", study.totalWeightG);
  keyValue(doc, "Pojemność [ml]", study.volumeMl);
  keyValue(doc, "Cel", study.purpose);

  const normalComponents = study.components.filter((item) => item.kind !== "Badanie mikrobiologiczne");
  if (normalComponents.length) {
    sectionTitle(doc, "Komponenty");
    for (const item of normalComponents) row(doc, `${item.kind}${item.code ? ` · ${item.code}` : ""}`, `${item.name}${item.supplier ? ` · ${item.supplier}` : ""}`);
  }

  sectionTitle(doc, "Kryteria akceptacji");
  for (const item of study.criteria) {
    const suffix = [criterionValue(item.currentVersion), item.testDefinition.unit].filter(Boolean).join(" ");
    row(doc, `${item.testDefinition.name} · ${item.testDefinition.category}`, `${suffix} · wersja ${item.currentVersion?.version ?? 1}`);
  }

  const microScope = study.components.filter((item) => item.kind === "Badanie mikrobiologiczne");
  if (microScope.length) {
    sectionTitle(doc, "Zakres mikrobiologii");
    for (const item of microScope) row(doc, item.code ?? "Mikrobiologia", item.name);
  }

  sectionTitle(doc, "Próbki i wyniki");
  for (const sample of study.samples) {
    ensureSpace(doc, 55);
    doc.font("Bold").fontSize(10).fillColor(TEAL).text(`${sample.code} · ${sample.checkpointLabel || sample.role}`);
    doc.font("Regular").fontSize(7.8).fillColor(MUTED).text(`${sample.storageCondition}${sample.position ? ` · ${sample.position}` : ""}${sample.nominalDate ? ` · ${sample.nominalDate.toLocaleDateString("pl-PL")}` : ""}`);
    doc.moveDown(.3);
    keyValue(doc, "Waga bazowa [g]", sample.initialMeasurement?.initialWeightG ?? (sample.initialMeasurement?.weightNotPerformed ? `Nie wykonano: ${sample.initialMeasurement.weightNotPerformedReason}` : "brak"));
    if (study.aerosol) keyValue(doc, "Ciśnienie bazowe [bar]", sample.initialMeasurement?.initialPressureBar ?? (sample.initialMeasurement?.pressureNotPerformed ? `Nie wykonano: ${sample.initialMeasurement.pressureNotPerformedReason}` : "brak"));
    for (const test of sample.tests) {
      if (!test.result) continue;
      const value = resultValue(test.result);
      const criterion = criterionValue(test.studyCriterion?.currentVersion ?? null);
      const evaluation = test.result.currentEvaluation === "NOT_APPLICABLE" ? "informacyjnie" : test.result.currentEvaluation;
      row(doc, test.testDefinition.name, `${value}${test.testDefinition.unit ? ` ${test.testDefinition.unit}` : ""} · kryterium: ${criterion} · ${evaluation}`, test.result.currentEvaluation === "NOK");
    }
    if (sample.microbiologyResult) row(doc, "Mikrobiologia — wynik zbiorczy", `${sample.microbiologyResult.evaluation}${sample.microbiologyResult.reportName ? ` · ${sample.microbiologyResult.reportName}` : ""}`, sample.microbiologyResult.evaluation === "NOK");
    doc.moveDown(.45);
  }

  sectionTitle(doc, "Historia kluczowych zdarzeń");
  for (const event of study.auditEvents) row(doc, event.createdAt.toLocaleString("pl-PL"), `${event.author?.name ?? "System"} · ${event.message}`, event.type.includes("NOK"));

  const pageRange = doc.bufferedPageRange();
  for (let i = pageRange.start; i < pageRange.start + pageRange.count; i++) {
    doc.switchToPage(i);
    doc.font("Regular").fontSize(7).fillColor(MUTED).text(`${study.studyNumber} · eStarzeniowe · strona ${i + 1}`, 50, doc.page.height - 31, { width: doc.page.width - 100, align: "right" });
  }
  doc.end();
  const buffer = await bufferPromise;
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${study.studyNumber}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
