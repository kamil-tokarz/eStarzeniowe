import Link from "next/link";
import { notFound } from "next/navigation";
import { Evaluation, SampleRole } from "@/generated/prisma/client";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function StudyPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const study = await prisma.study.findUnique({
    where: { id },
    include: {
      client: true,
      responsibleTechnologist: true,
      standard: true,
      components: true,
      criteria: { include: { testDefinition: true, currentVersion: true, versions: { orderBy: { version: "desc" }, take: 1 } } },
      samples: {
        orderBy: [{ nominalDate: "asc" }, { code: "asc" }],
        include: { tests: { include: { testDefinition: true, result: true } }, microbiologyResult: true },
      },
      auditEvents: { orderBy: { createdAt: "desc" }, take: 10, include: { author: true } },
    },
  });
  if (!study) notFound();

  const executable = study.samples.filter((s) => s.role !== SampleRole.REFERENCE);
  const completed = executable.filter((s) => s.executionStatus === "COMPLETED").length;
  const results = study.samples.flatMap((sample) => sample.tests.flatMap((test) => test.result ? [{ sample, test, result: test.result }] : []));
  const nokResults = results.filter((x) => x.result.currentEvaluation === Evaluation.NOK);
  const references = study.samples.filter((s) => s.role === SampleRole.REFERENCE);

  return (
    <main className="standalone-page">
      <div className="topline">
        <div>
          <div className="eyebrow">{study.studyNumber} · {study.client.name}</div>
          <h1>{study.projectName}</h1>
          <div className="subtle">Technolog: {study.responsibleTechnologist.name} · Start: {study.startDate.toLocaleDateString("pl-PL")} · {study.standard?.name ?? "bez standardu"}</div>
        </div>
        <div className="top-actions"><Link href="/studies" className="btn btn-secondary">← Zlecenia</Link></div>
      </div>

      <section className="kpi-grid">
        <div className="kpi teal"><div className="kpi-value">{completed}/{executable.length}</div><div className="kpi-label">Próbki wykonane</div><div className="kpi-note">postęp całego badania</div></div>
        <div className="kpi danger"><div className="kpi-value">{nokResults.length}</div><div className="kpi-label">Aktualne NOK</div><div className="kpi-note">według bieżących kryteriów</div></div>
        <div className="kpi teal"><div className="kpi-value">{references.filter((r) => r.referenceStatus === "AVAILABLE").length}</div><div className="kpi-label">RF dostępne</div><div className="kpi-note">próbki referencyjne OOS backup</div></div>
        <div className="kpi"><div className="kpi-value">{study.criteria.length}</div><div className="kpi-label">Kryteria</div><div className="kpi-note">aktywny zakres badań</div></div>
      </section>

      {nokResults.length > 0 && <section className="section">
        <div className="section-head"><div><div className="eyebrow">Wymaga uwagi</div><div className="section-title">Wyniki NOK</div></div></div>
        <div className="table-card"><table><thead><tr><th>Próbka</th><th>Badanie</th><th>Wynik</th><th>Warunek</th><th>Zapisano</th></tr></thead><tbody>
          {nokResults.map(({ sample, test, result }) => <tr key={result.id}>
            <td className="primary-cell">{sample.code}</td><td>{test.testDefinition.name}</td>
            <td><span className="badge danger"><span className="dot" />{result.numericValue ?? result.textValue ?? String(result.booleanValue)}</span></td>
            <td>{sample.storageCondition}</td><td>{result.updatedAt.toLocaleString("pl-PL")}</td>
          </tr>)}
        </tbody></table></div>
      </section>}

      <section className="section">
        <div className="section-head"><div><div className="eyebrow">Plan badania</div><div className="section-title">Próbki</div></div></div>
        <div className="table-card"><table><thead><tr><th>Kod</th><th>Rola</th><th>Checkpoint</th><th>Termin</th><th>Warunek</th><th>Realizacja</th></tr></thead><tbody>
          {study.samples.map((sample) => <tr key={sample.id}>
            <td className="primary-cell">{sample.code}</td>
            <td>{sample.role === "REFERENCE" ? <span className="badge warning">RF / OOS backup</span> : sample.role === "MICROBIOLOGY" ? "Mikrobiologia" : "Standardowa"}</td>
            <td>{sample.checkpointLabel ?? "—"}</td><td>{sample.nominalDate?.toLocaleDateString("pl-PL") ?? "—"}</td>
            <td>{sample.storageCondition}</td><td>{sample.role === "REFERENCE" ? sample.referenceStatus : sample.executionStatus}</td>
          </tr>)}
        </tbody></table></div>
      </section>

      <section className="section">
        <div className="section-head"><div><div className="eyebrow">Specyfikacja</div><div className="section-title">Kryteria akceptacji</div></div></div>
        <div className="table-card"><table><thead><tr><th>Badanie</th><th>Typ</th><th>Aktualne kryterium</th><th>Wersja</th></tr></thead><tbody>
          {study.criteria.map((criterion) => {
            const v = criterion.currentVersion;
            const value = !v ? "—" : v.minValue != null || v.maxValue != null ? `${v.minValue ?? "−∞"} – ${v.maxValue ?? "+∞"}` : v.expectedText ?? (v.expectedBoolean == null ? "—" : v.expectedBoolean ? "TAK" : "NIE");
            return <tr key={criterion.id}><td className="primary-cell">{criterion.testDefinition.name}</td><td>{criterion.kind}</td><td>{value}</td><td>v{v?.version ?? 1}</td></tr>;
          })}
        </tbody></table></div>
      </section>

      <section className="section">
        <div className="section-head"><div><div className="eyebrow">Traceability</div><div className="section-title">Ostatnia aktywność</div></div></div>
        <div className="activity-list">
          {study.auditEvents.length ? study.auditEvents.map((event) => <div className="activity-row" key={event.id}><span>{event.createdAt.toLocaleString("pl-PL")}</span><strong>{event.message}</strong><small>{event.author?.name ?? "System"}</small></div>) : <div className="empty-state"><span>Brak dodatkowych zdarzeń w historii.</span></div>}
        </div>
      </section>
    </main>
  );
}
