import "dotenv/config";
import assert from "node:assert/strict";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, StandardStatus } from "../generated/prisma/client";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required for seed verification");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

const expectedStandards: Record<string, number> = {
  "Produkty wrażliwe mikrobiologicznie": 26,
  "Filtry UV": 30,
  "Wyroby medyczne": 30,
  "Produkty niewrażliwe mikrobiologicznie": 18,
  "Standard WD-40_3M": 30,
  "Standard WD-40_60M": 66,
  "Standardowe 3M": 17,
};

async function main() {
  const microbiology = await prisma.dictionaryEntry.count({ where: { category: "microbiology", active: true } });
  assert.equal(microbiology, 24, `Oczekiwano 24 aktywnych pozycji mikrobiologii, jest ${microbiology}.`);

  const gasTypes = await prisma.dictionaryEntry.count({ where: { category: "gas_type", active: true } });
  assert.equal(gasTypes, 14, `Oczekiwano 14 rodzajów gazu z BPM, jest ${gasTypes}.`);

  const purposes = await prisma.dictionaryEntry.count({ where: { category: "study_purpose", active: true } });
  assert.equal(purposes, 8, `Oczekiwano 8 celów testów z BPM, jest ${purposes}.`);

  const standards = await prisma.stabilityStandard.findMany({
    where: { name: { in: Object.keys(expectedStandards) } },
    include: { _count: { select: { definitions: true } } },
  });
  assert.equal(standards.length, 7, `Oczekiwano 7 standardów z workflow, jest ${standards.length}.`);

  let definitionCount = 0;
  for (const [name, expectedDefinitions] of Object.entries(expectedStandards)) {
    const standard = standards.find((item) => item.name === name);
    assert.ok(standard, `Brakuje standardu: ${name}.`);
    assert.equal(standard.status, StandardStatus.ACTIVE, `${name} powinien być dostępny w formularzu testowym.`);
    assert.equal(standard.locked, true, `${name} powinien być chroniony przed przypadkową zmianą po aktywacji.`);
    assert.equal(standard._count.definitions, expectedDefinitions, `${name}: oczekiwano ${expectedDefinitions} definicji, jest ${standard._count.definitions}.`);
    definitionCount += standard._count.definitions;
  }
  assert.equal(definitionCount, 217, `Oczekiwano 217 definicji próbek, jest ${definitionCount}.`);

  const referenceWithDate = await prisma.standardSampleDefinition.count({
    where: {
      standard: { name: { in: Object.keys(expectedStandards) } },
      role: "REFERENCE",
      checkpointDays: { not: null },
    },
  });
  assert.equal(referenceWithDate, 0, "Próbki RF nie mogą mieć offsetu terminu.");

  const microWithoutDate = await prisma.standardSampleDefinition.count({
    where: {
      standard: { name: { in: Object.keys(expectedStandards) } },
      role: "MICROBIOLOGY",
      checkpointDays: null,
    },
  });
  assert.equal(microWithoutDate, 0, "Próbki mikrobiologiczne muszą mieć stały offset dni.");

  const users = await prisma.user.findMany({ where: { login: { in: ["admin", "technolog", "laborant"] }, active: true } });
  assert.equal(users.length, 3, "Brakuje któregoś z trzech kont testowych.");

  const studies = await prisma.study.count();
  assert.equal(studies, 0, `Świeży seed ma startować bez zleceń demonstracyjnych; znaleziono ${studies}.`);

  console.log("Seed verification OK: 0 zleceń demo, 14 gazów, 8 celów, 24 mikro, 7 aktywnych standardów, 217 definicji próbek.");
}

main().finally(() => prisma.$disconnect());
