import Link from "next/link";
import { StudyStatus } from "@/generated/prisma/client";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const statusLabel: Record<StudyStatus, string> = {
  DRAFT: "Robocze",
  ACTIVE: "W realizacji",
  COMPLETED: "Zakończone",
  CANCELLED: "Anulowane",
  INTERRUPTED: "Przerwane",
};

export default async function StudiesPage() {
  await requireUser();
  const studies = await prisma.study.findMany({
    orderBy: { updatedAt: "desc" },
    include: { client: true, responsibleTechnologist: true, standard: true, _count: { select: { samples: true } } },
  });

  return (
    <main className="standalone-page">
      <div className="topline">
        <div><div className="eyebrow">Rejestr</div><h1>Zlecenia</h1><div className="subtle">Wszystkie badania stabilności — aktywne i historyczne.</div></div>
        <div className="top-actions"><Link href="/" className="btn btn-secondary">← Dashboard</Link><Link href="/studies/new" className="btn btn-primary">+ Nowe zlecenie</Link></div>
      </div>

      <section className="section">
        <div className="table-card">
          <table>
            <thead><tr><th>Nr badania</th><th>Projekt</th><th>Klient</th><th>Technolog</th><th>Start</th><th>Standard</th><th>Próbki</th><th>Status</th></tr></thead>
            <tbody>{studies.map((study) => (
              <tr key={study.id}>
                <td><Link className="primary-cell" href={`/studies/${study.id}`}>{study.studyNumber}</Link></td>
                <td><Link className="primary-cell" href={`/studies/${study.id}`}>{study.projectName}</Link></td>
                <td>{study.client.name}</td>
                <td>{study.responsibleTechnologist.name}</td>
                <td>{study.startDate.toLocaleDateString("pl-PL")}</td>
                <td>{study.standard?.name ?? "—"}</td>
                <td>{study._count.samples}</td>
                <td><span className={`badge ${study.status === "ACTIVE" ? "teal" : study.status === "COMPLETED" ? "success" : study.status === "INTERRUPTED" || study.status === "CANCELLED" ? "danger" : "warning"}`}>{statusLabel[study.status]}</span></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
