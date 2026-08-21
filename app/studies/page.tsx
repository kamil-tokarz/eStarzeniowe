import Link from "next/link";
import { StudyStatus, UserRole } from "@/generated/prisma/client";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/app-shell";

const statusLabel: Record<StudyStatus, string> = {
  DRAFT: "Robocze",
  ACTIVE: "W realizacji",
  COMPLETED: "Zakończone",
  CANCELLED: "Anulowane",
  INTERRUPTED: "Przerwane",
};

const badgeTone: Record<StudyStatus, string> = {
  DRAFT: "neutral",
  ACTIVE: "teal",
  COMPLETED: "success",
  CANCELLED: "neutral",
  INTERRUPTED: "danger",
};

export default async function StudiesPage() {
  const user = await requireUser();
  const studies = await prisma.study.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      client: true,
      responsibleTechnologist: true,
      standard: true,
      _count: { select: { samples: true } },
    },
  });

  return (
    <AppShell user={user} active="studies">
      <div className="topline">
        <div>
          <div className="eyebrow">Zlecenia testów stabilności</div>
          <h1>Zlecenia</h1>
          <div className="subtle">Pełny rejestr badań — roboczych, aktywnych i historycznych.</div>
        </div>
        {(user.role === UserRole.TECHNOLOGIST || user.role === UserRole.ADMIN) && (
          <Link className="btn btn-primary" href="/studies/new">+ Nowe zlecenie</Link>
        )}
      </div>

      <section className="section">
        <div className="filter-strip">
          <span className="filter-chip active">Wszystkie · {studies.length}</span>
          <span className="filter-chip">Robocze · {studies.filter((s) => s.status === StudyStatus.DRAFT).length}</span>
          <span className="filter-chip">W realizacji · {studies.filter((s) => s.status === StudyStatus.ACTIVE).length}</span>
          <span className="filter-chip">Zakończone · {studies.filter((s) => s.status === StudyStatus.COMPLETED).length}</span>
        </div>
        <div className="table-card">
          <table>
            <thead><tr><th>Numer</th><th>Projekt</th><th>Klient</th><th>Technolog</th><th>Start</th><th>Standard</th><th>Próbki</th><th>Status</th></tr></thead>
            <tbody>
              {studies.map((study) => (
                <tr key={study.id}>
                  <td><Link className="primary-cell" href={`/studies/${study.id}`}>{study.studyNumber}</Link></td>
                  <td><Link href={`/studies/${study.id}`}><div className="primary-cell">{study.projectName}</div><div className="secondary-cell">{study.etsNumber || "Bez numeru ETS"}</div></Link></td>
                  <td>{study.client.name}</td>
                  <td>{study.responsibleTechnologist.name}</td>
                  <td>{study.startDate.toLocaleDateString("pl-PL")}</td>
                  <td>{study.standard?.name ?? "—"}</td>
                  <td>{study._count.samples || "—"}</td>
                  <td><span className={`badge ${badgeTone[study.status]}`}>{statusLabel[study.status]}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </AppShell>
  );
}
