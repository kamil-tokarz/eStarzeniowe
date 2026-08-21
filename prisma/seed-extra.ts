import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, TestValueType } from "../generated/prisma/client";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required for extra seed");

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

const definitions = [
  ["PRESSURE_20", "Ciśnienie w 20°C", "Fizykochemia", TestValueType.NUMBER, "bar", null],
  ["PRESSURE_50", "Ciśnienie w 50°C", "Fizykochemia", TestValueType.NUMBER, "bar", null],
] as const;

const dictionaries: Record<string, string[]> = {
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
  const currentMax = await prisma.testDefinition.aggregate({ _max: { sortOrder: true } });
  let sortOrder = (currentMax._max.sortOrder ?? 0) + 1;
  for (const [code, name, category, valueType, unit, dictionaryKey] of definitions) {
    await prisma.testDefinition.upsert({
      where: { code },
      update: { name, category, valueType, unit, dictionaryKey, active: true },
      create: { code, name, category, valueType, unit, dictionaryKey, active: true, sortOrder: sortOrder++ },
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
