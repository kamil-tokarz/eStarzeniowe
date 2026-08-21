import { prisma } from "@/lib/prisma";

export async function getStudyExportData(id: string) {
  return prisma.study.findUnique({
    where: { id },
    include: {
      client: true,
      responsibleTechnologist: true,
      standard: true,
      components: true,
      criteria: {
        include: {
          testDefinition: true,
          currentVersion: true,
        },
        orderBy: { testDefinition: { sortOrder: "asc" } },
      },
      samples: {
        orderBy: [{ nominalDate: "asc" }, { code: "asc" }],
        include: {
          initialMeasurement: true,
          microbiologyResult: true,
          tests: {
            orderBy: { sortOrder: "asc" },
            include: {
              testDefinition: true,
              studyCriterion: { include: { currentVersion: true } },
              result: { include: { author: true } },
            },
          },
        },
      },
      auditEvents: { orderBy: { createdAt: "asc" }, include: { author: true } },
    },
  });
}

export function criterionValue(version: { minValue: number | null; maxValue: number | null; expectedText: string | null; expectedBoolean: boolean | null } | null) {
  if (!version) return "—";
  if (version.minValue != null || version.maxValue != null) return `${version.minValue ?? "−∞"} – ${version.maxValue ?? "+∞"}`;
  if (version.expectedText != null) return version.expectedText;
  if (version.expectedBoolean != null) return version.expectedBoolean ? "TAK" : "NIE";
  return "—";
}

export function resultValue(result: { state: string; numericValue: number | null; textValue: string | null; booleanValue: boolean | null; notPerformedReason: string | null } | null) {
  if (!result) return "";
  if (result.state === "NOT_PERFORMED") return `Nie wykonano: ${result.notPerformedReason || "brak powodu"}`;
  if (result.numericValue != null) return result.numericValue;
  if (result.textValue != null) return result.textValue;
  if (result.booleanValue != null) return result.booleanValue ? "TAK" : "NIE";
  return "";
}
