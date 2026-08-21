"use client";

import { useState } from "react";
import { criterionCatalog, criterionGroups } from "@/lib/criterion-catalog";
import { RepeatableComponentTable, RepeatableSubstanceTable } from "@/components/repeatable-tables";

type Option = { id: string; name: string };

export function StudyForm({
  clients,
  technologists,
  standards,
  dictionaryValues,
  microbiologyValues,
  componentKinds,
  defaultTechnologistId,
  today,
}: {
  clients: Option[];
  technologists: Option[];
  standards: Option[];
  dictionaryValues: Record<string, string[]>;
  microbiologyValues: string[];
  componentKinds: string[];
  defaultTechnologistId: string;
  today: string;
}) {
  const [aerosol, setAerosol] = useState(true);
  const [fillWeight, setFillWeight] = useState("");
  const [gasWeight, setGasWeight] = useState("");
  const fill = fillWeight === "" ? null : Number(fillWeight);
  const gas = gasWeight === "" ? null : Number(gasWeight);
  const totalWeight = fill != null && Number.isFinite(fill) && (!aerosol || (gas != null && Number.isFinite(gas))) ? fill + (aerosol ? gas ?? 0 : 0) : null;
  const purposeValues = dictionaryValues.study_purpose ?? [];
  const gasValues = dictionaryValues.gas_type ?? [];

  return (
    <form method="post" action="/api/studies" className="study-form">
      <section className="form-section">
        <div className="form-section-head"><span className="step-number">01</span><div><h2>Projekt i odpowiedzialność</h2><p>Podstawowe dane identyfikujące badanie.</p></div></div>
        <div className="form-grid form-grid-2">
          <label className="field field-wide">Nazwa projektu *<input name="projectName" placeholder="np. Deodorant Fresh — wariant A" required /></label>
          <label className="field">Klient *<select name="clientId" required defaultValue=""><option value="" disabled>Wybierz klienta</option>{clients.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label className="field">Technolog odpowiedzialny *<select name="responsibleTechnologistId" required defaultValue={defaultTechnologistId}>{technologists.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label className="field">Numer ETS<input name="etsNumber" placeholder="opcjonalnie" /></label>
          <label className="field">Typ badania<select name="testType" defaultValue="internal"><option value="internal">Wewnętrzne</option><option value="customer">Dla klienta</option></select></label>
          <label className="field field-wide">Cel testów<select name="purpose" defaultValue=""><option value="">Wybierz cel testów</option>{purposeValues.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
        </div>
      </section>

      <section className="form-section">
        <div className="form-section-head"><span className="step-number">02</span><div><h2>Produkt i terminy</h2><p>Parametry próbki i data bazowa harmonogramu.</p></div></div>
        <div className="form-grid form-grid-3">
          <label className="field">Data produkcji próbek *<input name="productionDate" type="date" defaultValue={today} required /></label>
          <label className="field">Data rozpoczęcia testów *<input name="startDate" type="date" min={today} defaultValue={today} required /></label>
          <label className="field">Pojemność [ml]<input name="volumeMl" type="number" step="0.01" min="0" /></label>
          <label className="field">Waga nastawu [g]<input name="fillWeightG" type="number" step="0.01" min="0" value={fillWeight} onChange={(event) => setFillWeight(event.target.value)} /></label>
          <label className="field">Waga wsadu [g]<input type="number" step="0.01" readOnly value={totalWeight ?? ""} placeholder="nastaw + gaz" /></label>
          <label className="checkbox-card"><input name="aerosol" type="checkbox" checked={aerosol} onChange={(event) => { setAerosol(event.target.checked); if (!event.target.checked) setGasWeight(""); }} /><span><strong>Aerozol</strong><small>Wymaga pomiaru ciśnienia początkowego i bieżącego.</small></span></label>
        </div>
        {aerosol && <div className="form-grid form-grid-3 aerosol-fields"><label className="field">Rodzaj gazu<select name="gasType" defaultValue=""><option value="">Wybierz rodzaj gazu</option>{gasValues.map((value) => <option key={value} value={value}>{value}</option>)}</select></label><label className="field">Waga gazu [g]<input name="gasWeightG" type="number" step="0.01" min="0" value={gasWeight} onChange={(event) => setGasWeight(event.target.value)} /></label></div>}
      </section>

      <section className="form-section">
        <div className="form-section-head"><span className="step-number">03</span><div><h2>Komponenty</h2><p>Domyślnie jeden wiersz. Dodaj tyle komponentów, ile faktycznie występuje w badaniu.</p></div></div>
        <RepeatableComponentTable componentKinds={componentKinds} />
      </section>

      <section className="form-section">
        <div className="form-section-head"><span className="step-number">04</span><div><h2>Kryteria akceptacji</h2><p>Wybierasz zakres właściwy dla produktu. Po przekazaniu do Laboratorium zakres zostanie zamrożony.</p></div></div>
        <div className="criteria-sections">
          {criterionGroups.map((group) => (
            <div className="criteria-group" key={group}>
              <div className="criteria-group-title">{group}</div>
              <div className="criteria-grid">
                {criterionCatalog.filter((item) => item.group === group).map((item) => {
                  const dictionary = item.dictionaryKey ? dictionaryValues[item.dictionaryKey] ?? [] : [];
                  return (
                    <div className="criterion-card" key={item.code}>
                      <label className="criterion-toggle">
                        <input name={`criterion_${item.code}`} type="checkbox" defaultChecked={item.defaultChecked} />
                        <span><strong>{item.label}</strong><small>{item.unit ? `${item.input === "minimum" ? "minimum" : "zakres"} · ${item.unit}` : item.input === "boolean" ? "wykonanie / zgodność" : item.input === "expected" ? "wartość oczekiwana" : "kryterium"}</small></span>
                      </label>
                      {item.input === "range" && <div className="criterion-range"><input name={`${item.code}_min`} type="number" step="any" defaultValue={item.defaultMin ?? ""} placeholder="min" aria-label={`${item.label} minimum`} /><span>–</span><input name={`${item.code}_max`} type="number" step="any" defaultValue={item.defaultMax ?? ""} placeholder="max" aria-label={`${item.label} maksimum`} /></div>}
                      {item.input === "minimum" && <input name={`${item.code}_min`} type="number" step="any" placeholder={`Minimum${item.unit ? ` [${item.unit}]` : ""}`} aria-label={`${item.label} minimum`} />}
                      {item.input === "expected" && <select name={`${item.code}_expected`} defaultValue=""><option value="" disabled>Wybierz wartość</option>{dictionary.map((value) => <option key={value} value={value}>{value}</option>)}</select>}
                      {item.input === "boolean" && <div className="criterion-info">Po wybraniu Laboratorium otrzyma obowiązkowe pole TAK/NIE; oczekiwana wartość: TAK.</div>}
                      {item.input === "crimp" && <div className="crimp-config"><select name={`${item.code}_preset`} defaultValue=""><option value="" disabled>Wybierz konfigurację materiałową</option>{dictionary.map((value) => <option key={value} value={value}>{value}</option>)}</select><div className="criterion-range"><input name={`${item.code}_min`} type="number" step="any" placeholder="min dla INNE" /><span>–</span><input name={`${item.code}_max`} type="number" step="any" placeholder="max dla INNE" /></div></div>}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          <div className="criteria-group">
            <div className="criteria-group-title">Zawartość substancji</div>
            <p className="subtle">Struktura zgodna z BPM: substancja, czy występuje oraz zakres MIN–MAX. Liczba wierszy jest dowolna.</p>
            <RepeatableSubstanceTable />
          </div>
        </div>
      </section>

      <section className="form-section">
        <div className="form-section-head"><span className="step-number">05</span><div><h2>Mikrobiologia</h2><p>Opcjonalny zakres przekazywany do laboratorium zewnętrznego. W systemie wróci jedna zbiorcza ocena OK/NOK i opcjonalny raport.</p></div></div>
        <details className="micro-scope">
          <summary>Wybierz badania mikrobiologiczne <span>{microbiologyValues.length} pozycji w katalogu</span></summary>
          <div className="micro-grid">{microbiologyValues.map((value) => <label className="micro-option" key={value}><input type="checkbox" name="microTests" value={value} /><span>{value}</span></label>)}</div>
        </details>
      </section>

      <section className="form-section">
        <div className="form-section-head"><span className="step-number">06</span><div><h2>Standard stabilności</h2><p>Standard definiuje fizyczny plan próbek, warunki przechowywania i stałe offsety dni.</p></div></div>
        <label className="field field-wide">Standard *<select name="standardId" required defaultValue=""><option value="" disabled>{standards.length ? "Wybierz standard" : "Brak aktywnych standardów"}</option>{standards.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      </section>

      <div className="sticky-form-actions"><div><strong>Zapis jako wersja robocza</strong><span>Numer badania zostanie nadany automatycznie.</span></div><button className="btn btn-primary btn-large" type="submit" disabled={!standards.length}>Utwórz zlecenie</button></div>
    </form>
  );
}
