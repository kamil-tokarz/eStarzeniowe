import { PrismaPg } from "@prisma/adapter-pg";
import {
  PrismaClient,
  SampleRole,
  StandardStatus,
  TestValueType,
  UserRole,
} from "../generated/prisma/client";
import { hashPassword } from "../lib/password";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required for seed");

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

async function main() {
  const users = [
    { login: "admin", name: "Administrator", password: "admin", role: UserRole.ADMIN },
    { login: "technolog", name: "Technolog Testowy", password: "test", role: UserRole.TECHNOLOGIST },
    { login: "laborant", name: "Laborant Testowy", password: "test", role: UserRole.LAB_TECHNICIAN },
  ];

  for (const user of users) {
    await prisma.user.upsert({
      where: { login: user.login },
      update: {},
      create: {
        login: user.login,
        name: user.name,
        passwordHash: hashPassword(user.password),
        role: user.role,
        active: true,
      },
    });
  }

  for (const name of ["Klient demonstracyjny A", "Klient demonstracyjny B"]) {
    await prisma.client.upsert({
      where: { name },
      update: {},
      create: { name, active: true },
    });
  }

  const definitions = [
    ["WEIGHT", "Waga", "Pomiary", TestValueType.NUMBER, "g"],
    ["PRESSURE", "Ciśnienie", "Pomiary", TestValueType.NUMBER, "bar"],
    ["PH", "pH", "Fizykochemia", TestValueType.NUMBER, null],
    ["DENSITY", "Gęstość", "Fizykochemia", TestValueType.NUMBER, "g/ml"],
    ["APPEARANCE", "Wygląd", "Sensoryka", TestValueType.DICTIONARY, null],
    ["ODOR", "Zapach", "Sensoryka", TestValueType.DICTIONARY, null],
    ["COLOR", "Barwa", "Sensoryka", TestValueType.DICTIONARY, null],
    ["SPRAY_TYPE", "Rodzaj rozpyłu", "Rozpył", TestValueType.DICTIONARY, null],
    ["SPRAY_RATE", "Szybkość rozpylania", "Rozpył", TestValueType.NUMBER, "g/s"],
    ["SPRAY_DIAMETER", "Średnica rozpyłu", "Rozpył", TestValueType.NUMBER, "cm"],
    ["STEM_HEIGHT", "Wysokość trzpienia", "Rozpył", TestValueType.NUMBER, "mm"],
    ["CRIMP_WIDTH", "Szerokość zagniotu", "Zagniot", TestValueType.NUMBER, "mm"],
    ["CRIMP_HEIGHT", "Wysokość zagniotu", "Zagniot", TestValueType.NUMBER, "mm"],
    ["EMPTYING", "Opróżnialność", "Fizykochemia", TestValueType.NUMBER, "%"],
    ["FLASH_POINT", "Flesh point", "Fizykochemia", TestValueType.NUMBER, "°C"],
    ["SPRAYTEC", "Spraytec", "Funkcjonalne", TestValueType.BOOLEAN, null],
  ] as const;

  for (let i = 0; i < definitions.length; i++) {
    const [code, name, category, valueType, unit] = definitions[i];
    await prisma.testDefinition.upsert({
      where: { code },
      update: { name, category, valueType, unit, active: true, sortOrder: i + 1 },
      create: { code, name, category, valueType, unit, active: true, sortOrder: i + 1 },
    });
  }

  const dictionaryValues: Record<string, string[]> = {
    appearance: ["Bez zmian", "Jednorodny", "Niejednorodny", "Rozwarstwienie", "Osad"],
    odor: ["Bez zmian", "Charakterystyczny", "Zmieniony", "Obcy"],
    color: ["Bez zmian", "Zgodna ze wzorcem", "Jaśniejsza", "Ciemniejsza", "Zmieniona"],
    spray: ["Prawidłowy", "Strumień", "Mgła", "Niejednorodny", "Przerywany"],
    microbiology: [
      "Ogólna liczba drobnoustrojów tlenowych",
      "Drożdże i pleśnie",
      "Pseudomonas aeruginosa",
      "Staphylococcus aureus",
      "Candida albicans",
      "Escherichia coli",
    ],
  };

  for (const [category, values] of Object.entries(dictionaryValues)) {
    for (let i = 0; i < values.length; i++) {
      const value = values[i];
      await prisma.dictionaryEntry.upsert({
        where: { category_value: { category, value } },
        update: { active: true, sortOrder: i + 1 },
        create: { category, value, active: true, sortOrder: i + 1 },
      });
    }
  }

  const standard = await prisma.stabilityStandard.upsert({
    where: { name: "Standard demonstracyjny 6M" },
    update: {},
    create: {
      name: "Standard demonstracyjny 6M",
      description: "Standard testowy z jawnymi offsetami DAY; służy do testów procesu do czasu zatwierdzenia standardów produkcyjnych.",
      status: StandardStatus.ACTIVE,
      locked: true,
    },
  });

  const standardDefinitions = [
    { code: "R00a", checkpointLabel: "0D", checkpointDays: 0, storageCondition: "RT (20-25°C)", role: SampleRole.STANDARD, sortOrder: 1 },
    { code: "C01a", checkpointLabel: "30D", checkpointDays: 30, storageCondition: "40°C ± 2°C", role: SampleRole.STANDARD, sortOrder: 2 },
    { code: "R03a", checkpointLabel: "90D", checkpointDays: 90, storageCondition: "RT (20-25°C)", role: SampleRole.STANDARD, sortOrder: 3 },
    { code: "R03b", checkpointLabel: "90D", checkpointDays: 90, storageCondition: "RT (20-25°C)", role: SampleRole.MICROBIOLOGY, sortOrder: 4 },
    { code: "C03a", checkpointLabel: "90D", checkpointDays: 90, storageCondition: "40°C ± 2°C", role: SampleRole.STANDARD, sortOrder: 5 },
    { code: "R06a", checkpointLabel: "180D", checkpointDays: 180, storageCondition: "RT (20-25°C)", role: SampleRole.STANDARD, sortOrder: 6 },
    { code: "RRFa", checkpointLabel: "REF", checkpointDays: null, storageCondition: "RT (20-25°C)", role: SampleRole.REFERENCE, sortOrder: 7 },
    { code: "RRFb", checkpointLabel: "REF", checkpointDays: null, storageCondition: "RT (20-25°C)", role: SampleRole.REFERENCE, sortOrder: 8 },
    { code: "CRFa", checkpointLabel: "REF", checkpointDays: null, storageCondition: "40°C ± 2°C", role: SampleRole.REFERENCE, sortOrder: 9 },
  ];

  for (const definition of standardDefinitions) {
    await prisma.standardSampleDefinition.upsert({
      where: { standardId_code: { standardId: standard.id, code: definition.code } },
      update: definition,
      create: { standardId: standard.id, ...definition },
    });
  }

  const importedStandardNames = [
    "Produkty wrażliwe mikrobiologicznie",
    "Filtry UV",
    "Wyroby medyczne",
    "Produkty niewrażliwe mikrobiologicznie",
    "Standard WD-40_3M",
    "Standard WD-40_60M",
    "Standardowe 3M",
  ];

  for (const name of importedStandardNames) {
    await prisma.stabilityStandard.upsert({
      where: { name },
      update: {},
      create: {
        name,
        status: StandardStatus.DRAFT,
        description: "Standard zaimportowany z workflow. Offsety DAY wymagają zatwierdzenia przed aktywacją.",
      },
    });
  }

  console.log("Seed bazowy zakończony. Konta testowe gotowe, brak zleceń demonstracyjnych.");
}

main().finally(async () => prisma.$disconnect());
