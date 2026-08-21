import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { StandardStatus, StudyStatus, UserRole } from "@/generated/prisma/client";
import { AppShell } from "@/components/app-shell";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function inputDate(date: Date) { return date.toISOString().slice(0, 10); }

export default async function EditStudyPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const user = await requireUser();
  if (user.role !== UserRole.TECHNOLOGIST && user.role !== UserRole.ADMIN) redirect("/studies");
  const { id } = await params;
  const query = await searchParams;

  const study = await prisma.study.findUnique({
    where: { id },
    include: { components: true, criteria: { include: { testDefinition: true, currentVersion: true } }, client: true, responsibleTechnologist: true, standard: true },
  });
  if (!study) notFound();
  if (study.status !== StudyStatus.DRAFT) redirect(`/studies/${id}`);

  const [clients, technologists, standards, appearanceValues, odorValues] = await Promise.all([
    prisma.client.findMany({ where: { OR: [{ active: true }, { id: study.clientId }] }, orderBy: { name: "asc" } }),
    prisma.user.findMany({ where: { active: true, role: UserRole.TECHNOLOGIST }, orderBy: { name: "asc" } }),
    prisma.stabilityStandard.findMany({ where: { status: StandardStatus.ACTIVE }, orderBy: { name: "asc" } }),
    prisma.dictionaryEntry.findMany({ where: { category: "appearance", active: true }, orderBy: { sortOrder: "asc" } }),
    prisma.dictionaryEntry.findMany({ where: { category: "odor", active: true }, orderBy: { sortOrder: "asc" } }),
  ]);
  const criterion = (code: string) => study.criteria.find((item) => item.testDefinition.code === code);
  const ph = criterion("PH"); const density = criterion("DENSITY"); const appearance = criterion("APPEARANCE"); const odor = criterion("ODOR");
  const components = [...study.components, ...Array(Math.max(0, 5 - study.components.length)).fill(null)];

  const errorText = query.error === "criteria" ? "Wybierz co najmniej jedno kryterium akceptacji." : query.error ? "Nie udało się zapisać zmian. Sprawdź wymagane pola i wartości kryteriów." : null;

  return <AppShell user={user} active="studies">
    <div className="topline"><div><div className="eyebrow">{study.studyNumber} · wersja robocza</div><h1>Edytuj zlecenie</h1><div className="subtle">Do przekazania do Laboratorium możesz swobodnie zmieniać konfigurację badania.</div></div><Link href={`/studies/${id}`} className="btn btn-secondary">← Wróć do zlecenia</Link></div>
    {errorText && <div className="form-error" style={{marginTop: 22}}>{errorText}</div>}
    <form method="post" action={`/api/studies/${id}/draft`} className="study-form">
      <section className="form-section"><div className="form-section-head"><span className="step-number">01</span><div><h2>Projekt i odpowiedzialność</h2><p>Numer badania pozostaje bez zmian.</p></div></div><div className="form-grid form-grid-2">
        <label className="field field-wide">Nazwa projektu *<input name="projectName" defaultValue={study.projectName} required/></label>
        <label className="field">Klient *<select name="clientId" defaultValue={study.clientId} required>{clients.map((item)=><option key={item.id} value={item.id}>{item.name}{!item.active ? " (nieaktywny)" : ""}</option>)}</select></label>
        <label className="field">Technolog odpowiedzialny *<select name="responsibleTechnologistId" defaultValue={study.responsibleTechnologistId} required>{technologists.map((item)=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label className="field">Numer ETS<input name="etsNumber" defaultValue={study.etsNumber ?? ""}/></label>
        <label className="field">Typ badania<select name="testType" defaultValue={study.internalTest ? "internal" : "customer"}><option value="internal">Wewnętrzne</option><option value="customer">Dla klienta</option></select></label>
        <label className="field field-wide">Cel testów<textarea name="purpose" rows={3} defaultValue={study.purpose ?? ""}/></label>
      </div></section>

      <section className="form-section"><div className="form-section-head"><span className="step-number">02</span><div><h2>Produkt i terminy</h2><p>Data rozpoczęcia jest bazą dla wszystkich terminów nominalnych.</p></div></div><div className="form-grid form-grid-3">
        <label className="field">Data produkcji próbek *<input name="productionDate" type="date" defaultValue={inputDate(study.productionDate)} required/></label>
        <label className="field">Data rozpoczęcia testów *<input name="startDate" type="date" defaultValue={inputDate(study.startDate)} required/></label>
        <label className="field">Pojemność [ml]<input name="volumeMl" type="number" step="0.01" min="0" defaultValue={study.volumeMl ?? ""}/></label>
        <label className="field">Waga nastawu [g]<input name="fillWeightG" type="number" step="0.01" min="0" defaultValue={study.fillWeightG ?? ""}/></label>
        <label className="field">Waga wsadu [g]<input name="totalWeightG" type="number" step="0.01" min="0" defaultValue={study.totalWeightG ?? ""}/></label>
        <label className="checkbox-card"><input name="aerosol" type="checkbox" defaultChecked={study.aerosol}/><span><strong>Aerozol</strong><small>Po odznaczeniu dane gazu zostaną wyczyszczone.</small></span></label>
        <label className="field">Rodzaj gazu<input name="gasType" defaultValue={study.gasType ?? ""}/></label><label className="field">Waga gazu [g]<input name="gasWeightG" type="number" step="0.01" min="0" defaultValue={study.gasWeightG ?? ""}/></label>
      </div></section>

      <section className="form-section"><div className="form-section-head"><span className="step-number">03</span><div><h2>Komponenty</h2><p>Możesz zmienić listę do chwili przekazania.</p></div></div><div className="component-table"><div className="component-row component-head"><span>Rodzaj</span><span>Kod</span><span>Nazwa</span><span>Dostawca</span></div>{components.map((item,index)=><div className="component-row" key={index}><input name={`componentKind_${index+1}`} defaultValue={item?.kind ?? ""} placeholder="np. Pojemnik"/><input name={`componentCode_${index+1}`} defaultValue={item?.code ?? ""} placeholder="Kod"/><input name={`componentName_${index+1}`} defaultValue={item?.name ?? ""} placeholder="Nazwa komponentu"/><input name={`componentSupplier_${index+1}`} defaultValue={item?.supplier ?? ""} placeholder="Dostawca"/></div>)}</div></section>

      <section className="form-section"><div className="form-section-head"><span className="step-number">04</span><div><h2>Kryteria akceptacji</h2><p>W DRAFT możesz zmieniać zarówno zakres badań, jak i wartości kryteriów.</p></div></div><div className="criteria-grid">
        <div className="criterion-card"><label className="criterion-toggle"><input name="criterion_PH" type="checkbox" defaultChecked={Boolean(ph)}/><span><strong>pH</strong><small>Zakres liczbowy</small></span></label><div className="criterion-range"><input name="PH_min" type="number" step="0.01" defaultValue={ph?.currentVersion?.minValue ?? 5.5}/><span>–</span><input name="PH_max" type="number" step="0.01" defaultValue={ph?.currentVersion?.maxValue ?? 6.5}/></div></div>
        <div className="criterion-card"><label className="criterion-toggle"><input name="criterion_DENSITY" type="checkbox" defaultChecked={Boolean(density)}/><span><strong>Gęstość</strong><small>Zakres liczbowy [g/ml]</small></span></label><div className="criterion-range"><input name="DENSITY_min" type="number" step="0.001" defaultValue={density?.currentVersion?.minValue ?? .85}/><span>–</span><input name="DENSITY_max" type="number" step="0.001" defaultValue={density?.currentVersion?.maxValue ?? 1.05}/></div></div>
        <div className="criterion-card"><label className="criterion-toggle"><input name="criterion_APPEARANCE" type="checkbox" defaultChecked={Boolean(appearance)}/><span><strong>Wygląd</strong><small>Wartość oczekiwana</small></span></label><select name="APPEARANCE_expected" defaultValue={appearance?.currentVersion?.expectedText ?? appearanceValues[0]?.value ?? "Bez zmian"}>{appearanceValues.map((item)=><option key={item.id} value={item.value}>{item.value}</option>)}</select></div>
        <div className="criterion-card"><label className="criterion-toggle"><input name="criterion_ODOR" type="checkbox" defaultChecked={Boolean(odor)}/><span><strong>Zapach</strong><small>Wartość oczekiwana</small></span></label><select name="ODOR_expected" defaultValue={odor?.currentVersion?.expectedText ?? odorValues[0]?.value ?? "Bez zmian"}>{odorValues.map((item)=><option key={item.id} value={item.value}>{item.value}</option>)}</select></div>
      </div></section>

      <section className="form-section"><div className="form-section-head"><span className="step-number">05</span><div><h2>Standard stabilności</h2><p>Po przekazaniu standard i plan fizycznych próbek zostaną zamrożone.</p></div></div><label className="field field-wide">Standard *<select name="standardId" required defaultValue={study.standardId ?? ""}>{standards.map((item)=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label></section>
      <div className="sticky-form-actions"><div><strong>Zapisz wersję roboczą</strong><span>Zmiany nie generują jeszcze próbek ani zadań Laboratorium.</span></div><button className="btn btn-primary btn-large" type="submit">Zapisz zmiany</button></div>
    </form>
  </AppShell>;
}
