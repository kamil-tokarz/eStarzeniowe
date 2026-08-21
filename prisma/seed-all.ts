import { execFileSync } from "node:child_process";

const runner = process.platform === "win32" ? "npx.cmd" : "npx";
const stages = ["prisma/seed.ts", "prisma/seed-extra.ts", "prisma/seed-standards.ts"];

for (const stage of stages) {
  console.log(`\n▶ Seed stage: ${stage}`);
  execFileSync(runner, ["tsx", stage], {
    stdio: "inherit",
    env: process.env,
  });
}

console.log("\n✓ Pełny seed eStarzeniowe zakończony.");
