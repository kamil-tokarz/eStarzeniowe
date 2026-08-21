import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, TestValueType } from "../generated/prisma/client";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required for extra seed");

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

const definitions = [
  ["WEIGHT", "Waga", "Pomiary", TestValueType.NUMBER, "g", null],
  ["PRESSURE", "Ciśnienie bieżące", "Pomiary", TestValueType.NUMBER, "bar", null],
  ["APPEARANCE", "Wygląd", "Sensoryka", TestValueType.DICTIONARY, null, "appearance"],
  ["ODOR", "Zapach", "Sensoryka", TestValueType.DICTIONARY, null, "odor"],
  ["COLOR", "Barwa", "Sensoryka", TestValueType.DICTIONARY, null, "color"],
  ["SPRAY_TYPE", "Rozpył", "Rozpył", TestValueType.DICTIONARY, null, "spray"],
  ["SPRAY_RATE", "Prędkość rozpyłu", "Rozpył", TestValueType.NUMBER, "g/sek", null],
  ["SPRAY_DIAMETER", "Średnica rozpyłu", "Rozpył", TestValueType.NUMBER, "cm", null],
  ["STEM_HEIGHT", "Wysokość kominka/stemu", "Rozpył", TestValueType.NUMBER, "mm", null],
  ["CRIMP_WIDTH", "Szerokość zagniotu", "Zagniot", TestValueType.NUMBER, "mm", null],
  ["CRIMP_HEIGHT", "Wysokość zagniotu", "Zagniot", TestValueType.NUMBER, "mm", null],
  ["EMPTYING", "Opróżnialność", "Fizykochemia", TestValueType.NUMBER, "%", null],
  ["PH", "pH", "Fizykochemia", TestValueType.NUMBER, null, null],
  ["DENSITY", "Gęstość", "Fizykochemia", TestValueType.NUMBER, "g/cm³", null],
  ["FLASH_POINT", "Flesh point", "Fizykochemia", TestValueType.NUMBER, "°C", null],
  ["PRESSURE_20", "Ciśnienie w 20°C", "Fizykochemia", TestValueType.NUMBER, "bar", null],
  ["PRESSURE_50", "Ciśnienie w 50°C", "Fizykochemia", TestValueType.NUMBER, "bar", null],
  ["SPRAYTEC", "Badanie Spraytec", "Funkcjonalne", TestValueType.BOOLEAN, null, null],
] as const;

const dictionaries: Record<string, string[]> = {
  appearance: ["Bez zmian", "Jednorodny", "Niejednorodny", "Rozwarstwienie", "Osad"],
  odor: ["Bez zmian", "Charakterystyczny", "Zmieniony", "Obcy"],
  color: ["Bez zmian", "Zgodna ze wzorcem", "Jaśniejsza", "Ciemniejsza", "Zmieniona"],
  spray: ["Mgiełka", "Jet", "Emulsja typu spray on"],
  crimp_width_setup: [
    "STAL - ALU 26,9 - 27,1",
    "STAL - STAL 27,1 - 27,3",
    "ALU - STAL 27,1 - 27,3",
    "ALU - ALU 26,9 - 27,1",
    "ALU + POLEROWANY RANT - ALU/STAL 27,1 - 27,3",
  ],
  crimp_height_setup: [
    "STAL - ALU | 4,7 - 4,9",
    "STAL - STAL | 4,7 - 4,9",
    "ALU - STAL | 4,9 - 5,1",
    "ALU - ALU | 5,0 - 5,2",
    "ALU/STAL | 4,9 - 5,0",
    "INNE",
  ],
  microbiology: [
    "Liczba bakterii tlenowych mezofilnych wg PN-EN ISO 21149:2017-07",
    "Liczba drożdży i pleśni wg PN-EN ISO 16212:2017-08",
    "Obecność P. aeruginosa w 1 g lub ml wg PN-EN ISO 22717:2016-01",
    "Obecność E. coli w 1 g lub ml wg PN-EN ISO 21150:2016-01",
    "Obecność S. aureus w 1 g lub ml wg PN-EN ISO 22718:2016-01",
    "Obecność C. albicans w 1 g lub ml wg PN-EN ISO 18416:2016-01",
    "Test konserwacji wg PN-EN ISO 11930:2019-03",
    "Ocena przydatności metody: Badanie Czystości Mikrobiologicznej Kosmetyków",
    "TAMC (2.6.12)",
    "TYMC (2.6.12)",
    "Obecność P. aeruginosa w 1 g lub ml (2.6.13)",
    "Obecność S. aureus w 1 g lub ml (2.6.13)",
    "Obecność E. coli w 1 g lub ml (2.6.13)",
    "Obecność C. albicans w 1 g lub ml (2.6.13)",
    "Obecność Salmonella w 10 g lub ml (2.6.13)",
    "Obecność bakterii Gram-ujemnych tolerujących żółć (2.6.13)",
    "NPL bakterii Gram-ujemnych tolerujących żółć (2.6.13)",
    "Obecność Salmonella w 25 g lub ml (2.6.31)",
    "Liczba Escherichia coli (NPL) (2.6.31)",
    "NPL bakterii Gram-ujemnych tolerujących żółć (2.6.31)",
    "Test konserwacji wg FP XIII - preparaty do uszu, nosa, do stosowania nas skórę, do inhalacji (S. aureus, P. aeruginosa, C. albicans, A. brasiliensis)",
    "Test konserwacji wg FP XIII – preparaty doustne, do stosowania w jamie ustnej (S. aureus, P. aeruginosa, E. coli, C. albicans, A. brasiliensis)",
    "Test konserwacji wg FP XIII – preparaty doodbytnicze (S. aureus, P. aeruginosa, C. albicans, A. brasiliensis)",
    "Ocena przydatności metody: Badanie czystości mikrobiologicznej produktów niejałowych wg FPXII",
  ],
};

async function main() {
  for (let i = 0; i < definitions.length; i++) {
    const [code, name, category, valueType, unit, dictionaryKey] = definitions[i];
    await prisma.testDefinition.upsert({
      where: { code },
      update: { name, category, valueType, unit, dictionaryKey, active: true, sortOrder: i + 1 },
      create: { code, name, category, valueType, unit, dictionaryKey, active: true, sortOrder: i + 1 },
    });
  }

  for (const [category, values] of Object.entries(dictionaries)) {
    for (let i = 0; i < values.length; i++) {
      const value = values[i];
      await prisma.dictionaryEntry.upsert({
        where: { category_value: { category, value } },
        update: { active: true, sortOrder: i + 1 },
        create: { category, value, active: true, sortOrder: i + 1 },
      });
    }
  }

  console.log("Seed extra zakończony: pełny katalog badań i 24 badania mikrobiologiczne.");
}

main().finally(() => prisma.$disconnect());
