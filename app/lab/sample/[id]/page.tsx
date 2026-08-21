import Link from "next/link";
import { notFound } from "next/navigation";
import { Evaluation, ReferenceStatus, ResultState, SampleRole, StudyStatus, TestValueType, UserRole } from "@/generated/prisma/client";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/app-shell";

function initialComplete(aerosol: boolean, m: { initialWeightG: number | null; initialPressureBar: number | null; weightNotPerformed: boolean; weightNotPerformedReason: string | null; pressureNotPerformed: boolean; pressureNotPerformedReason: string | null } | null) {
  if (!m) return false;
  const weight = m.initialWeightG != null || (m.weightNotPerformed && Boolean(m.weightNotPerformedReason));
  const pressure = !aerosol || m.initialPressureBar != null || (m.pressureNotPerformed && Boolean(m.pressureNotPerformedReason));
  return weight && pressure;
}
function criterionText(test: { studyCriterion: { currentVersion: { minValue: number | null; maxValue: number | null; expectedText: string | null; expectedBoolean: boolean | null } | null } | null }) {
  const v = test.studyCriterion?.currentVersion;
  if (!v) return "Informacyjnie";
  if (v.minValue != null || v.maxValue != null) return `${v.minValue ?? "−∞"} – ${v.maxValue ?? "+∞"}`;
  if (v.expectedText != null) return v.expectedText;
  if (v.expectedBoolean != null) return v.expectedBoolean ? "TAK" : "NIE";
  return "—";
}

export default async function LabSamplePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string; conflicts?: string; errors?: string; error?: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const feedback = await searchParams;
  const sample = await prisma.sample.findUnique({
    where: { id },
    include: {
      study: { include: { client: true, samples: { select: { id: true, initialMeasurement: true } } } },
      initialMeasurement: true,
      microbiologyResult: true,
      tests: { orderBy: { sortOrder: "asc" }, include: { testDefinition: true, result: { include: { author: true } }, studyCriterion: { include: { currentVersion: true } } } },
    },
  });
  if (!sample) notFound();

  const canEdit = user.role === UserRole.LAB_TECHNICIAN || user.role === UserRole.ADMIN;
  const thisInitialDone = initialComplete(sample.study.aerosol, sample.initialMeasurement);
  const allInitialDone = sample.study.samples.length > 0 && sample.study.samples.every((row) => initialComplete(sample.study.aerosol, row.initialMeasurement));
  const dictionaries = await prisma.dictionaryEntry.findMany({ where: { active: true, category: { in: ["appearance", "odor", "color", "spray"] } }, orderBy: { sortOrder: "asc" } });
  const dictionaryMap: Record<string, string> = { APPEARANCE: "appearance", ODOR: "odor", COLOR: "color", SPRAY_TYPE: "spray" };
  const valuesFor = (code: string) => dictionaries.filter((entry) => entry.category === dictionaryMap[code]).map((entry) => entry.value);
  const completedTests = sample.tests.filter((test) => test.result).length;
  const nokCount = sample.tests.filter((test) => test.result?.currentEvaluation === Evaluation.NOK).length + (sample.microbiologyResult?.evaluation === Evaluation.NOK ? 1 : 0);

  const errorText: Record<string, string> = {
    inactive: "Próbka nie należy już do aktywnego badania.",
    "initial-weight": "Podaj wagę początkową albo wybierz „Nie wykonano” i wpisz powód.",
    "initial-pressure": "Podaj ciśnienie początkowe albo wybierz „Nie wykonano” i wpisz powód.",
    initials: "Najpierw zakończ badania wstępne wszystkich próbek w zleceniu.",
    reference: "Próbka referencyjna nie została aktywowana przez Technologa.",
  };

  return <AppShell user={user} active="lab">
    <div className="topline"><div><div className="eyebrow">{sample.study.studyNumber} · {sample.study.client.name}</div><h1>{sample.code}</h1><div className="subtle">{sample.study.projectName} · {sample.storageCondition} · {sample.checkpointLabel || "RF"}</div></div><div className="top-actions"><Link className="btn btn-secondary" href="/lab">← Laboratorium</Link><Link className="btn btn-secondary" href={`/studies/${sample.studyId}`}>Karta badania</Link></div></div>

    {feedback.saved && <div className="save-banner success-banner">{feedback.saved === "initial" ? "Zapisano badania wstępne." : `Zapisano: ${feedback.saved}.`}</div>}
    {Number(feedback.conflicts ?? 0) > 0 && <div className="save-banner danger-banner">Nie nadpisano {feedback.conflicts} wyników zmienionych równolegle przez innego użytkownika. Odświeżone wartości są poniżej.</div>}
    {Number(feedback.errors ?? 0) > 0 && <div className="save-banner danger-banner">Nie zapisano {feedback.errors} pozycji z błędami walidacji. Popraw zaznaczone dane i zapisz ponownie.</div>}
    {feedback.error && <div className="save-banner danger-banner">{errorText[feedback.error] ?? "Nie udało się wykonać operacji."}</div>}

    <section className="sample-hero"><div><span>Rola</span><strong>{sample.role === SampleRole.REFERENCE ? "RF / OOS backup" : sample.role === SampleRole.MICROBIOLOGY ? "Mikrobiologia" : "Próbka standardowa"}</strong></div><div><span>Termin nominalny</span><strong>{sample.nominalDate?.toLocaleDateString("pl-PL") ?? "Brak — RF"}</strong></div><div><span>Postęp</span><strong>{sample.role === SampleRole.MICROBIOLOGY ? (sample.microbiologyResult ? "1 / 1" : "0 / 1") : `${completedTests} / ${sample.tests.length}`}</strong></div><div><span>NOK</span><strong className={nokCount ? "danger-text" : ""}>{nokCount}</strong></div></section>

    <section className="section">
      <div className="section-head"><div><div className="eyebrow">Etap 1</div><div className="section-title">Badania wstępne</div><div className="subtle">Pomiary bazowe tej fizycznej próbki.</div></div>{thisInitialDone && <span className="badge success">Gotowe</span>}</div>
      <form method="post" action={`/api/lab/sample/${sample.id}`} className="measurement-card">
        <input type="hidden" name="intent" value="initial" />
        <div className="measurement-field"><label>Waga początkowa [g]<input name="initialWeightG" type="number" step="0.01" defaultValue={sample.initialMeasurement?.initialWeightG ?? ""} disabled={!canEdit} /></label><label className="inline-check"><input name="weightNotPerformed" type="checkbox" defaultChecked={sample.initialMeasurement?.weightNotPerformed} disabled={!canEdit} /> Nie wykonano</label><input name="weightReason" placeholder="Powód, jeśli nie wykonano" defaultValue={sample.initialMeasurement?.weightNotPerformedReason ?? ""} disabled={!canEdit} /></div>
        {sample.study.aerosol && <div className="measurement-field"><label>Ciśnienie początkowe [bar]<input name="initialPressureBar" type="number" step="0.01" defaultValue={sample.initialMeasurement?.initialPressureBar ?? ""} disabled={!canEdit} /></label><label className="inline-check"><input name="pressureNotPerformed" type="checkbox" defaultChecked={sample.initialMeasurement?.pressureNotPerformed} disabled={!canEdit} /> Nie wykonano</label><input name="pressureReason" placeholder="Powód, jeśli nie wykonano" defaultValue={sample.initialMeasurement?.pressureNotPerformedReason ?? ""} disabled={!canEdit} /></div>}
        {canEdit && <button className="btn btn-primary" type="submit">Zapisz badania wstępne</button>}
      </form>
    </section>

    {!allInitialDone && sample.study.status === StudyStatus.ACTIVE && <div className="info-callout warning-callout"><div><strong>Badania właściwe są jeszcze zablokowane</strong><span>W tym zleceniu pozostały próbki bez kompletu badań wstępnych. Wyniki właściwe otworzą się automatycznie po ich uzupełnieniu.</span></div><Link className="btn btn-secondary" href="/lab">Zobacz kolejkę wstępną</Link></div>}
    {sample.role === SampleRole.REFERENCE && sample.referenceStatus === ReferenceStatus.AVAILABLE && <div className="info-callout"><div><strong>Próbka referencyjna jest w rezerwie</strong><span>Nie pojawia się w normalnej kolejce. Technolog może ją aktywować z wyniku NOK/OOS.</span></div></div>}

    {allInitialDone && sample.study.status === StudyStatus.ACTIVE && sample.role === SampleRole.MICROBIOLOGY && <section className="section">
      <div className="section-head"><div><div className="eyebrow">Etap 2</div><div className="section-title">Mikrobiologia zewnętrzna</div><div className="subtle">Jedna wspólna ocena OK/NOK dla próbki. Zakres badań pozostaje informacją w zleceniu.</div></div></div>
      <form method="post" action="/api/lab/microbiology" encType="multipart/form-data" className="micro-card"><input type="hidden" name="sampleId" value={sample.id} /><label className="field">Ocena *<select name="evaluation" defaultValue={sample.microbiologyResult?.evaluation ?? Evaluation.OK} disabled={!canEdit}><option value={Evaluation.OK}>OK</option><option value={Evaluation.NOK}>NOK</option></select></label><label className="field field-wide">Nazwa / numer raportu<input name="reportName" defaultValue={sample.microbiologyResult?.reportName ?? ""} placeholder="np. Raport LAB-2026-001" disabled={!canEdit} /></label><label className="field field-wide">Załącznik raportu<input name="reportFile" type="file" accept="application/pdf,image/png,image/jpeg" disabled={!canEdit} /><small>Opcjonalnie PDF, PNG lub JPG · maks. 10 MB.</small></label>{sample.microbiologyResult?.reportPath && <div className="micro-report-link"><span>Aktualny załącznik:</span><a className="section-link" href={`/api/lab/microbiology/${sample.id}/report`} target="_blank" rel="noreferrer">{sample.microbiologyResult.reportName || "Otwórz raport"} ↗</a></div>}{canEdit && <button className="btn btn-primary" type="submit">Zapisz wynik mikrobiologii</button>}</form>
    </section>}

    {allInitialDone && sample.study.status === StudyStatus.ACTIVE && sample.role !== SampleRole.MICROBIOLOGY && !(sample.role === SampleRole.REFERENCE && sample.referenceStatus === ReferenceStatus.AVAILABLE) && <section className="section">
      <div className="section-head"><div><div className="eyebrow">Etap 2</div><div className="section-title">Badania właściwe</div><div className="subtle">Każdy zapis dotyczy tej konkretnej fizycznej próbki. NOK nie blokuje ukończenia próbki.</div></div></div>
      <form method="post" action={`/api/lab/sample/${sample.id}`} className="results-form"><input type="hidden" name="intent" value="results" /><div className="results-table-head"><span>Badanie</span><span>Kryterium</span><span>Wynik</span><span>Ocena</span><span>Stan</span><span>Powód / historia</span></div>
        {sample.tests.map((test) => { const result = test.result; const values = valuesFor(test.testDefinition.code); const initial = test.testDefinition.code === "WEIGHT" ? sample.initialMeasurement?.initialWeightG : test.testDefinition.code === "PRESSURE" ? sample.initialMeasurement?.initialPressureBar : null; const actual = result?.numericValue ?? null; const difference = initial != null && actual != null ? actual - initial : null; const percent = initial != null && actual != null && initial !== 0 ? ((actual - initial) / initial) * 100 : null; return <div className="result-row" key={test.id}>
          <div><strong>{test.testDefinition.name}</strong><small>{test.testDefinition.unit || test.testDefinition.category}{initial != null && <><br />Bazowa: {initial}{test.testDefinition.unit ? ` ${test.testDefinition.unit}` : ""}</>}</small></div><div className="criterion-value">{criterionText(test)}</div>
          <div>{test.testDefinition.valueType === TestValueType.NUMBER ? <input name={`value_${test.id}`} type="number" step="any" defaultValue={result?.numericValue ?? ""} disabled={!canEdit} /> : test.testDefinition.valueType === TestValueType.BOOLEAN ? <select name={`value_${test.id}`} defaultValue={result?.booleanValue == null ? "" : result.booleanValue ? "true" : "false"} disabled={!canEdit}><option value="">—</option><option value="true">TAK</option><option value="false">NIE</option></select> : values.length ? <select name={`value_${test.id}`} defaultValue={result?.textValue ?? ""} disabled={!canEdit}><option value="">Wybierz</option>{values.map((value) => <option key={value} value={value}>{value}</option>)}</select> : <input name={`value_${test.id}`} defaultValue={result?.textValue ?? ""} disabled={!canEdit} />}{difference != null && <small className="delta-note">Δ {difference >= 0 ? "+" : ""}{difference.toFixed(2)} · {percent == null ? "—" : `${percent >= 0 ? "+" : ""}${percent.toFixed(2)}%`}</small>}</div>
          <div>{result ? <span className={`badge ${result.currentEvaluation === Evaluation.NOK ? "danger" : result.currentEvaluation === Evaluation.OK ? "success" : "neutral"}`}>{result.currentEvaluation === Evaluation.NOT_APPLICABLE ? "—" : result.currentEvaluation}</span> : <span className="subtle">po zapisie</span>}</div><div><select name={`state_${test.id}`} defaultValue={result?.state ?? ResultState.RECORDED} disabled={!canEdit}><option value={ResultState.RECORDED}>Wynik</option><option value={ResultState.NOT_PERFORMED}>Nie wykonano</option></select><input type="hidden" name={`version_${test.id}`} value={result?.version ?? ""} /></div><div><input name={`reason_${test.id}`} placeholder="Powód, jeśli nie wykonano" defaultValue={result?.notPerformedReason ?? ""} disabled={!canEdit} />{result && <small>{result.author.name} · {result.updatedAt.toLocaleString("pl-PL")}</small>}</div>
        </div>; })}
        {canEdit && <div className="results-actions"><span>Zmiany zapisują się dopiero po kliknięciu. Konflikt na jednym wyniku nie nadpisze pracy drugiej osoby.</span><button className="btn btn-primary btn-large" type="submit">Zapisz wyniki</button></div>}
      </form>
    </section>}
  </AppShell>;
}
