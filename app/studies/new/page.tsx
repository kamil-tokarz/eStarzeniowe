import { redirect } from "next/navigation";
import { StandardStatus, UserRole } from "@/generated/prisma/client";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/app-shell";
import { StudyForm } from "@/components/study-form";

const criterionDictionaryCategories = ["appearance", "odor", "color", "spray", "crimp_width_setup", "crimp_height_setup", "microbiology", "component_kind"];

export default async function NewStudyPage() {
  const user = await requireUser();
  if (user.role !== UserRole.TECHNOLOGIST && user.role !== UserRole.ADMIN) redirect("/studies");

  const [clients, technologists, standards, dictionaries] = await Promise.all([
    prisma.client.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.user.findMany({ where: { active: true, role: UserRole.TECHNOLOGIST }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.stabilityStandard.findMany({ where: { status: StandardStatus.ACTIVE }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.dictionaryEntry.findMany({ where: { category: { in: criterionDictionaryCategories }, active: true }, orderBy: [{ category: "asc" }, { sortOrder: "asc" }] }),
  ]);

  const dictionaryValues: Record<string, string[]> = {};
  for (const entry of dictionaries) {
    (dictionaryValues[entry.category] ??= []).push(entry.value);
  }
  const microbiologyValues = dictionaryValues.microbiology ?? [];
  const componentKinds = dictionaryValues.component_kind ?? [];

  const today = new Date().toISOString().slice(0, 10);

  return (
    <AppShell user={user} active="studies">
      <div className="form-page-header">
        <div>
          <div className="eyebrow">Nowe zlecenie</div>
          <h1>Rozpocznij badanie</h1>
          <div className="subtle">Jedna strona, tylko informacje potrzebne do uruchomienia testów.</div>
        </div>
      </div>
      <StudyForm
        clients={clients}
        technologists={technologists}
        standards={standards}
        dictionaryValues={dictionaryValues}
        microbiologyValues={microbiologyValues}
        componentKinds={componentKinds}
        defaultTechnologistId={user.role === UserRole.TECHNOLOGIST ? user.id : technologists[0]?.id ?? ""}
        today={today}
      />
    </AppShell>
  );
}
