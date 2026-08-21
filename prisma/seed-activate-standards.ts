import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, StandardStatus } from "../generated/prisma/client";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required for standards activation seed");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

const names = [
  "Produkty wrażliwe mikrobiologicznie",
  "Filtry UV",
  "Wyroby medyczne",
  "Produkty niewrażliwe mikrobiologicznie",
  "Standard WD-40_3M",
  "Standard WD-40_60M",
  "Standardowe 3M",
];

async function main() {
  await prisma.stabilityStandard.updateMany({
    where: { name: { in: names }, status: StandardStatus.DRAFT },
    data: { status: StandardStatus.ACTIVE, locked: true },
  });

  const active = await prisma.stabilityStandard.count({
    where: { name: { in: names }, status: StandardStatus.ACTIVE },
  });
  if (active !== names.length) throw new Error(`Oczekiwano ${names.length} aktywnych standardów BPM, jest ${active}.`);
  console.log("Seed standardów: 7 standardów BPM aktywnych i dostępnych w formularzu.");
}

main().finally(() => prisma.$disconnect());
