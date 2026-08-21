"use client";

import { useState } from "react";
import { createStudyAction } from "@/app/studies/actions";

type Option = { id: string; name: string };
type DictionaryOption = { value: string };

export function StudyForm({
  clients,
  technologists,
  standards,
  appearanceValues,
  odorValues,
  defaultTechnologistId,
  today,
}: {
  clients: Option[];
  technologists: Option[];
  standards: Option[];
  appearanceValues: DictionaryOption[];
  odorValues: DictionaryOption[];
  defaultTechnologistId: string;
  today: string;
}) {
  const [aerosol, setAerosol] = useState(true);

  return (
    <form action={createStudyAction} className="study-form">
      <section className="form-section">
        <div className="form-section-head"><span className="step-number">01</span><div><h2>Projekt i odpowiedzialność</h2><p>Podstawowe dane identyfikujące badanie.</p></div></div>
        <div className="form-grid form-grid-2">
          <label className="field field-wide">Nazwa projektu *<input name="projectName" placeholder="np. Deodorant Fresh — wariant A" required /></label>
          <label className="field">Klient *<select name="clientId" required defaultValue=""><option value="" disabled>Wybierz klienta</option>{clients.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label className="field">Technolog odpowiedzialny *<select name="responsibleTechnologistId" required defaultValue={defaultTechnologistId}>{technologists.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label className="field">Numer ETS<input name="etsNumber" placeholder="opcjonalnie" /></label>
          <label className="field">Typ badania<select name="testType" defaultValue="internal"><option value="internal">Wewnętrzne</option><option value="customer">Dla klienta</option></select></label>
          <label className="field field-wide">Cel testów<textarea name="purpose" rows={3} placeholder="Krótko: po co wykonujemy badanie?" /></label>
        </div>
      </section>

      <section className="form-section">
        <div className="form-section-head"><span className="step-number">02</span><div><h2>Produkt i terminy</h2><p>Parametry próbki i data bazowa harmonogramu.</p></div></div>
        <div className="form-grid form-grid-3">
          <label className="field">Data produkcji próbek *<input name="productionDate" type="date" defaultValue={today} required /></label>
          <label className="field">Data rozpoczęcia testów *<input name="startDate" type="date" min={today} defaultValue={today} required /></label>
          <label className="field">Pojemność [ml]<input name="volumeMl" type="number" step="0.01" min="0" /></label>
          <label className="field">Waga nastawu [g]<input name="fillWeightG" type="number" step="0.01" min="0" /></label>
          <label className="field">Waga wsadu [g]<input name="totalWeightG" type="number" step="0.01" min="0" /></label>
          <label className="checkbox-card"><input name="aerosol" type="checkbox" checked={aerosol} onChange={(event) => setAerosol(event.target.checked)} /><span><strong>Aerozol</strong><small>Wymaga pomiaru ciśnienia początkowego i bieżącego.</small></span></label>
        </div>
        {aerosol && <div className="form-grid form-grid-3 aerosol-fields"><label className="field">Rodzaj gazu<input name="gasType" placeholder="np. LPG / N₂" /></label><label className="field">Waga gazu [g]<input name="gasWeightG" type="number" step="0.01" min="0" /></label></div>}
      </section>

      <section className="form-section">
        <div className="form-section-head"><span className="step-number">03</span><div><h2>Komponenty</h2><p>Najważniejsze elementy produktu i opakowania.</p></div></div>
        <div className="component-table">
          <div className="component-row component-head"><span>Rodzaj</span><span>Kod</span><span>Nazwa</span><span>Dostawca</span></div>
          {[1, 2, 3].map((index) => <div className="component-row" key={index}><input name={`componentKind_${index}`} placeholder="np. Pojemnik" /><input name={`componentCode_${index}`} placeholder="Kod" /><input name={`componentName_${index}`} placeholder="Nazwa komponentu" /><input name={`componentSupplier_${index}`} placeholder="Dostawca" /></div>)}
        </div>
      </section>

      <section className="form-section">
        <div className="form-section-head"><span className="step-number">04</span><div><h2>Kryteria akceptacji</h2><p>Zakres badań zostanie zamrożony po przekazaniu do Laboratorium.</p></div></div>
        <div className="criteria-grid">
          <div className="criterion-card"><label className="criterion-toggle"><input name="criterion_PH" type="checkbox" defaultChecked /><span><strong>pH</strong><small>Zakres liczbowy</small></span></label><div className="criterion-range"><input name="PH_min" type="number" step="0.01" defaultValue="5.5" aria-label="pH minimum" /><span>–</span><input name="PH_max" type="number" step="0.01" defaultValue="6.5" aria-label="pH maksimum" /></div></div>
          <div className="criterion-card"><label className="criterion-toggle"><input name="criterion_DENSITY" type="checkbox" defaultChecked /><span><strong>Gęstość</strong><small>Zakres liczbowy [g/ml]</small></span></label><div className="criterion-range"><input name="DENSITY_min" type="number" step="0.001" defaultValue="0.85" aria-label="Gęstość minimum" /><span>–</span><input name="DENSITY_max" type="number" step="0.001" defaultValue="1.05" aria-label="Gęstość maksimum" /></div></div>
          <div className="criterion-card"><label className="criterion-toggle"><input name="criterion_APPEARANCE" type="checkbox" defaultChecked /><span><strong>Wygląd</strong><small>Wartość oczekiwana</small></span></label><select name="APPEARANCE_expected" defaultValue={appearanceValues[0]?.value ?? "Bez zmian"}>{appearanceValues.map((item) => <option key={item.value}>{item.value}</option>)}</select></div>
          <div className="criterion-card"><label className="criterion-toggle"><input name="criterion_ODOR" type="checkbox" defaultChecked /><span><strong>Zapach</strong><small>Wartość oczekiwana</small></span></label><select name="ODOR_expected" defaultValue={odorValues[0]?.value ?? "Bez zmian"}>{odorValues.map((item) => <option key={item.value}>{item.value}</option>)}</select></div>
        </div>
      </section>

      <section className="form-section">
        <div className="form-section-head"><span className="step-number">05</span><div><h2>Standard stabilności</h2><p>Standard definiuje wyłącznie fizyczny plan próbek i terminy.</p></div></div>
        <label className="field field-wide">Standard *<select name="standardId" required defaultValue={standards[0]?.id ?? ""}>{standards.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      </section>

      <div className="sticky-form-actions"><div><strong>Zapis jako wersja robocza</strong><span>Numer badania zostanie nadany automatycznie.</span></div><button className="btn btn-primary btn-large" type="submit">Utwórz zlecenie</button></div>
    </form>
  );
}
