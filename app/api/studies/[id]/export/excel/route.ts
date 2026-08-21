import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { criterionValue, getStudyExportData, resultValue } from "@/lib/study-export";

const TEAL = "FF008C8D";
const INK = "FF171C26";
const MUTED = "FF6D7480";
const LIGHT = "FFF4F7F8";
const LINE = "FFE4E8EB";
const DANGER = "FFE53935";

function styleHeader(row: ExcelJS.Row) {
  row.height = 22;
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TEAL } };
    cell.alignment = { vertical: "middle" };
  });
}
function styleSheet(sheet: ExcelJS.Worksheet) {
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    row.eachCell((cell) => {
      cell.font = { color: { argb: INK }, size: 10 };
      cell.border = { bottom: { style: "hair", color: { argb: LINE } } };
      cell.alignment = { vertical: "top", wrapText: true };
    });
  });
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: Math.max(sheet.columnCount, 1) } };
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Brak autoryzacji." }, { status: 401 });
  const { id } = await params;
  const study = await getStudyExportData(id);
  if (!study) return NextResponse.json({ error: "Nie znaleziono badania." }, { status: 404 });

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "eStarzeniowe · JagoPro";
  workbook.created = new Date();
  workbook.modified = new Date();

  const summary = workbook.addWorksheet("Badanie");
  summary.columns = [{ header: "Pole", key: "field", width: 28 }, { header: "Wartość", key: "value", width: 72 }];
  styleHeader(summary.getRow(1));
  const normalComponents = study.components.filter((item) => item.kind !== "Badanie mikrobiologiczne");
  const micro = study.components.filter((item) => item.kind === "Badanie mikrobiologiczne");
  const summaryRows: [string, string | number | null][] = [
    ["Numer badania", study.studyNumber], ["Projekt", study.projectName], ["Klient", study.client.name], ["Technolog", study.responsibleTechnologist.name],
    ["Status", study.status], ["Standard", study.standard?.name ?? "—"], ["Numer ETS", study.etsNumber ?? "—"],
    ["Data produkcji", study.productionDate.toLocaleDateString("pl-PL")], ["Data rozpoczęcia", study.startDate.toLocaleDateString("pl-PL")],
    ["Typ", study.internalTest ? "Wewnętrzne" : "Dla klienta"], ["Aerozol", study.aerosol ? "TAK" : "NIE"], ["Rodzaj gazu", study.gasType ?? "—"],
    ["Waga gazu [g]", study.gasWeightG], ["Waga nastawu [g]", study.fillWeightG], ["Waga wsadu [g]", study.totalWeightG], ["Pojemność [ml]", study.volumeMl],
    ["Cel", study.purpose ?? "—"], ["Zakres mikrobiologii", micro.length ? micro.map((item) => item.name).join("\n") : "Brak"],
  ];
  summary.addRows(summaryRows.map(([field, value]) => ({ field, value })));
  styleSheet(summary);
  summary.getColumn(1).font = { bold: true, color: { argb: MUTED } };

  const components = workbook.addWorksheet("Komponenty");
  components.columns = [
    { header: "Rodzaj", key: "kind", width: 20 }, { header: "Kod", key: "code", width: 18 }, { header: "Nazwa", key: "name", width: 42 }, { header: "Dostawca", key: "supplier", width: 32 },
  ];
  styleHeader(components.getRow(1));
  components.addRows(normalComponents.map((item) => ({ kind: item.kind, code: item.code ?? "", name: item.name, supplier: item.supplier ?? "" })));
  styleSheet(components);

  const criteria = workbook.addWorksheet("Kryteria");
  criteria.columns = [
    { header: "Badanie", key: "test", width: 34 }, { header: "Grupa", key: "category", width: 20 }, { header: "Typ", key: "kind", width: 20 }, { header: "Kryterium", key: "criterion", width: 30 }, { header: "Jednostka", key: "unit", width: 14 }, { header: "Wersja", key: "version", width: 10 }, { header: "Powód zmiany", key: "reason", width: 44 },
  ];
  styleHeader(criteria.getRow(1));
  criteria.addRows(study.criteria.map((item) => ({ test: item.testDefinition.name, category: item.testDefinition.category, kind: item.kind, criterion: criterionValue(item.currentVersion), unit: item.testDefinition.unit ?? "", version: item.currentVersion?.version ?? 1, reason: item.currentVersion?.reason ?? "Kryterium początkowe" })));
  styleSheet(criteria);

  const samples = workbook.addWorksheet("Próbki");
  samples.columns = [
    { header: "Kod", key: "code", width: 16 }, { header: "Rola", key: "role", width: 18 }, { header: "Checkpoint", key: "checkpoint", width: 15 }, { header: "Offset [dni]", key: "days", width: 14 }, { header: "Termin", key: "date", width: 15 }, { header: "Warunek", key: "condition", width: 28 }, { header: "Pozycja", key: "position", width: 18 }, { header: "Status realizacji", key: "status", width: 18 }, { header: "RF", key: "rf", width: 16 }, { header: "Waga bazowa [g]", key: "weight", width: 18 }, { header: "Ciśnienie bazowe [bar]", key: "pressure", width: 22 },
  ];
  styleHeader(samples.getRow(1));
  samples.addRows(study.samples.map((sample) => ({ code: sample.code, role: sample.role, checkpoint: sample.checkpointLabel ?? "", days: sample.checkpointDays ?? "", date: sample.nominalDate?.toLocaleDateString("pl-PL") ?? "", condition: sample.storageCondition, position: sample.position ?? "", status: sample.executionStatus, rf: sample.referenceStatus ?? "", weight: sample.initialMeasurement?.initialWeightG ?? (sample.initialMeasurement?.weightNotPerformed ? "Nie wykonano" : ""), pressure: sample.initialMeasurement?.initialPressureBar ?? (sample.initialMeasurement?.pressureNotPerformed ? "Nie wykonano" : "") })));
  styleSheet(samples);

  const results = workbook.addWorksheet("Wyniki");
  results.columns = [
    { header: "Próbka", key: "sample", width: 16 }, { header: "Checkpoint", key: "checkpoint", width: 15 }, { header: "Warunek", key: "condition", width: 28 }, { header: "Badanie", key: "test", width: 34 }, { header: "Wynik", key: "value", width: 28 }, { header: "Jednostka", key: "unit", width: 14 }, { header: "Kryterium aktualne", key: "criterion", width: 28 }, { header: "Ocena bieżąca", key: "evaluation", width: 17 }, { header: "Ocena przy zapisie", key: "entryEvaluation", width: 19 }, { header: "Autor", key: "author", width: 24 }, { header: "Zapisano", key: "saved", width: 21 },
  ];
  styleHeader(results.getRow(1));
  for (const sample of study.samples) {
    for (const test of sample.tests) {
      if (!test.result) continue;
      const row = results.addRow({ sample: sample.code, checkpoint: sample.checkpointLabel ?? "", condition: sample.storageCondition, test: test.testDefinition.name, value: resultValue(test.result), unit: test.testDefinition.unit ?? "", criterion: criterionValue(test.studyCriterion?.currentVersion ?? null), evaluation: test.result.currentEvaluation, entryEvaluation: test.result.evaluationAtEntry, author: test.result.author.name, saved: test.result.updatedAt.toLocaleString("pl-PL") });
      if (test.result.currentEvaluation === "NOK") row.getCell("evaluation").font = { bold: true, color: { argb: DANGER } };
    }
    if (sample.microbiologyResult) {
      const row = results.addRow({ sample: sample.code, checkpoint: sample.checkpointLabel ?? "", condition: sample.storageCondition, test: "Mikrobiologia — wynik zbiorczy", value: sample.microbiologyResult.evaluation, unit: "", criterion: "OK", evaluation: sample.microbiologyResult.evaluation, entryEvaluation: sample.microbiologyResult.evaluation, author: "", saved: sample.microbiologyResult.updatedAt.toLocaleString("pl-PL") });
      if (sample.microbiologyResult.evaluation === "NOK") row.getCell("evaluation").font = { bold: true, color: { argb: DANGER } };
    }
  }
  styleSheet(results);

  const history = workbook.addWorksheet("Historia");
  history.columns = [{ header: "Data", key: "date", width: 21 }, { header: "Typ", key: "type", width: 24 }, { header: "Użytkownik", key: "author", width: 25 }, { header: "Zdarzenie", key: "message", width: 90 }];
  styleHeader(history.getRow(1));
  history.addRows(study.auditEvents.map((event) => ({ date: event.createdAt.toLocaleString("pl-PL"), type: event.type, author: event.author?.name ?? "System", message: event.message })));
  styleSheet(history);

  for (const sheet of workbook.worksheets) {
    sheet.properties.defaultRowHeight = 18;
    sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: TEAL } };
    sheet.getRow(2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: LIGHT } };
  }

  const output = await workbook.xlsx.writeBuffer();
  return new NextResponse(new Uint8Array(output), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${study.studyNumber}.xlsx"`,
      "Cache-Control": "private, no-store",
    },
  });
}
