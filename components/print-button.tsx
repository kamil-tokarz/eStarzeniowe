"use client";

export function PrintButton() {
  return (
    <button className="labels-print-button" type="button" onClick={() => window.print()}>
      Drukuj etykiety A4
    </button>
  );
}
