import Link from "next/link";
import { notFound } from "next/navigation";
import { Evaluation, ReferenceStatus, ResultState, SampleExecutionStatus, SampleRole, StudyStatus, TestValueType, UserRole } from "@/generated/prisma/client";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/app-shell";

function startOfWeek(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  return d;
}
function endOfWeek(date: Date) {
  const d = startOfWeek(date);
  d.setDate(d.getDate() + 6);
  d.setHours(23, 59, 59, 999);
  return d;
}
function timing(sample: { role: SampleRole; referenceStatus: ReferenceStatus | null; executionStatus: SampleExecutionStatus; nominalDate: Date | null }, now = new Date()) {
  if (sample.role === SampleRole.REFERENCE) return sample.referenceStatus === ReferenceStatus.ACTIVATED ? "RF" : null;
  if (sample.executionStatus === SampleExecutionStatus.COMPLETED || !sample.nominalDate) return null;
  const sprintStart = startOfWeek(sample.nominalDate);
  const sprintEnd = endOfWeek(sample.nominalDate);
  if (now < sprintStart) return "PLANNED";
  if (now <= sample.nominalDate) return "DUE";
  if (now <= sprintEnd) return "LATE";
  return "OVERDUE";
}
function initialComplete(aerosol: boolean, m: { initialWeightG: number | null; initialPressureBar: number | null; weightNotPerformed: boolean; weightNotPerformedReason: string | null; pressureNotPerformed: boolean; pressureNotPerformedReason: string | null } | null) {
  if (!m) return false;
  const weight = m.initialWeightG != null || (m.weightNotPerformed && Boolean(m.weightNotPerformedReason));
  const pressure = !aerosol || m.initialPressureBar != null || (m.pressureNotPerformed && Boolean(m.pressureNotPerformedReason));
  return weight && pressure;
}
function criterionText(row: { studyCriterion: { currentVersion: { minValue: number | null; maxValue: number | null; expectedText: string | null; expectedBoolean: boolean | null } | null } | null }) {
  const v = row.studyCriterion?.currentVersion;
  if (!v) return "Informacyjnie";
  if (v.minValue != null || v.maxValue != null) return `${v.minValue ?? "−∞"} – ${v.maxValue ?? "+∞"}`;
  if (v.expectedText != null) return v.expectedText;
  if (v.expectedBoolean != null) return v.expectedBoolean ? "TAK" : "NIE";
  return "—";
}

export default async function BatchTestPage({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<{ saved?: string; conflicts?: string; errors?: string }> }) {
  const user = await requireUser();
  const { code } = await params;
  const feedback = await searchParams;
  const testDefinition = await prisma.testDefinition.findUnique({ where: { code } });
  if (!testDefinition) notFound();

  const rowsRaw = await prisma.sampleTest.findMany({
    where: { testDefinitionId: testDefinition.id, sample: { study: { status: StudyStatus.ACTIVE } } },
    orderBy: { sample: { nominalDate: "asc" } },
    include: {
      result: { include: { author: true } },
      studyCriterion: { include: { currentVersion: true } },
      sample: { include: { initialMeasurement: true, study: { include: { client: true, samples: { select: { initialMeasurement: true } } } } } },
    },
  });
  const rows = rowsRaw.filter((row) => {
    const studyReady = row.sample.study.samples.length > 0 && row.sample.study.samples.every((sample) => initialComplete(row.sample.study.aerosol, sample.initialMeasurement));
    const t = timing(row.sample);
    return studyReady && (t === "DUE" || t === "LATE" || t === "OVERDUE" || t === "RF");
  });
  const canEdit = user.role === UserRole.LAB_TECHNICIAN || user.role === UserRole.ADMIN;
  const dictionaryKey: Record<string, string> = { APPEARANCE: "appearance", ODOR: "odor", COLOR: "color", SPRAY_TYPE: "spray" };
  const dictionaryValues = dictionaryKey[code] ? await prisma.dictionaryEntry.findMany({ where: { category: dictionaryKey[code], active: true }, orderBy: { sortOrder: "asc" } }) : [];

  return <AppShell user={user} active="lab">
    <div className="topline"><div><div className="eyebrow">Laboratorium · tryb seryjny</div><h1>{testDefinition.name}</h1><div className="subtle">Wprowadzaj wyniki wielu próbek bez otwierania każdej z osobna.</div></div><div className="top-actions"><Link className="btn btn-secondary" href="/lab?mode=test">← Lista badań</Link></div></div>
    {(feedback.saved || feedback.conflicts || feedback.errors) && <div className="batch-feedback"><span className="badge success">Zapisano: {feedback.saved ?? 0}</span>{Number(feedback.conflicts ?? 0) > 0 && <span className="badge warning">Konflikty: {feedback.conflicts}</span>}{Number(feedback.errors ?? 0) > 0 && <span className="badge danger">Błędy walidacji: {feedback.errors}</span>}</div>}
    <section className="section">
      <div className="section-head"><div><div className="eyebrow">Bieżący sprint + zaległości</div><div className="section-title">{rows.length} próbek</div></div></div>
      {rows.length === 0 ? <div className="empty-state large-empty"><strong>Brak próbek dla tego badania</strong><span>Nie ma teraz wyników do wprowadzenia w tym trybie.</span></div> : <form method="post" action={`/api/lab/test/${encodeURIComponent(code)}`} className="batch-form">
        <div className="batch-table-card"><div className="batch-table-head"><span>Status</span><span>Próbka / projekt</span><span>Termin / warunek</span><span>Kryterium</span><span>Wynik</span><span>Ocena</span><span>Stan / powód</span></div>
          {rows.map((row) => { const t = timing(row.sample); const result = row.result; const initial = code === "WEIGHT" ? row.sample.initialMeasurement?.initialWeightG : code === "PRESSURE" ? row.sample.initialMeasurement?.initialPressureBar : null; return <div className="batch-row" key={row.id}>
            <input type="hidden" name="sampleTestId" value={row.id} /><input type="hidden" name={`version_${row.id}`} value={result?.version ?? ""} />
            <div><span className={`badge ${t === "OVERDUE" ? "danger" : t === "LATE" ? "warning" : "teal"}`}>{t === "OVERDUE" ? "Przeterm." : t === "LATE" ? "Zaległa" : t === "RF" ? "RF" : "Do wykonania"}</span></div>
            <div><Link className="primary-cell" href={`/lab/sample/${row.sample.id}`}>{row.sample.code}</Link><small>{row.sample.study.projectName}<br />{row.sample.study.studyNumber} · {row.sample.study.client.name}</small></div>
            <div>{row.sample.nominalDate?.toLocaleDateString("pl-PL") ?? "—"}<small>{row.sample.storageCondition}</small></div>
            <div className="criterion-value">{criterionText(row)}{initial != null && <small>Bazowa: {initial}{testDefinition.unit ? ` ${testDefinition.unit}` : ""}</small>}</div>
            <div>{testDefinition.valueType === TestValueType.NUMBER ? <input name={`value_${row.id}`} type="number" step="any" defaultValue={result?.numericValue ?? ""} disabled={!canEdit} /> : testDefinition.valueType === TestValueType.BOOLEAN ? <select name={`value_${row.id}`} defaultValue={result?.booleanValue == null ? "" : result.booleanValue ? "true" : "false"} disabled={!canEdit}><option value="">—</option><option value="true">TAK</option><option value="false">NIE</option></select> : dictionaryValues.length ? <select name={`value_${row.id}`} defaultValue={result?.textValue ?? ""} disabled={!canEdit}><option value="">Wybierz</option>{dictionaryValues.map((entry) => <option key={entry.id} value={entry.value}>{entry.value}</option>)}</select> : <input name={`value_${row.id}`} defaultValue={result?.textValue ?? ""} disabled={!canEdit} />}</div>
            <div>{result ? <span className={`badge ${result.currentEvaluation === Evaluation.NOK ? "danger" : result.currentEvaluation === Evaluation.OK ? "success" : "neutral"}`}>{result.currentEvaluation === Evaluation.NOT_APPLICABLE ? "—" : result.currentEvaluation}</span> : <span className="subtle">po zapisie</span>}</div>
            <div><select name={`state_${row.id}`} defaultValue={result?.state ?? ResultState.RECORDED} disabled={!canEdit}><option value={ResultState.RECORDED}>Wynik</option><option value={ResultState.NOT_PERFORMED}>Nie wykonano</option></select><input name={`reason_${row.id}`} placeholder="Powód, jeśli nie wykonano" defaultValue={result?.notPerformedReason ?? ""} disabled={!canEdit} />{result && <small>{result.author.name} · {result.updatedAt.toLocaleString("pl-PL")}</small>}</div>
          </div>; })}
        </div>
        {canEdit && <div className="results-actions"><span>Poprawne wiersze zapiszą się nawet wtedy, gdy inny wiersz ma błąd lub konflikt.</span><button className="btn btn-primary btn-large" type="submit">Zapisz wyniki</button></div>}
      </form>}
    </section>
  </AppShell>;
}
