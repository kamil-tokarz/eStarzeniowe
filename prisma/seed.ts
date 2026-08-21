import { PrismaPg } from "@prisma/adapter-pg";
import {
  CriterionKind,
  Evaluation,
  PrismaClient,
  ReferenceStatus,
  ResultState,
  SampleExecutionStatus,
  SampleRole,
  StandardStatus,
  StudyStatus,
  TestValueType,
  UserRole,
} from "../generated/prisma/client";
import { hashPassword } from "../lib/password";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required for seed");

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

const DAY = 24 * 60 * 60 * 1000;
const dateFromNow = (days: number) => new Date(Date.now() + days * DAY);

async function main() {
  await prisma.session.deleteMany();
  await prisma.testResultHistory.deleteMany();
  await prisma.testResult.deleteMany();
  await prisma.sampleTest.deleteMany();
  await prisma.microbiologyResult.deleteMany();
  await prisma.initialMeasurement.deleteMany();
  await prisma.sample.deleteMany();
  await prisma.criterionVersion.deleteMany();
  await prisma.studyCriterion.deleteMany();
  await prisma.studyComponent.deleteMany();
  await prisma.auditEvent.deleteMany();
  await prisma.study.deleteMany();
  await prisma.standardSampleDefinition.deleteMany();
  await prisma.stabilityStandard.deleteMany();
  await prisma.testDefinition.deleteMany();
  await prisma.dictionaryEntry.deleteMany();
  await prisma.client.deleteMany();
  await prisma.user.deleteMany();

  const admin = await prisma.user.create({
    data: {
      login: "admin",
      name: "Administrator",
      passwordHash: hashPassword("admin"),
      role: UserRole.ADMIN,
      active: true,
    },
  });

  const technologist = await prisma.user.create({
    data: {
      login: "technolog",
      name: "Technolog Testowy",
      passwordHash: hashPassword("test"),
      role: UserRole.TECHNOLOGIST,
      active: true,
    },
  });

  const lab = await prisma.user.create({
    data: {
      login: "laborant",
      name: "Laborant Testowy",
      passwordHash: hashPassword("test"),
      role: UserRole.LAB_TECHNICIAN,
      active: true,
    },
  });

  const [clientA, clientB] = await Promise.all([
    prisma.client.create({ data: { name: "Klient demonstracyjny A" } }),
    prisma.client.create({ data: { name: "Klient demonstracyjny B" } }),
  ]);

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

  const testMap = new Map<string, string>();
  for (let i = 0; i < definitions.length; i++) {
    const [code, name, category, valueType, unit] = definitions[i];
    const created = await prisma.testDefinition.create({
      data: { code, name, category, valueType, unit, sortOrder: i + 1 },
    });
    testMap.set(code, created.id);
  }

  const dictionaryValues: Record<string, string[]> = {
    appearance: ["Bez zmian", "Jednorodny", "Niejednorodny", "Rozwarstwienie", "Osad"],
    odor: ["Bez zmian", "Charakterystyczny", "Zmieniony", "Obcy"],
    color: ["Bez zmian", "Zgodna ze wzorcem", "Jaśniejsza", "Ciemniejsza", "Zmieniona"],
    spray: ["Prawidłowy", "Strumień", "Mgła", "Niejednorodny", "Przerywany"],
  };
  for (const [category, values] of Object.entries(dictionaryValues)) {
    for (let i = 0; i < values.length; i++) {
      await prisma.dictionaryEntry.create({ data: { category, value: values[i], sortOrder: i + 1 } });
    }
  }

  const microbiology = [
    "Ogólna liczba drobnoustrojów tlenowych",
    "Drożdże i pleśnie",
    "Pseudomonas aeruginosa",
    "Staphylococcus aureus",
    "Candida albicans",
    "Escherichia coli",
  ];
  for (let i = 0; i < microbiology.length; i++) {
    await prisma.dictionaryEntry.create({ data: { category: "microbiology", value: microbiology[i], sortOrder: i + 1 } });
  }

  const standard = await prisma.stabilityStandard.create({
    data: {
      name: "Standard demonstracyjny 6M",
      description: "Jawne offsety dni do testów MVP; zawiera próbki standardowe, mikrobiologiczną i RF/OOS backup.",
      status: StandardStatus.ACTIVE,
      locked: true,
      definitions: {
        create: [
          { code: "R00a", checkpointLabel: "0D", checkpointDays: 0, storageCondition: "RT (20-25°C)", role: SampleRole.STANDARD, sortOrder: 1 },
          { code: "C01a", checkpointLabel: "30D", checkpointDays: 30, storageCondition: "40°C ± 2°C", role: SampleRole.STANDARD, sortOrder: 2 },
          { code: "R03a", checkpointLabel: "90D", checkpointDays: 90, storageCondition: "RT (20-25°C)", role: SampleRole.STANDARD, sortOrder: 3 },
          { code: "R03b", checkpointLabel: "90D", checkpointDays: 90, storageCondition: "RT (20-25°C)", role: SampleRole.MICROBIOLOGY, sortOrder: 4 },
          { code: "C03a", checkpointLabel: "90D", checkpointDays: 90, storageCondition: "40°C ± 2°C", role: SampleRole.STANDARD, sortOrder: 5 },
          { code: "R06a", checkpointLabel: "180D", checkpointDays: 180, storageCondition: "RT (20-25°C)", role: SampleRole.STANDARD, sortOrder: 6 },
          { code: "RRFa", checkpointLabel: "REF", checkpointDays: null, storageCondition: "RT (20-25°C)", role: SampleRole.REFERENCE, sortOrder: 7 },
          { code: "RRFb", checkpointLabel: "REF", checkpointDays: null, storageCondition: "RT (20-25°C)", role: SampleRole.REFERENCE, sortOrder: 8 },
          { code: "CRFa", checkpointLabel: "REF", checkpointDays: null, storageCondition: "40°C ± 2°C", role: SampleRole.REFERENCE, sortOrder: 9 },
        ],
      },
    },
    include: { definitions: true },
  });

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
    await prisma.stabilityStandard.create({
      data: {
        name,
        status: StandardStatus.DRAFT,
        description: "Standard rozpoznany w obecnym workflow. Wymaga przypisania docelowych stałych offsetów dni przed aktywacją.",
      },
    });
  }

  const study = await prisma.study.create({
    data: {
      studyNumber: "ES-2026-0001",
      projectName: "Deodorant Fresh — demo",
      clientId: clientA.id,
      etsNumber: "ETS-DEMO-001",
      productionDate: dateFromNow(-100),
      startDate: dateFromNow(-92),
      responsibleTechnologistId: technologist.id,
      createdById: technologist.id,
      aerosol: true,
      gasType: "LPG",
      gasWeightG: 35,
      fillWeightG: 115,
      totalWeightG: 150,
      volumeMl: 150,
      internalTest: true,
      purpose: "Badanie demonstracyjne procesu eStarzeniowe",
      status: StudyStatus.ACTIVE,
      standardId: standard.id,
      handedToLabAt: dateFromNow(-94),
      components: {
        create: [
          { kind: "Pojemnik", code: "DEMO-POJ", name: "Pojemnik aluminiowy 150 ml", supplier: "Dostawca demo" },
          { kind: "Zawór", code: "DEMO-ZAW", name: "Zawór aerozolowy", supplier: "Dostawca demo" },
        ],
      },
    },
  });

  async function addCriterion(code: string, kind: CriterionKind, versionData: { minValue?: number; maxValue?: number; expectedText?: string; expectedBoolean?: boolean }) {
    const testDefinitionId = testMap.get(code)!;
    const criterion = await prisma.studyCriterion.create({ data: { studyId: study.id, testDefinitionId, kind } });
    const version = await prisma.criterionVersion.create({
      data: { studyCriterionId: criterion.id, version: 1, authorId: technologist.id, ...versionData },
    });
    await prisma.studyCriterion.update({ where: { id: criterion.id }, data: { currentVersionId: version.id } });
    return criterion;
  }

  const criteria = [
    await addCriterion("PH", CriterionKind.RANGE, { minValue: 5.5, maxValue: 6.5 }),
    await addCriterion("DENSITY", CriterionKind.RANGE, { minValue: 0.85, maxValue: 1.05 }),
    await addCriterion("APPEARANCE", CriterionKind.EXPECTED_VALUE, { expectedText: "Bez zmian" }),
    await addCriterion("ODOR", CriterionKind.EXPECTED_VALUE, { expectedText: "Bez zmian" }),
  ];

  for (const def of standard.definitions) {
    const sample = await prisma.sample.create({
      data: {
        studyId: study.id,
        code: def.code,
        role: def.role,
        checkpointLabel: def.checkpointLabel,
        checkpointDays: def.checkpointDays,
        nominalDate: def.checkpointDays === null ? null : new Date(study.startDate.getTime() + def.checkpointDays * DAY),
        storageCondition: def.storageCondition,
        position: def.position,
        referenceStatus: def.role === SampleRole.REFERENCE ? ReferenceStatus.AVAILABLE : null,
        executionStatus: SampleExecutionStatus.NOT_STARTED,
      },
    });

    await prisma.initialMeasurement.create({
      data: { sampleId: sample.id, initialWeightG: 151.8, initialPressureBar: 4.8, recordedById: lab.id, recordedAt: dateFromNow(-94) },
    });

    if (def.role === SampleRole.STANDARD) {
      await prisma.sampleTest.create({ data: { sampleId: sample.id, testDefinitionId: testMap.get("WEIGHT")!, sortOrder: 1 } });
      await prisma.sampleTest.create({ data: { sampleId: sample.id, testDefinitionId: testMap.get("PRESSURE")!, sortOrder: 2 } });
      let sort = 3;
      for (const criterion of criteria) {
        await prisma.sampleTest.create({
          data: { sampleId: sample.id, testDefinitionId: criterion.testDefinitionId, studyCriterionId: criterion.id, sortOrder: sort++ },
        });
      }
    }
  }

  const r00 = await prisma.sample.findUnique({ where: { studyId_code: { studyId: study.id, code: "R00a" } }, include: { tests: { include: { testDefinition: true } } } });
  if (r00) {
    for (const sampleTest of r00.tests) {
      let numericValue: number | undefined;
      let textValue: string | undefined;
      let evaluation = Evaluation.NOT_APPLICABLE;
      if (sampleTest.testDefinition.code === "WEIGHT") numericValue = 150.9;
      if (sampleTest.testDefinition.code === "PRESSURE") numericValue = 4.65;
      if (sampleTest.testDefinition.code === "PH") { numericValue = 5.2; evaluation = Evaluation.NOK; }
      if (sampleTest.testDefinition.code === "DENSITY") { numericValue = 0.94; evaluation = Evaluation.OK; }
      if (sampleTest.testDefinition.code === "APPEARANCE") { textValue = "Bez zmian"; evaluation = Evaluation.OK; }
      if (sampleTest.testDefinition.code === "ODOR") { textValue = "Bez zmian"; evaluation = Evaluation.OK; }
      await prisma.testResult.create({
        data: {
          sampleTestId: sampleTest.id,
          state: ResultState.RECORDED,
          numericValue,
          textValue,
          evaluationAtEntry: evaluation,
          currentEvaluation: evaluation,
          authorId: lab.id,
        },
      });
    }
    await prisma.sample.update({ where: { id: r00.id }, data: { executionStatus: SampleExecutionStatus.COMPLETED, completedAt: dateFromNow(-91) } });
  }

  await prisma.auditEvent.createMany({
    data: [
      { studyId: study.id, authorId: technologist.id, type: "STUDY_CREATED", message: "Utworzono demonstracyjne zlecenie testów." },
      { studyId: study.id, authorId: technologist.id, type: "HANDED_TO_LAB", message: "Przekazano badanie do Laboratorium i wygenerowano próbki." },
      { studyId: study.id, authorId: lab.id, type: "NOK_RECORDED", message: "R00a · pH = 5,2 · NOK" },
    ],
  });

  await prisma.study.create({
    data: {
      studyNumber: "ES-2026-0002",
      projectName: "Pianka pielęgnacyjna — robocze",
      clientId: clientB.id,
      productionDate: dateFromNow(-2),
      startDate: dateFromNow(7),
      responsibleTechnologistId: technologist.id,
      createdById: admin.id,
      aerosol: false,
      volumeMl: 200,
      internalTest: false,
      purpose: "Test klientowski",
      status: StudyStatus.DRAFT,
    },
  });

  console.log("Seed zakończony. Konta testowe: admin/admin, technolog/test, laborant/test");
}

main().finally(async () => prisma.$disconnect());
