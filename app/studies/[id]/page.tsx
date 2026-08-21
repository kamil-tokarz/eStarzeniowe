import Link from "next/link";
import { notFound } from "next/navigation";
import { Evaluation, SampleRole, StudyStatus, UserRole } from "@/generated/prisma/client";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/app-shell";
import { cancelStudyAction, handoverStudyAction } from "@/app/studies/actions";

const statusLabel: Record<StudyStatus, string> = {
  DRAFT: "Robocze",
  ACTIVE: "W realizacji",
  COMPLETED: "Zakończone",
  CANCELLED: "Anulowane",
  INTERRUPTED: "Przerwane",
};

export default async function StudyPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const study = await prisma.study.findUnique({
    where: { id },
    include: {
      client: true,
      responsibleTechnologist: true,
      standard: { include: { definitions: { orderBy: { sortOrder: "asc" } } } },
      components: true,
      criteria: { include: { testDefinition: true, currentVersion: true, versions: { orderBy: { version: "desc" }, take: 1 } } },
      samples: {
        orderBy: [{ nominalDate: "asc" }, { code: "asc" }],
        include: { initialMeasurement: true, tests: { include: { testDefinition: true, result: true } }, microbiologyResult: true },
      },
      auditEvents: { orderBy: { createdAt: "desc" }, take: 12, include: { author: true } },
    },
  });
  if (!study) notFound();

  const executable = study.samples.filter((s) => s.role !== SampleRole.REFERENCE);
  const completed = executable.filter((s) => s.executionStatus === "COMPLETED").length;
  const results = study.samples.flatMap((sample) => sample.tests.flatMap((test) => test.result ? [{ sample, test, result: test.result }] : []));
  const nokResults = results.filter((x) => x.result.currentEvaluation === Evaluation.NOK);
  const references = study.samples.filter((s) => s.role === SampleRole.REFERENCE);
  const canManage = user.role === UserRole.TECHNOLOGIST || user.role === UserRole.ADMIN;
  const initialDone = study.samples.length > 0 && study.samples.every((sample) => {
    const m = sample.initialMeasurement;
    if (!m) return false;
    const weightDone = m.initialWeightG != null || (m.weightNotPerformed && Boolean(m.weightNotPerformedReason));
    const pressureDone = !study.aerosol || m.initialPressureBar != null || (m.pressureNotPerformed && Boolean(m.pressureNotPerformedReason));
    return weightDone && pressureDone;
  });

  return (
    <AppShell user={user} active="studies">
      <div className="topline">
        <div>
          <div className="eyebrow">{study.studyNumber} · {study.client.name}</div>
          <h1>{study.projectName}</h1>
          <div className="subtle">Technolog: {study.responsibleTechnologist.name} · Start: {study.startDate.toLocaleDateString("pl-PL")} · {study.standard?.name ?? "bez standardu"}</div>
        </div>
        <div className="top-actions">
          <span className={`badge ${study.status === StudyStatus.ACTIVE ? "teal" : study.status === StudyStatus.COMPLETED ? "success" : study.status === StudyStatus.INTERRUPTED ? "danger" : "neutral"}`}>{statusLabel[study.status]}</span>
          <Link href="/studies" className="btn btn-secondary">← Zlecenia</Link>
        </div>
      </div>

      {study.status === StudyStatus.DRAFT && (
        <section className="draft-callout">
          <div>
            <div className="eyebrow">Zlecenie robocze</div>
            <h2>Gotowe do przekazania?</h2>
            <p>Po przekazaniu zamrozimy standard, zakres badań i wygenerujemy fizyczne próbki. Data rozpoczęcia nie może być wcześniejsza niż dzień przekazania.</p>
          </div>
          {canManage && <form action={handoverStudyAction}><input type="hidden" name="studyId" value={study.id} /><button className="btn btn-primary btn-large" type="submit">Przekaż do Laboratorium</button></form>}
        </section>
      )}

      {study.status === StudyStatus.ACTIVE && !initialDone && (
        <section className="info-callout warning-callout"><div><strong>Najpierw badania wstępne</strong><span>Laboratorium musi zapisać wagę początkową wszystkich próbek oraz ciśnienie dla aerozoli. Dopiero potem otworzą się badania właściwe.</span></div><Link className="btn btn-secondary" href="/lab">Otwórz Laboratorium</Link></section>
      )}

      <section className="kpi-grid">
        <div className="kpi teal"><div className="kpi-value">{study.samples.length ? `${completed}/${executable.length}` : "—"}</div><div className="kpi-label">Próbki wykonane</div><div className="kpi-note">bez niewykorzystanych RF</div></div>
        <div className="kpi danger"><div className="kpi-value">{nokResults.length}</div><div className="kpi-label">Aktualne NOK</div><div className="kpi-note">według bieżących kryteriów</div></div>
        <div className="kpi teal"><div className="kpi-value">{references.filter((r) => r.referenceStatus === "AVAILABLE").length}</div><div className="kpi-label">RF dostępne</div><div className="kpi-note">próbki referencyjne OOS backup</div></div>
        <div className="kpi"><div className="kpi-value">{study.criteria.length}</div><div className="kpi-label">Kryteria</div><div className="kpi-note">aktywny zakres badań</div></div>
      </section>

      <div className="study-tabs"><a href="#summary" className="active">Podsumowanie</a><a href="#results">Wyniki</a><a href="#samples">Próbki</a><a href="#criteria">Kryteria</a><a href="#history">Historia</a></div>

      <section className="section" id="summary">
        <div className="section-head"><div><div className="eyebrow">Specyfikacja zlecenia</div><div className="section-title">Podsumowanie</div></div></div>
        <div className="summary-grid">
          <div className="summary-card"><span>Projekt / ETS</span><strong>{study.projectName}</strong><small>{study.etsNumber || "Brak numeru ETS"}</small></div>
          <div className="summary-card"><span>Produkt</span><strong>{study.aerosol ? "Aerozol" : "Nieaerozol"}</strong><small>{study.aerosol ? `${study.gasType || "gaz nieokreślony"} · ${study.volumeMl ?? "—"} ml` : `${study.volumeMl ?? "—"} ml`}</small></div>
          <div className="summary-card"><span>Produkcja / start</span><strong>{study.productionDate.toLocaleDateString("pl-PL")}</strong><small>Start {study.startDate.toLocaleDateString("pl-PL")}</small></div>
          <div className="summary-card"><span>Cel</span><strong>{study.internalTest ? "Test wewnętrzny" : "Test dla klienta"}</strong><small>{study.purpose || "Bez dodatkowego opisu"}</small></div>
        </div>
        {study.components.length > 0 && <div className="table-card compact-table"><table><thead><tr><th>Rodzaj</th><th>Kod</th><th>Nazwa</th><th>Dostawca</th></tr></thead><tbody>{study.components.map((component) => <tr key={component.id}><td>{component.kind}</td><td>{component.code || "—"}</td><td className="primary-cell">{component.name}</td><td>{component.supplier || "—"}</td></tr>)}</tbody></table></div>}
      </section>

      {nokResults.length > 0 && <section className="section" id="results">
        <div className="section-head"><div><div className="eyebrow">Wymaga uwagi</div><div className="section-title">Wyniki NOK</div></div></div>
        <div className="table-card"><table><thead><tr><th>Próbka</th><th>Badanie</th><th>Wynik</th><th>Warunek</th><th>Zapisano</th></tr></thead><tbody>
          {nokResults.map(({ sample, test, result }) => <tr key={result.id}>
            <td className="primary-cell">{sample.code}</td><td>{test.testDefinition.name}</td>
            <td><span className="badge danger"><span className="dot" />{result.numericValue ?? result.textValue ?? String(result.booleanValue)}</span></td>
            <td>{sample.storageCondition}</td><td>{result.updatedAt.toLocaleString("pl-PL")}</td>
          </tr>)}
        </tbody></table></div>
      </section>}

      <section className="section" id="samples">
        <div className="section-head"><div><div className="eyebrow">Plan badania</div><div className="section-title">Próbki</div></div>{study.status === StudyStatus.ACTIVE && <Link className="section-link" href="/lab">Przejdź do Laboratorium →</Link>}</div>
        <div className="table-card"><table><thead><tr><th>Kod</th><th>Rola</th><th>Checkpoint</th><th>Termin</th><th>Warunek</th><th>Wstępne</th><th>Realizacja</th></tr></thead><tbody>
          {(study.samples.length ? study.samples : study.standard?.definitions ?? []).map((sample) => {
            const isGenerated = "studyId" in sample;
            const role = sample.role;
            const initial = isGenerated ? sample.initialMeasurement : null;
            const initialOk = initial ? (initial.initialWeightG != null || initial.weightNotPerformed) && (!study.aerosol || initial.initialPressureBar != null || initial.pressureNotPerformed) : false;
            return <tr key={sample.id}>
              <td className="primary-cell">{sample.code}</td>
              <td>{role === "REFERENCE" ? <span className="badge warning">RF / OOS backup</span> : role === "MICROBIOLOGY" ? "Mikrobiologia" : "Standardowa"}</td>
              <td>{sample.checkpointLabel ?? "—"}</td><td>{isGenerated ? sample.nominalDate?.toLocaleDateString("pl-PL") ?? "—" : sample.checkpointDays == null ? "—" : `+${sample.checkpointDays} dni`}</td>
              <td>{sample.storageCondition}</td><td>{isGenerated ? <span className={`badge ${initialOk ? "success" : "warning"}`}>{initialOk ? "Gotowe" : "Do wykonania"}</span> : "po przekazaniu"}</td>
              <td>{isGenerated ? <Link className="section-link" href={`/lab/sample/${sample.id}`}>{role === "REFERENCE" ? sample.referenceStatus : sample.executionStatus}</Link> : "—"}</td>
            </tr>;
          })}
        </tbody></table></div>
      </section>

      <section className="section" id="criteria">
        <div className="section-head"><div><div className="eyebrow">Specyfikacja</div><div className="section-title">Kryteria akceptacji</div></div></div>
        <div className="table-card"><table><thead><tr><th>Badanie</th><th>Typ</th><th>Aktualne kryterium</th><th>Wersja</th></tr></thead><tbody>
          {study.criteria.map((criterion) => {
            const v = criterion.currentVersion;
            const value = !v ? "—" : v.minValue != null || v.maxValue != null ? `${v.minValue ?? "−∞"} – ${v.maxValue ?? "+∞"}` : v.expectedText ?? (v.expectedBoolean == null ? "—" : v.expectedBoolean ? "TAK" : "NIE");
            return <tr key={criterion.id}><td className="primary-cell">{criterion.testDefinition.name}</td><td>{criterion.kind}</td><td>{value}</td><td>v{v?.version ?? 1}</td></tr>;
          })}
        </tbody></table></div>
      </section>

      <section className="section" id="history">
        <div className="section-head"><div><div className="eyebrow">Traceability</div><div className="section-title">Ostatnia aktywność</div></div></div>
        <div className="activity-list">
          {study.auditEvents.length ? study.auditEvents.map((event) => <div className="activity-row" key={event.id}><span>{event.createdAt.toLocaleString("pl-PL")}</span><strong>{event.message}</strong><small>{event.author?.name ?? "System"}</small></div>) : <div className="empty-state"><span>Brak dodatkowych zdarzeń w historii.</span></div>}
        </div>
      </section>

      {study.status === StudyStatus.DRAFT && canManage && <section className="danger-zone"><div><strong>Anuluj zlecenie</strong><span>Anulowanie jest nieodwracalne i wymaga podania powodu.</span></div><form action={cancelStudyAction} className="inline-form"><input type="hidden" name="studyId" value={study.id} /><input name="reason" placeholder="Powód anulowania" required /><button className="btn btn-danger" type="submit">Anuluj</button></form></section>}
    </AppShell>
  );
}
