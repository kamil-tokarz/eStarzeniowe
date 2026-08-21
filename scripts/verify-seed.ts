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
  const microbiology = await prisma.dictionaryEntry.findMany({
    where: { category: "microbiology", active: true },
    orderBy: { sortOrder: "asc" },
  });
  assert.equal(microbiology.length, 24, `Oczekiwano 24 aktywnych pozycji mikrobiologii, jest ${microbiology.length}.`);

  const standards = await prisma.stabilityStandard.findMany({
    where: { name: { in: Object.keys(expectedStandards) } },
    include: { _count: { select: { definitions: true } } },
  });
  assert.equal(standards.length, 7, `Oczekiwano 7 standardów z workflow, jest ${standards.length}.`);

  let definitionCount = 0;
  for (const [name, expectedDefinitions] of Object.entries(expectedStandards)) {
    const standard = standards.find((item) => item.name === name);
    assert.ok(standard, `Brakuje standardu: ${name}.`);
    assert.equal(standard.status, StandardStatus.DRAFT, `${name} powinien pozostać DRAFT do zatwierdzenia offsetów.`);
    assert.equal(standard.locked, false, `${name} nie powinien być zablokowany przed pierwszym użyciem.`);
    assert.equal(standard._count.definitions, expectedDefinitions, `${name}: oczekiwano ${expectedDefinitions} definicji, jest ${standard._count.definitions}.`);
    definitionCount += standard._count.definitions;
  }
  assert.equal(definitionCount, 217, `Oczekiwano 217 definicji próbek, jest ${definitionCount}.`);

  const referenceWithoutDate = await prisma.standardSampleDefinition.count({
    where: {
      standard: { name: { in: Object.keys(expectedStandards) } },
      role: "REFERENCE",
      checkpointDays: { not: null },
    },
  });
  assert.equal(referenceWithoutDate, 0, "Próbki RF nie mogą mieć offsetu terminu.");

  const microWithDate = await prisma.standardSampleDefinition.count({
    where: {
      standard: { name: { in: Object.keys(expectedStandards) } },
      role: "MICROBIOLOGY",
      checkpointDays: null,
    },
  });
  assert.equal(microWithDate, 0, "Próbki mikrobiologiczne muszą mieć stały offset dni.");

  const users = await prisma.user.findMany({ where: { login: { in: ["admin", "technolog", "laborant"] }, active: true } });
  assert.equal(users.length, 3, "Brakuje któregoś z trzech kont testowych.");

  console.log("Seed verification OK: 24 mikro, 7 standardów, 217 definicji próbek, RF bez terminów.");
}

main().finally(() => prisma.$disconnect());
