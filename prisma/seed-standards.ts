import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, SampleRole, StandardStatus } from "../generated/prisma/client";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required for standards seed");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

// Źródło: Harmonogram Testów Starzeniowych(1).workflow / tabela "Próbki".
// System docelowy wymaga stałych offsetów DAY, dlatego etykiety M są jawnie konwertowane jako 30 dni na miesiąc.
// Standardy pozostają DRAFT do biznesowego zatwierdzenia tej konwersji przez Administratora.
const DAYS_PER_MONTH = 30;

type SourceRow = readonly [code: string, storageCondition: string, checkpointLabel: string, microbiology: boolean];

const sourceStandards: Record<string, readonly SourceRow[]> = {
  "Produkty wrażliwe mikrobiologicznie": [
    ["Z03", "5°C ± 3°C (pref. 3°C)", "3M", false],
    ["ZRFa", "5°C ± 3°C (pref. 3°C)", "ref.", false],
    ["ZRFb", "5°C ± 3°C (pref. 3°C)", "ref.", false],
    ["R00a", "RT (20-25°C)", "0M", false],
    ["R00b", "RT (20-25°C)", "0M", true],
    ["R03a", "RT (20-25°C)", "3M", false],
    ["R03b", "RT (20-25°C)", "3M", true],
    ["R06a", "RT (20-25°C)", "6M", false],
    ["R06b", "RT (20-25°C)", "6M", true],
    ["R09", "RT (20-25°C)", "9M", false],
    ["R12", "RT (20-25°C)", "12M", false],
    ["R18", "RT (20-25°C)", "18M", false],
    ["R24a", "RT (20-25°C)", "24M", false],
    ["R24b", "RT (20-25°C)", "24M", true],
    ["R36a", "RT (20-25°C)", "36M", false],
    ["R36b", "RT (20-25°C)", "36M", true],
    ["RRFa", "RT (20-25°C)", "ref.", false],
    ["RRFb", "RT (20-25°C)", "ref.", false],
    ["C01a", "40°C ± 2°C", "1M", false],
    ["C01b", "40°C ± 2°C", "1M", true],
    ["C03a", "40°C ± 2°C", "3M", false],
    ["C03b", "40°C ± 2°C", "3M", true],
    ["C06a", "40°C ± 2°C", "6M", false],
    ["C06b", "40°C ± 2°C", "6M", true],
    ["CRFa", "40°C ± 2°C", "ref.", false],
    ["CRFb", "40°C ± 2°C", "ref.", false],
  ],
  "Filtry UV": [
    ["Z03", "5°C ± 3°C (pref. 3°C)", "3M", false],
    ["ZRFa", "5°C ± 3°C (pref. 3°C)", "ref.", false],
    ["ZRFb", "5°C ± 3°C (pref. 3°C)", "ref.", false],
    ["R00a", "RT (20-25°C)", "0M", false],
    ["R00b", "RT (20-25°C)", "0M", true],
    ["R03a", "RT (20-25°C)", "3M", false],
    ["R03b", "RT (20-25°C)", "3M", true],
    ["R06a", "RT (20-25°C)", "6M", false],
    ["R06b", "RT (20-25°C)", "6M", true],
    ["R12", "RT (20-25°C)", "12M", false],
    ["R18", "RT (20-25°C)", "18M", false],
    ["R24a", "RT (20-25°C)", "24M", false],
    ["R24b", "RT (20-25°C)", "24M", true],
    ["R36a", "RT (20-25°C)", "36M", false],
    ["R36b", "RT (20-25°C)", "36M", true],
    ["RRFa", "RT (20-25°C)", "ref.", false],
    ["RRFb", "RT (20-25°C)", "ref.", false],
    ["C01a", "40°C ± 2°C", "1M", false],
    ["C01b", "40°C ± 2°C", "1M", true],
    ["C03a", "40°C ± 2°C", "3M", false],
    ["C03b", "40°C ± 2°C", "3M", true],
    ["C06a", "40°C ± 2°C", "6M", false],
    ["C06b", "40°C ± 2°C", "6M", true],
    ["CRFa", "40°C ± 2°C", "ref.", false],
    ["CRFb", "40°C ± 2°C", "ref.", false],
    ["H01", "50°C ± 2°C", "1M", false],
    ["H03a", "50°C ± 2°C", "3M", false],
    ["H03b", "50°C ± 2°C", "3M", true],
    ["HRFa", "50°C ± 2°C", "Ref.", false],
    ["HRFb", "50°C ± 2°C", "Ref.", false],
  ],
  "Wyroby medyczne": [
    ["Z03a", "5°C ± 3°C (pref. 3°C)", "3M", false],
    ["Z03b", "5°C ± 3°C (pref. 3°C)", "3M", true],
    ["Z06", "5°C ± 3°C (pref. 3°C)", "6M", false],
    ["ZRFa", "5°C ± 3°C (pref. 3°C)", "ref.", false],
    ["ZRFb", "5°C ± 3°C (pref. 3°C)", "ref.", false],
    ["R00a", "RT (20-25°C)", "0M", false],
    ["R00b", "RT (20-25°C)", "0M", true],
    ["R03a", "RT (20-25°C)", "3M", false],
    ["R03b", "RT (20-25°C)", "3M", true],
    ["R06a", "RT (20-25°C)", "6M", false],
    ["R06b", "RT (20-25°C)", "6M", true],
    ["R09", "RT (20-25°C)", "9M", false],
    ["R12a", "RT (20-25°C)", "12M", false],
    ["R12b", "RT (20-25°C)", "12M", true],
    ["R18a", "RT (20-25°C)", "18M", false],
    ["R18b", "RT (20-25°C)", "18M", true],
    ["R24a", "RT (20-25°C)", "24M", false],
    ["R24b", "RT (20-25°C)", "24M", true],
    ["R36a", "RT (20-25°C)", "36M", false],
    ["R36b", "RT (20-25°C)", "36M", true],
    ["RRFa", "RT (20-25°C)", "ref.", false],
    ["RRFb", "RT (20-25°C)", "ref.", false],
    ["B01a", "45°C ± 2°C/ 75% RH", "1M", false],
    ["B01b", "45°C ± 2°C/ 75% RH", "1M", true],
    ["B03a", "45°C ± 2°C/ 75% RH", "3M", false],
    ["B03b", "45°C ± 2°C/ 75% RH", "3M", true],
    ["B06a", "45°C ± 2°C/ 75% RH", "6M", false],
    ["B06b", "45°C ± 2°C/ 75% RH", "6M", true],
    ["BRFa", "45°C ± 2°C/ 75% RH", "ref.", false],
    ["BRFb", "45°C ± 2°C/ 75% RH", "ref.", false],
  ],
  "Produkty niewrażliwe mikrobiologicznie": [
    ["Z03", "5°C ± 3°C (pref. 3°C)", "3M", false],
    ["ZRFa", "5°C ± 3°C (pref. 3°C)", "ref.", false],
    ["ZRFb", "5°C ± 3°C (pref. 3°C)", "ref.", false],
    ["R00a", "RT (20-25°C)", "0M", false],
    ["R03a", "RT (20-25°C)", "3M", false],
    ["R06a", "RT (20-25°C)", "6M", false],
    ["R09", "RT (20-25°C)", "9M", false],
    ["R12", "RT (20-25°C)", "12M", false],
    ["R18", "RT (20-25°C)", "18M", false],
    ["R24a", "RT (20-25°C)", "24M", false],
    ["R36a", "RT (20-25°C)", "36M", false],
    ["RRFa", "RT (20-25°C)", "ref.", false],
    ["RRFb", "RT (20-25°C)", "ref.", false],
    ["C01a", "40°C ± 2°C", "1M", false],
    ["C03a", "40°C ± 2°C", "3M", false],
    ["C06a", "40°C ± 2°C", "6M", false],
    ["CRFa", "40°C ± 2°C", "ref.", false],
    ["CRFb", "40°C ± 2°C", "ref.", false],
  ],
  "Standard WD-40_3M": [
    ["R00.1", "RT (20-25°C)", "0M", false],
    ["R00.2", "RT (20-25°C)", "0M", false],
    ["R00.3", "RT (20-25°C)", "0M", false],
    ["R00.4", "RT (20-25°C)", "0M", false],
    ["R00.5", "RT (20-25°C)", "0M", false],
    ["R00.6", "RT (20-25°C)", "0M", false],
    ["R01.1", "RT (20-25°C)", "1M", false],
    ["R01.2", "RT (20-25°C)", "1M", false],
    ["R01.3", "RT (20-25°C)", "1M", false],
    ["R01.4", "RT (20-25°C)", "1M", false],
    ["R02.1", "RT (20-25°C)", "2M", false],
    ["R02.2", "RT (20-25°C)", "2M", false],
    ["R02.3", "RT (20-25°C)", "2M", false],
    ["R02.4", "RT (20-25°C)", "2M", false],
    ["R03.1", "RT (20-25°C)", "3M", false],
    ["R03.2", "RT (20-25°C)", "3M", false],
    ["R03.3", "RT (20-25°C)", "3M", false],
    ["R03.4", "RT (20-25°C)", "3M", false],
    ["C01.1", "40°C ± 2°C", "1M", false],
    ["C01.2", "40°C ± 2°C", "1M", false],
    ["C01.3", "40°C ± 2°C", "1M", false],
    ["C01.4", "40°C ± 2°C", "1M", false],
    ["C02.1", "40°C ± 2°C", "2M", false],
    ["C02.2", "40°C ± 2°C", "2M", false],
    ["C02.3", "40°C ± 2°C", "2M", false],
    ["C02.4", "40°C ± 2°C", "2M", false],
    ["C03.1", "40°C ± 2°C", "3M", false],
    ["C03.2", "40°C ± 2°C", "3M", false],
    ["C03.3", "40°C ± 2°C", "3M", false],
    ["C03.4", "40°C ± 2°C", "3M", false],
  ],
  "Standard WD-40_60M": [
    ["R00.1", "RT (20-25°C)", "0M", false],
    ["R00.2", "RT (20-25°C)", "0M", false],
    ["R00.3", "RT (20-25°C)", "0M", false],
    ["R00.4", "RT (20-25°C)", "0M", false],
    ["R00.5", "RT (20-25°C)", "0M", false],
    ["R00.6", "RT (20-25°C)", "0M", false],
    ["R01.1", "RT (20-25°C)", "1M", false],
    ["R01.2", "RT (20-25°C)", "1M", false],
    ["R01.3", "RT (20-25°C)", "1M", false],
    ["R01.4", "RT (20-25°C)", "1M", false],
    ["R02.1", "RT (20-25°C)", "2M", false],
    ["R02.2", "RT (20-25°C)", "2M", false],
    ["R02.3", "RT (20-25°C)", "2M", false],
    ["R02.4", "RT (20-25°C)", "2M", false],
    ["R03.1", "RT (20-25°C)", "3M", false],
    ["R03.2", "RT (20-25°C)", "3M", false],
    ["R03.3", "RT (20-25°C)", "3M", false],
    ["R03.4", "RT (20-25°C)", "3M", false],
    ["R04.1", "RT (20-25°C)", "4M", false],
    ["R04.2", "RT (20-25°C)", "4M", false],
    ["R04.3", "RT (20-25°C)", "4M", false],
    ["R04.4", "RT (20-25°C)", "4M", false],
    ["R06.1", "RT (20-25°C)", "6M", false],
    ["R06.2", "RT (20-25°C)", "6M", false],
    ["R06.3", "RT (20-25°C)", "6M", false],
    ["R06.4", "RT (20-25°C)", "6M", false],
    ["R12.1", "RT (20-25°C)", "12M", false],
    ["R12.2", "RT (20-25°C)", "12M", false],
    ["R12.3", "RT (20-25°C)", "12M", false],
    ["R12.4", "RT (20-25°C)", "12M", false],
    ["R18.1", "RT (20-25°C)", "18M", false],
    ["R18.2", "RT (20-25°C)", "18M", false],
    ["R18.3", "RT (20-25°C)", "18M", false],
    ["R18.4", "RT (20-25°C)", "18M", false],
    ["R24.1", "RT (20-25°C)", "24M", false],
    ["R24.2", "RT (20-25°C)", "24M", false],
    ["R24.3", "RT (20-25°C)", "24M", false],
    ["R24.4", "RT (20-25°C)", "24M", false],
    ["R30.1", "RT (20-25°C)", "30M", false],
    ["R30.2", "RT (20-25°C)", "30M", false],
    ["R30.3", "RT (20-25°C)", "30M", false],
    ["R30.4", "RT (20-25°C)", "30M", false],
    ["R36.1", "RT (20-25°C)", "36M", false],
    ["R36.2", "RT (20-25°C)", "36M", false],
    ["R36.3", "RT (20-25°C)", "36M", false],
    ["R36.4", "RT (20-25°C)", "36M", false],
    ["R48.1", "RT (20-25°C)", "48M", false],
    ["R48.2", "RT (20-25°C)", "48M", false],
    ["R48.3", "RT (20-25°C)", "48M", false],
    ["R48.4", "RT (20-25°C)", "48M", false],
    ["R60.1", "RT (20-25°C)", "60M", false],
    ["R60.2", "RT (20-25°C)", "60M", false],
    ["R60.3", "RT (20-25°C)", "60M", false],
    ["R60.4", "RT (20-25°C)", "60M", false],
    ["C01.1", "40°C ± 2°C", "1M", false],
    ["C01.2", "40°C ± 2°C", "1M", false],
    ["C01.3", "40°C ± 2°C", "1M", false],
    ["C01.4", "40°C ± 2°C", "1M", false],
    ["C02.1", "40°C ± 2°C", "2M", false],
    ["C02.2", "40°C ± 2°C", "2M", false],
    ["C02.3", "40°C ± 2°C", "2M", false],
    ["C02.4", "40°C ± 2°C", "2M", false],
    ["C03.1", "40°C ± 2°C", "3M", false],
    ["C03.2", "40°C ± 2°C", "3M", false],
    ["C03.3", "40°C ± 2°C", "3M", false],
    ["C03.4", "40°C ± 2°C", "3M", false],
  ],
  "Standardowe 3M": [
    ["Z03", "5°C ± 3°C (pref. 3°C)", "3M", false],
    ["ZRFa", "5°C ± 3°C (pref. 3°C)", "ref.", false],
    ["ZRFb", "5°C ± 3°C (pref. 3°C)", "ref.", false],
    ["R00a", "RT (20-25°C)", "0M", false],
    ["R00b", "RT (20-25°C)", "0M", true],
    ["R03a", "RT (20-25°C)", "3M", false],
    ["R03b", "RT (20-25°C)", "3M", true],
    ["R06a", "RT (20-25°C)", "6M", false],
    ["R06b", "RT (20-25°C)", "6M", true],
    ["RRFa", "RT (20-25°C)", "ref.", false],
    ["RRFb", "RT (20-25°C)", "ref.", false],
    ["C01a", "40°C ± 2°C", "1M", false],
    ["C01b", "40°C ± 2°C", "1M", true],
    ["C03a", "40°C ± 2°C", "3M", false],
    ["C03b", "40°C ± 2°C", "3M", true],
    ["CRFa", "40°C ± 2°C", "ref.", false],
    ["CRFb", "40°C ± 2°C", "ref.", false],
  ],
};

function roleFor(checkpointLabel: string, microbiology: boolean) {
  if (checkpointLabel.trim().toLowerCase().startsWith("ref")) return SampleRole.REFERENCE;
  if (microbiology) return SampleRole.MICROBIOLOGY;
  return SampleRole.STANDARD;
}

function checkpointDays(checkpointLabel: string) {
  const normalized = checkpointLabel.trim().toUpperCase();
  if (normalized.startsWith("REF")) return null;
  const match = normalized.match(/^(\d+)M$/);
  if (!match) throw new Error(`Nieobsługiwana etykieta checkpointu: ${checkpointLabel}`);
  return Number(match[1]) * DAYS_PER_MONTH;
}

async function main() {
  for (const [name, rows] of Object.entries(sourceStandards)) {
    const standard = await prisma.stabilityStandard.upsert({
      where: { name },
      update: {
        status: StandardStatus.DRAFT,
        locked: false,
        description: "Plan próbek zaimportowany 1:1 z workflow. Offsety: 30 dni na każdy miesiąc etykiety M. Zweryfikuj przed aktywacją.",
      },
      create: {
        name,
        status: StandardStatus.DRAFT,
        locked: false,
        description: "Plan próbek zaimportowany 1:1 z workflow. Offsety: 30 dni na każdy miesiąc etykiety M. Zweryfikuj przed aktywacją.",
      },
    });

    const usedByStudies = await prisma.study.count({ where: { standardId: standard.id } });
    if (usedByStudies > 0) {
      console.warn(`Pomijam odświeżenie standardu ${name}: jest już użyty w badaniu.`);
      continue;
    }

    await prisma.standardSampleDefinition.deleteMany({ where: { standardId: standard.id } });
    await prisma.standardSampleDefinition.createMany({
      data: rows.map(([code, storageCondition, label, microbiology], index) => ({
        standardId: standard.id,
        code,
        checkpointLabel: label,
        checkpointDays: checkpointDays(label),
        storageCondition,
        position: null,
        role: roleFor(label, microbiology),
        quantity: 1,
        sortOrder: index + 1,
      })),
    });
  }

  const summary = await prisma.stabilityStandard.findMany({
    where: { name: { in: Object.keys(sourceStandards) } },
    include: { _count: { select: { definitions: true } } },
    orderBy: { name: "asc" },
  });
  console.log("Seed standardów z workflow:", summary.map((item) => `${item.name}: ${item._count.definitions}`).join(" | "));
}

main().finally(() => prisma.$disconnect());
