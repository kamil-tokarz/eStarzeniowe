import Link from "next/link";
import { ReferenceStatus, SampleExecutionStatus, SampleRole, StudyStatus } from "@/generated/prisma/client";
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
function timeliness(sample: { role: SampleRole; referenceStatus: ReferenceStatus | null; executionStatus: SampleExecutionStatus; nominalDate: Date | null }, now = new Date()) {
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

export default async function LaboratoryPage({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  const user = await requireUser();
  const params = await searchParams;
  const mode = params.mode === "sample" ? "sample" : "test";
  const studies = await prisma.study.findMany({
    where: { status: StudyStatus.ACTIVE },
    orderBy: { startDate: "asc" },
    include: { client: true, samples: { orderBy: [{ nominalDate: "asc" }, { code: "asc" }], include: { initialMeasurement: true, microbiologyResult: true, tests: { include: { testDefinition: true, result: true } } } } },
  });

  const pendingInitial = studies.flatMap((study) => study.samples.filter((sample) => !initialComplete(study.aerosol, sample.initialMeasurement)).map((sample) => ({ study, sample })));
  const readyStudyIds = new Set(studies.filter((study) => study.samples.length > 0 && study.samples.every((sample) => initialComplete(study.aerosol, sample.initialMeasurement))).map((study) => study.id));
  const workSamples = studies.flatMap((study) => study.samples
    .filter(() => readyStudyIds.has(study.id))
    .filter((sample) => { const timing = timeliness(sample); return timing === "DUE" || timing === "LATE" || timing === "OVERDUE" || timing === "RF"; })
    .map((sample) => ({ study, sample, timing: timeliness(sample)! })));

  const overdueCount = workSamples.filter((item) => item.timing === "OVERDUE").length;
  const lateCount = workSamples.filter((item) => item.timing === "LATE").length;
  const dueCount = workSamples.filter((item) => item.timing === "DUE" || item.timing === "RF").length;

  const byTest = new Map<string, { code: string; name: string; count: number; unit: string | null }>();
  for (const { sample } of workSamples) {
    if (sample.role !== SampleRole.STANDARD && sample.role !== SampleRole.REFERENCE) continue;
    for (const test of sample.tests) {
      if (test.result) continue;
      const current = byTest.get(test.testDefinition.code);
      if (current) current.count++;
      else byTest.set(test.testDefinition.code, { code: test.testDefinition.code, name: test.testDefinition.name, count: 1, unit: test.testDefinition.unit });
    }
  }
  const microCount = workSamples.filter((item) => item.sample.role === SampleRole.MICROBIOLOGY && !item.sample.microbiologyResult).length;

  return <AppShell user={user} active="lab">
    <div className="topline"><div><div className="eyebrow">Laboratorium · wspólna kolejka</div><h1>Laboratorium</h1><div className="subtle">Bez przypisywania do osób. Wykonuj to, co jest gotowe i faktycznie wymaga pracy.</div></div><div className="segmented-control"><Link className={mode === "test" ? "active" : ""} href="/lab?mode=test">Po badaniu</Link><Link className={mode === "sample" ? "active" : ""} href="/lab?mode=sample">Po próbce</Link></div></div>
    <section className="lab-summary"><div><span>Do wykonania</span><strong>{dueCount}</strong></div><div><span>Zaległe</span><strong className="warning-text">{lateCount}</strong></div><div><span>Przeterminowane</span><strong className="danger-text">{overdueCount}</strong></div><div><span>Badania wstępne</span><strong>{pendingInitial.length}</strong></div></section>

    {pendingInitial.length > 0 && <section className="section"><div className="section-head"><div><div className="eyebrow">Etap wymagany</div><div className="section-title">Badania wstępne</div><div className="subtle">Waga każdej próbki, a dla aerozoli również ciśnienie. Dopiero po komplecie otwierają się badania właściwe danego zlecenia.</div></div></div><div className="table-card"><table><thead><tr><th>Próbka</th><th>Projekt</th><th>Klient</th><th>Rola</th><th>Warunek</th><th></th></tr></thead><tbody>{pendingInitial.map(({ study, sample }) => <tr key={sample.id}><td className="primary-cell">{sample.code}</td><td>{study.projectName}<div className="secondary-cell">{study.studyNumber}</div></td><td>{study.client.name}</td><td>{sample.role === SampleRole.REFERENCE ? "RF" : sample.role === SampleRole.MICROBIOLOGY ? "Mikrobiologia" : "Standardowa"}</td><td>{sample.storageCondition}</td><td><Link className="btn btn-small btn-primary" href={`/lab/sample/${sample.id}`}>Wprowadź wstępne</Link></td></tr>)}</tbody></table></div></section>}

    <section className="section"><div className="section-head"><div><div className="eyebrow">Bieżąca praca</div><div className="section-title">{mode === "test" ? "Wybierz badanie" : "Wybierz próbkę"}</div></div></div>{workSamples.length === 0 ? <div className="empty-state large-empty"><strong>Brak próbek do wykonania</strong><span>Próbki planowane na przyszłe sprinty nie zaśmiecają kolejki.</span></div> : mode === "test" ? <div className="test-type-grid">{[...byTest.values()].map((test) => <Link className="test-type-card" key={test.code} href={`/lab/test/${test.code}`}><div><span className="test-code">{test.code}</span><h3>{test.name}</h3><small>{test.unit ? `Wynik w ${test.unit}` : "Wynik jakościowy"}</small></div><strong>{test.count}<span> próbek</span></strong></Link>)}{microCount > 0 && <div className="test-type-card"><div><span className="test-code">MICRO</span><h3>Mikrobiologia</h3><small>Zbiorczy wynik OK / NOK</small></div><strong>{microCount}<span> próbek</span></strong></div>}</div> : <div className="table-card"><table><thead><tr><th>Status</th><th>Próbka</th><th>Projekt</th><th>Termin</th><th>Warunek</th><th>Postęp</th><th></th></tr></thead><tbody>{workSamples.map(({ study, sample, timing }) => { const done = sample.tests.filter((test) => test.result).length + (sample.microbiologyResult ? 1 : 0); const total = sample.role === SampleRole.MICROBIOLOGY ? 1 : sample.tests.length; return <tr key={sample.id}><td><span className={`badge ${timing === "OVERDUE" ? "danger" : timing === "LATE" ? "warning" : "teal"}`}>{timing === "OVERDUE" ? "Przeterminowana" : timing === "LATE" ? "Zaległa" : timing === "RF" ? "RF aktywowana" : "Do wykonania"}</span></td><td className="primary-cell">{sample.code}</td><td>{study.projectName}<div className="secondary-cell">{study.studyNumber}</div></td><td>{sample.nominalDate?.toLocaleDateString("pl-PL") ?? "—"}</td><td>{sample.storageCondition}</td><td>{done} / {total}</td><td><Link className="btn btn-small btn-primary" href={`/lab/sample/${sample.id}`}>Otwórz</Link></td></tr>; })}</tbody></table></div>}</section>
  </AppShell>;
}
