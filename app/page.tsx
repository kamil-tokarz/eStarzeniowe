import Link from "next/link";
import { Evaluation, SampleExecutionStatus, SampleRole, StudyStatus, UserRole } from "@/generated/prisma/client";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logoutAction } from "@/app/login/actions";

function startOfWeek(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

function endOfWeek(date: Date) {
  const d = startOfWeek(date);
  d.setDate(d.getDate() + 6);
  d.setHours(23, 59, 59, 999);
  return d;
}

function timeliness(sample: { role: SampleRole; executionStatus: SampleExecutionStatus; nominalDate: Date | null }, now = new Date()) {
  if (sample.role === SampleRole.REFERENCE || sample.executionStatus === SampleExecutionStatus.COMPLETED || !sample.nominalDate) return null;
  const sprintStart = startOfWeek(sample.nominalDate);
  const sprintEnd = endOfWeek(sample.nominalDate);
  if (now < sprintStart) return "PLANNED";
  if (now <= sample.nominalDate) return "DUE";
  if (now <= sprintEnd) return "LATE";
  return "OVERDUE";
}

const roleLabel: Record<UserRole, string> = {
  ADMIN: "Administrator",
  TECHNOLOGIST: "Technolog",
  LAB_TECHNICIAN: "Laborant",
};

const statusLabel: Record<StudyStatus, string> = {
  DRAFT: "Robocze",
  ACTIVE: "W realizacji",
  COMPLETED: "Zakończone",
  CANCELLED: "Anulowane",
  INTERRUPTED: "Przerwane",
};

export default async function Home() {
  const user = await requireUser();
  const studies = await prisma.study.findMany({
    where: { status: StudyStatus.ACTIVE },
    orderBy: { startDate: "desc" },
    include: {
      client: true,
      responsibleTechnologist: true,
      samples: {
        include: {
          tests: { include: { result: true } },
          microbiologyResult: true,
        },
      },
    },
  });

  const completedThisYear = await prisma.study.count({
    where: {
      status: StudyStatus.COMPLETED,
      completedAt: { gte: new Date(new Date().getFullYear(), 0, 1) },
    },
  });

  const rows = studies.map((study) => {
    const executableSamples = study.samples.filter((sample) => sample.role !== SampleRole.REFERENCE);
    const completed = executableSamples.filter((sample) => sample.executionStatus === SampleExecutionStatus.COMPLETED).length;
    const nok = study.samples.reduce((count, sample) => {
      const testNok = sample.tests.filter((test) => test.result?.currentEvaluation === Evaluation.NOK).length;
      const microNok = sample.microbiologyResult?.evaluation === Evaluation.NOK ? 1 : 0;
      return count + testNok + microNok;
    }, 0);
    const late = executableSamples.filter((sample) => timeliness(sample) === "LATE").length;
    const overdue = executableSamples.filter((sample) => timeliness(sample) === "OVERDUE").length;
    const futureDates = executableSamples
      .filter((sample) => sample.executionStatus !== SampleExecutionStatus.COMPLETED && sample.nominalDate)
      .map((sample) => sample.nominalDate as Date)
      .sort((a, b) => a.getTime() - b.getTime());
    return {
      study,
      completed,
      total: executableSamples.length,
      nok,
      late,
      overdue,
      nextDate: futureDates[0] ?? null,
    };
  });

  const studiesWithNok = rows.filter((row) => row.nok > 0).length;
  const lateSamples = rows.reduce((sum, row) => sum + row.late, 0);
  const overdueSamples = rows.reduce((sum, row) => sum + row.overdue, 0);
  const attentionRows = rows.filter((row) => row.nok || row.late || row.overdue).slice(0, 6);

  return (
    <div className="page-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          <div>eStarzeniowe<small>Testy stabilności produktów</small></div>
        </div>
        <nav className="nav" aria-label="Główna nawigacja">
          <Link className="nav-item active" href="/">Dashboard</Link>
          <Link className="nav-item" href="/studies">Zlecenia</Link>
          <Link className="nav-item" href="/lab">Laboratorium</Link>
          {user.role === UserRole.ADMIN && <Link className="nav-item" href="/admin">Administracja</Link>}
        </nav>
        <div className="sidebar-user">
          <div className="secondary-cell">Zalogowano jako</div>
          <div className="primary-cell">{user.name}</div>
          <div className="user-role">{roleLabel[user.role]}</div>
          <form action={logoutAction}><button className="text-button" type="submit">Wyloguj</button></form>
        </div>
      </aside>

      <main className="main">
        <div className="topline">
          <div>
            <div className="eyebrow">Testy stabilności · dane na żywo</div>
            <h1>Dzień dobry, {user.name.split(" ")[0]}</h1>
            <div className="subtle">Najważniejsze informacje o aktywnych badaniach w jednym miejscu.</div>
          </div>
          <div className="top-actions">
            <Link className="btn btn-secondary" href="/#attention">Wymaga uwagi</Link>
            <Link className="btn btn-primary" href="/studies/new">+ Nowe zlecenie</Link>
          </div>
        </div>

        <section className="kpi-grid" aria-label="Podsumowanie">
          <div className="kpi teal"><div className="kpi-value">{studies.length}</div><div className="kpi-label">Aktywne badania</div><div className="kpi-note">{completedThisYear} zakończonych w tym roku</div></div>
          <div className="kpi danger"><div className="kpi-value">{studiesWithNok}</div><div className="kpi-label">Badania z NOK</div><div className="kpi-note">wyniki wymagające uwagi Technologa</div></div>
          <div className="kpi warning"><div className="kpi-value">{lateSamples}</div><div className="kpi-label">Zaległe próbki</div><div className="kpi-note">po terminie, jeszcze w swoim sprincie</div></div>
          <div className="kpi danger"><div className="kpi-value">{overdueSamples}</div><div className="kpi-label">Przeterminowane</div><div className="kpi-note">niewykonane z poprzednich sprintów</div></div>
        </section>

        <section className="section" id="attention">
          <div className="section-head">
            <div><div className="eyebrow">Priorytet</div><div className="section-title">Wymaga uwagi</div></div>
          </div>
          <div className="table-card">
            {attentionRows.length === 0 ? (
              <div className="empty-state"><strong>Brak elementów wymagających uwagi</strong><span>Nie ma aktywnych NOK ani zaległości.</span></div>
            ) : (
              <table>
                <thead><tr><th>Badanie</th><th>Klient</th><th>NOK</th><th>Zaległe</th><th>Przeterm.</th><th>Postęp</th></tr></thead>
                <tbody>{attentionRows.map((row) => (
                  <tr key={row.study.id}>
                    <td><Link href={`/studies/${row.study.id}`}><div className="primary-cell">{row.study.projectName}</div><div className="secondary-cell">{row.study.studyNumber}</div></Link></td>
                    <td>{row.study.client.name}</td>
                    <td>{row.nok ? <span className="badge danger"><span className="dot" />{row.nok} NOK</span> : "—"}</td>
                    <td>{row.late ? <span className="badge warning">{row.late}</span> : "—"}</td>
                    <td>{row.overdue ? <span className="badge danger">{row.overdue}</span> : "—"}</td>
                    <td>{row.completed} / {row.total}</td>
                  </tr>
                ))}</tbody>
              </table>
            )}
          </div>
        </section>

        <section className="section">
          <div className="section-head">
            <div><div className="eyebrow">Portfel badań</div><div className="section-title">Wszystkie aktywne badania</div></div>
            <Link href="/studies" className="section-link">Zobacz wszystkie →</Link>
          </div>
          <div className="table-card">
            <table>
              <thead><tr><th>Kod</th><th>Projekt</th><th>Klient</th><th>Technolog</th><th>Postęp próbek</th><th>NOK</th><th>Najbliższy termin</th><th>Status</th></tr></thead>
              <tbody>{rows.map((row) => {
                const percent = row.total ? Math.round((row.completed / row.total) * 100) : 0;
                return (
                  <tr key={row.study.id}>
                    <td className="primary-cell"><Link href={`/studies/${row.study.id}`}>{row.study.studyNumber}</Link></td>
                    <td><Link href={`/studies/${row.study.id}`} className="primary-cell">{row.study.projectName}</Link></td>
                    <td>{row.study.client.name}</td>
                    <td>{row.study.responsibleTechnologist.name}</td>
                    <td><div className="progress-cell"><div className="progress"><span style={{ width: `${percent}%` }} /></div><span>{row.completed} / {row.total}</span></div></td>
                    <td className={row.nok ? "danger-text" : undefined}>{row.nok}</td>
                    <td>{row.nextDate ? row.nextDate.toLocaleDateString("pl-PL") : "—"}</td>
                    <td><span className="badge teal">{statusLabel[row.study.status]}</span></td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
