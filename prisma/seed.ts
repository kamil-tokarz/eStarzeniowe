import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, UserRole } from "../generated/prisma/client";
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

  console.log("Seed bazowy: konta i klienci gotowi, 0 zleceń demonstracyjnych.");
}

main().finally(async () => prisma.$disconnect());
