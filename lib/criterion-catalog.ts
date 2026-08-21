export type CriterionInputKind = "range" | "minimum" | "expected" | "boolean" | "crimp";

export type CriterionCatalogItem = {
  code: string;
  label: string;
  group: "Sensoryka" | "Rozpył" | "Zagniot" | "Fizykochemia" | "Funkcjonalne";
  input: CriterionInputKind;
  unit?: string;
  dictionaryKey?: string;
  defaultMin?: number;
  defaultMax?: number;
  defaultExpected?: string;
  defaultChecked?: boolean;
};

export const criterionCatalog: CriterionCatalogItem[] = [
  { code: "APPEARANCE", label: "Wygląd", group: "Sensoryka", input: "expected", dictionaryKey: "appearance" },
  { code: "ODOR", label: "Zapach", group: "Sensoryka", input: "expected", dictionaryKey: "odor" },
  { code: "COLOR", label: "Barwa", group: "Sensoryka", input: "expected", dictionaryKey: "color" },

  { code: "SPRAY_TYPE", label: "Rozpył", group: "Rozpył", input: "expected", dictionaryKey: "spray" },
  { code: "SPRAY_RATE", label: "Prędkość rozpyłu", group: "Rozpył", input: "range", unit: "g/sek" },
  { code: "SPRAY_DIAMETER", label: "Średnica rozpyłu", group: "Rozpył", input: "range", unit: "cm" },
  { code: "STEM_HEIGHT", label: "Wysokość kominka/stemu", group: "Rozpył", input: "range", unit: "mm" },

  { code: "CRIMP_WIDTH", label: "Szerokość zagniotu", group: "Zagniot", input: "crimp", unit: "mm", dictionaryKey: "crimp_width_setup" },
  { code: "CRIMP_HEIGHT", label: "Wysokość zagniotu", group: "Zagniot", input: "crimp", unit: "mm", dictionaryKey: "crimp_height_setup" },

  { code: "EMPTYING", label: "Opróżnialność", group: "Fizykochemia", input: "minimum", unit: "%" },
  { code: "PH", label: "pH", group: "Fizykochemia", input: "range", defaultMin: 5.5, defaultMax: 6.5, defaultChecked: true },
  { code: "DENSITY", label: "Gęstość", group: "Fizykochemia", input: "range", unit: "g/cm³", defaultMin: 0.85, defaultMax: 1.05, defaultChecked: true },
  { code: "FLASH_POINT", label: "Flesh point", group: "Fizykochemia", input: "range", unit: "°C" },
  { code: "PRESSURE_20", label: "Ciśnienie w 20°C", group: "Fizykochemia", input: "range", unit: "bar" },
  { code: "PRESSURE_50", label: "Ciśnienie w 50°C", group: "Fizykochemia", input: "range", unit: "bar" },
  { code: "SPRAYTEC", label: "Badanie Spraytec", group: "Funkcjonalne", input: "boolean" },
];

export const criterionGroups = ["Sensoryka", "Rozpył", "Zagniot", "Fizykochemia", "Funkcjonalne"] as const;

export function parsePresetRange(preset: string) {
  const normalized = preset.replace(/,/g, ".");
  const numbers = [...normalized.matchAll(/(\d+(?:\.\d+)?)/g)].map((match) => Number(match[1]));
  if (numbers.length < 2) return null;
  return { min: numbers[numbers.length - 2], max: numbers[numbers.length - 1] };
}
