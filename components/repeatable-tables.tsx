"use client";

import { useState } from "react";

export type ComponentRowValue = {
  kind: string;
  code: string;
  name: string;
  supplier: string;
};

export type SubstanceRowValue = {
  name: string;
  present: boolean;
  minValue: string;
  maxValue: string;
};

const emptyComponent = (): ComponentRowValue => ({ kind: "", code: "", name: "", supplier: "" });
const emptySubstance = (): SubstanceRowValue => ({ name: "", present: true, minValue: "", maxValue: "" });

export function RepeatableComponentTable({
  componentKinds,
  initialRows,
}: {
  componentKinds: string[];
  initialRows?: ComponentRowValue[];
}) {
  const [rows, setRows] = useState<ComponentRowValue[]>(initialRows?.length ? initialRows : [emptyComponent()]);

  function updateRow(index: number, patch: Partial<ComponentRowValue>) {
    setRows((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row));
  }

  function removeRow(index: number) {
    setRows((current) => current.length === 1 ? [emptyComponent()] : current.filter((_, rowIndex) => rowIndex !== index));
  }

  return (
    <div className="repeatable-block">
      <input type="hidden" name="componentCount" value={rows.length} />
      <div className="component-table repeatable-table">
        <div className="component-row component-head">
          <span>Rodzaj</span><span>Kod</span><span>Nazwa</span><span>Dostawca</span><span aria-hidden="true" />
        </div>
        {rows.map((row, index) => (
          <div className="component-row" key={index}>
            <select name={`componentKind_${index + 1}`} value={row.kind} onChange={(event) => updateRow(index, { kind: event.target.value })}>
              <option value="">Wybierz rodzaj</option>
              {componentKinds.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
            <input name={`componentCode_${index + 1}`} value={row.code} onChange={(event) => updateRow(index, { code: event.target.value })} placeholder="Kod" />
            <input name={`componentName_${index + 1}`} value={row.name} onChange={(event) => updateRow(index, { name: event.target.value })} placeholder="Nazwa komponentu" />
            <input name={`componentSupplier_${index + 1}`} value={row.supplier} onChange={(event) => updateRow(index, { supplier: event.target.value })} placeholder="Dostawca" />
            <button type="button" className="row-remove" onClick={() => removeRow(index)} aria-label={`Usuń komponent ${index + 1}`}>×</button>
          </div>
        ))}
      </div>
      <button type="button" className="btn btn-secondary add-row-button" onClick={() => setRows((current) => [...current, emptyComponent()])}>+ Dodaj komponent</button>
    </div>
  );
}

export function RepeatableSubstanceTable({ initialRows }: { initialRows?: SubstanceRowValue[] }) {
  const [rows, setRows] = useState<SubstanceRowValue[]>(initialRows?.length ? initialRows : [emptySubstance()]);

  function updateRow(index: number, patch: Partial<SubstanceRowValue>) {
    setRows((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row));
  }

  function setPresence(index: number, present: boolean) {
    updateRow(index, present ? { present } : { present, minValue: "", maxValue: "" });
  }

  function removeRow(index: number) {
    setRows((current) => current.length === 1 ? [emptySubstance()] : current.filter((_, rowIndex) => rowIndex !== index));
  }

  return (
    <div className="repeatable-block">
      <input type="hidden" name="substanceCount" value={rows.length} />
      <div className="substance-table repeatable-table">
        <div className="substance-row substance-head">
          <span>Substancja</span><span>Występuje</span><span>MIN [%]</span><span>MAX [%]</span><span aria-hidden="true" />
        </div>
        {rows.map((row, index) => (
          <div className="substance-row" key={index}>
            <input name={`substanceName_${index + 1}`} value={row.name} onChange={(event) => updateRow(index, { name: event.target.value })} placeholder="Nazwa substancji" />
            <select name={`substancePresent_${index + 1}`} value={row.present ? "yes" : "no"} onChange={(event) => setPresence(index, event.target.value === "yes")}>
              <option value="yes">TAK</option>
              <option value="no">NIE</option>
            </select>
            <input name={`substanceMin_${index + 1}`} type="number" step="any" min="0" value={row.minValue} onChange={(event) => updateRow(index, { minValue: event.target.value })} placeholder="min" disabled={!row.present} />
            <input name={`substanceMax_${index + 1}`} type="number" step="any" min="0" value={row.maxValue} onChange={(event) => updateRow(index, { maxValue: event.target.value })} placeholder="max" disabled={!row.present} />
            <button type="button" className="row-remove" onClick={() => removeRow(index)} aria-label={`Usuń substancję ${index + 1}`}>×</button>
          </div>
        ))}
      </div>
      <button type="button" className="btn btn-secondary add-row-button" onClick={() => setRows((current) => [...current, emptySubstance()])}>+ Dodaj substancję</button>
    </div>
  );
}
