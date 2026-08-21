import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { StandardStatus, StudyStatus, UserRole } from "@/generated/prisma/client";
import { criterionCatalog, criterionGroups } from "@/lib/criterion-catalog";
import { AppShell } from "@/components/app-shell";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function inputDate(date: Date) { return date.toISOString().slice(0, 10); }
const dictionaryCategories = ["appearance", "odor", "color", "spray", "crimp_width_setup", "crimp_height_setup", "microbiology"];

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

  const [clients, technologists, standards, dictionaries] = await Promise.all([
    prisma.client.findMany({ where: { OR: [{ active: true }, { id: study.clientId }] }, orderBy: { name: "asc" } }),
    prisma.user.findMany({ where: { active: true, role: UserRole.TECHNOLOGIST }, orderBy: { name: "asc" } }),
    prisma.stabilityStandard.findMany({ where: { status: StandardStatus.ACTIVE }, orderBy: { name: "asc" } }),
    prisma.dictionaryEntry.findMany({ where: { category: { in: dictionaryCategories }, active: true }, orderBy: [{ category: "asc" }, { sortOrder: "asc" }] }),
  ]);

  const dictionaryValues: Record<string, string[]> = {};
  for (const entry of dictionaries) (dictionaryValues[entry.category] ??= []).push(entry.value);

  const microComponents = study.components.filter((item) => item.kind === "Badanie mikrobiologiczne");
  const normalComponents = study.components.filter((item) => item.kind !== "Badanie mikrobiologiczne");
  const components = [...normalComponents, ...Array(Math.max(0, 5 - normalComponents.length)).fill(null)].slice(0, 5);
  const selectedMicro = new Set(microComponents.map((item) => item.name));
  const criterionByCode = new Map(study.criteria.map((item) => [item.testDefinition.code, item]));
  const substances = study.criteria.filter((item) => item.testDefinition.code.startsWith("SUBSTANCE_") || item.testDefinition.category === "Zawartość substancji");
  const substanceRows = [...substances, ...Array(Math.max(0, 5 - substances.length)).fill(null)].slice(0, 5);

  const errorText = query.error === "criteria" ? "Wybierz co najmniej jedno kryterium akceptacji." : query.error ? "Nie udało się zapisać zmian. Sprawdź wymagane pola i wartości kryteriów." : null;

  return <AppShell user={user} active="studies">
    <div className="topline"><div><div className="eyebrow">{study.studyNumber} · wersja robocza</div><h1>Edytuj zlecenie</h1><div className="subtle">Do przekazania do Laboratorium możesz swobodnie zmieniać cały zakres badania.</div></div><Link href={`/studies/${id}`} className="btn btn-secondary">← Wróć do zlecenia</Link></div>
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

      <section className="form-section"><div className="form-section-head"><span className="step-number">04</span><div><h2>Kryteria akceptacji</h2><p>W DRAFT możesz zmieniać zarówno zakres badań, jak i wartości kryteriów.</p></div></div>
        <div className="criteria-sections">
          {criterionGroups.map((group) => <div className="criteria-group" key={group}><div className="criteria-group-title">{group}</div><div className="criteria-grid">
            {criterionCatalog.filter((item) => item.group === group).map((item) => {
              const current = criterionByCode.get(item.code);
              const version = current?.currentVersion;
              const dictionary = item.dictionaryKey ? dictionaryValues[item.dictionaryKey] ?? [] : [];
              return <div className="criterion-card" key={item.code}>
                <label className="criterion-toggle"><input name={`criterion_${item.code}`} type="checkbox" defaultChecked={Boolean(current)}/><span><strong>{item.label}</strong><small>{item.unit ? `${item.input === "minimum" ? "minimum" : "zakres"} · ${item.unit}` : item.input === "expected" ? "wartość oczekiwana" : item.input === "boolean" ? "wykonanie / zgodność" : "kryterium"}</small></span></label>
                {item.input === "range" && <div className="criterion-range"><input name={`${item.code}_min`} type="number" step="any" defaultValue={version?.minValue ?? item.defaultMin ?? ""} placeholder="min"/><span>–</span><input name={`${item.code}_max`} type="number" step="any" defaultValue={version?.maxValue ?? item.defaultMax ?? ""} placeholder="max"/></div>}
                {item.input === "minimum" && <input name={`${item.code}_min`} type="number" step="any" defaultValue={version?.minValue ?? ""} placeholder="minimum"/>}
                {item.input === "expected" && <select name={`${item.code}_expected`} defaultValue={version?.expectedText ?? item.defaultExpected ?? dictionary[0] ?? ""}><option value="" disabled>Wybierz wartość</option>{dictionary.map((value)=><option key={value} value={value}>{value}</option>)}</select>}
                {item.input === "boolean" && <div className="criterion-info">Oczekiwana wartość: TAK.</div>}
                {item.input === "crimp" && <div className="crimp-config"><select name={`${item.code}_preset`} defaultValue={version?.expectedText ?? dictionary[0] ?? ""}><option value="" disabled>Wybierz konfigurację materiałową</option>{dictionary.map((value)=><option key={value} value={value}>{value}</option>)}</select><div className="criterion-range"><input name={`${item.code}_min`} type="number" step="any" defaultValue={version?.minValue ?? ""} placeholder="min dla INNE"/><span>–</span><input name={`${item.code}_max`} type="number" step="any" defaultValue={version?.maxValue ?? ""} placeholder="max dla INNE"/></div></div>}
              </div>;
            })}
          </div></div>)}
          <div className="criteria-group"><div className="criteria-group-title">Zawartość substancji</div><div className="substance-table"><div className="substance-row substance-head"><span>Substancja</span><span>Minimum [%]</span><span>Maksimum [%]</span></div>{substanceRows.map((item,index)=><div className="substance-row" key={index}><input name={`substanceName_${index+1}`} defaultValue={item?.currentVersion?.expectedText ?? item?.testDefinition.name.replace(/^Zawartość:\s*/, "") ?? ""} placeholder="np. Etanol"/><input name={`substanceMin_${index+1}`} type="number" step="any" defaultValue={item?.currentVersion?.minValue ?? ""} placeholder="min"/><input name={`substanceMax_${index+1}`} type="number" step="any" defaultValue={item?.currentVersion?.maxValue ?? ""} placeholder="max"/></div>)}</div></div>
        </div>
      </section>

      <section className="form-section"><div className="form-section-head"><span className="step-number">05</span><div><h2>Mikrobiologia</h2><p>Zakres informacyjny dla badania zewnętrznego; w systemie wróci jedna zbiorcza ocena OK/NOK.</p></div></div><details className="micro-scope" open={selectedMicro.size > 0}><summary>Wybierz badania mikrobiologiczne <span>{dictionaryValues.microbiology?.length ?? 0} pozycji</span></summary><div className="micro-grid">{(dictionaryValues.microbiology ?? []).map((value)=><label className="micro-option" key={value}><input type="checkbox" name="microTests" value={value} defaultChecked={selectedMicro.has(value)}/><span>{value}</span></label>)}</div></details></section>

      <section className="form-section"><div className="form-section-head"><span className="step-number">06</span><div><h2>Standard stabilności</h2><p>Po przekazaniu standard i plan fizycznych próbek zostaną zamrożone.</p></div></div><label className="field field-wide">Standard *<select name="standardId" required defaultValue={study.standardId ?? ""}>{standards.map((item)=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label></section>
      <div className="sticky-form-actions"><div><strong>Zapisz wersję roboczą</strong><span>Zmiany nie generują jeszcze próbek ani zadań Laboratorium.</span></div><button className="btn btn-primary btn-large" type="submit">Zapisz zmiany</button></div>
    </form>
  </AppShell>;
}
