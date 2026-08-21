import { NextRequest, NextResponse } from "next/server";
import { SampleRole, StandardStatus, UserRole } from "@/generated/prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { publicUrl } from "@/lib/request-origin";

function back(request: NextRequest, params?: Record<string, string>) {
  const url = publicUrl(request, "/admin#standards");
  for (const [key, value] of Object.entries(params ?? {})) url.searchParams.set(key, value);
  return NextResponse.redirect(url, 303);
}

function intOrNull(value: FormDataEntryValue | null) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : Number.NaN;
}

async function editableStandard(id: string) {
  return prisma.stabilityStandard.findUnique({
    where: { id },
    include: { _count: { select: { studies: true, definitions: true } } },
  });
}

export async function POST(request: NextRequest) {
  const admin = await getCurrentUser();
  if (!admin || admin.role !== UserRole.ADMIN) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "create");

  if (intent === "create") {
    const name = String(form.get("name") ?? "").trim();
    const description = String(form.get("description") ?? "").trim() || null;
    if (!name) return back(request, { adminError: "invalid-standard" });
    try {
      await prisma.stabilityStandard.create({ data: { name, description, status: StandardStatus.DRAFT, locked: false } });
    } catch {
      return back(request, { adminError: "duplicate-standard" });
    }
    return back(request, { adminOk: "standard-created" });
  }

  const standardId = String(form.get("standardId") ?? "");
  const standard = await editableStandard(standardId);
  if (!standard) return back(request, { adminError: "standard-not-found" });

  if (intent === "update") {
    if (standard.locked || standard._count.studies > 0 || standard.status === StandardStatus.WITHDRAWN) return back(request, { adminError: "standard-locked" });
    const name = String(form.get("name") ?? "").trim();
    const description = String(form.get("description") ?? "").trim() || null;
    if (!name) return back(request, { adminError: "invalid-standard" });
    try {
      await prisma.stabilityStandard.update({ where: { id: standardId }, data: { name, description } });
    } catch {
      return back(request, { adminError: "duplicate-standard" });
    }
    return back(request, { adminOk: "standard-updated" });
  }

  if (intent === "add-definition") {
    if (standard.locked || standard._count.studies > 0 || standard.status === StandardStatus.WITHDRAWN) return back(request, { adminError: "standard-locked" });
    const code = String(form.get("code") ?? "").trim();
    const checkpointLabel = String(form.get("checkpointLabel") ?? "").trim() || null;
    const checkpointDays = intOrNull(form.get("checkpointDays"));
    const storageCondition = String(form.get("storageCondition") ?? "").trim();
    const position = String(form.get("position") ?? "").trim() || null;
    const role = String(form.get("role") ?? "") as SampleRole;
    const quantityRaw = Number(String(form.get("quantity") ?? "1"));
    const quantity = Number.isInteger(quantityRaw) && quantityRaw > 0 ? quantityRaw : 1;
    if (!code || !storageCondition || !Object.values(SampleRole).includes(role) || Number.isNaN(checkpointDays)) return back(request, { adminError: "invalid-definition" });
    if (role !== SampleRole.REFERENCE && checkpointDays === null) return back(request, { adminError: "missing-days" });
    const last = await prisma.standardSampleDefinition.findFirst({ where: { standardId }, orderBy: { sortOrder: "desc" } });
    try {
      await prisma.standardSampleDefinition.create({
        data: { standardId, code, checkpointLabel, checkpointDays: role === SampleRole.REFERENCE ? null : checkpointDays, storageCondition, position, role, quantity, sortOrder: (last?.sortOrder ?? 0) + 1 },
      });
    } catch {
      return back(request, { adminError: "duplicate-definition" });
    }
    return back(request, { adminOk: "definition-created" });
  }

  if (intent === "remove-definition") {
    if (standard.locked || standard._count.studies > 0 || standard.status === StandardStatus.WITHDRAWN) return back(request, { adminError: "standard-locked" });
    const definitionId = String(form.get("definitionId") ?? "");
    await prisma.standardSampleDefinition.deleteMany({ where: { id: definitionId, standardId } });
    return back(request, { adminOk: "definition-removed" });
  }

  if (intent === "activate") {
    if (standard.status !== StandardStatus.DRAFT || standard._count.definitions === 0) return back(request, { adminError: "cannot-activate" });
    await prisma.stabilityStandard.update({ where: { id: standardId }, data: { status: StandardStatus.ACTIVE } });
    return back(request, { adminOk: "standard-activated" });
  }

  if (intent === "withdraw") {
    if (standard.status !== StandardStatus.ACTIVE) return back(request, { adminError: "cannot-withdraw" });
    await prisma.stabilityStandard.update({ where: { id: standardId }, data: { status: StandardStatus.WITHDRAWN, locked: true } });
    return back(request, { adminOk: "standard-withdrawn" });
  }

  return back(request, { adminError: "unknown-action" });
}
