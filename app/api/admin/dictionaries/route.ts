import { NextRequest, NextResponse } from "next/server";
import { UserRole } from "@/generated/prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { publicUrl } from "@/lib/request-origin";

function back(request: NextRequest, params?: Record<string, string>) {
  const url = publicUrl(request, "/admin#dictionaries");
  for (const [key, value] of Object.entries(params ?? {})) url.searchParams.set(key, value);
  return NextResponse.redirect(url, 303);
}

export async function POST(request: NextRequest) {
  const admin = await getCurrentUser();
  if (!admin || admin.role !== UserRole.ADMIN) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "create");

  if (intent === "create") {
    const category = String(form.get("category") ?? "").trim().toLowerCase();
    const value = String(form.get("value") ?? "").trim();
    if (!category || !value) return back(request, { adminError: "invalid-dictionary" });
    const last = await prisma.dictionaryEntry.findFirst({ where: { category }, orderBy: { sortOrder: "desc" } });
    try {
      await prisma.dictionaryEntry.create({ data: { category, value, active: true, sortOrder: (last?.sortOrder ?? 0) + 1 } });
    } catch {
      return back(request, { adminError: "duplicate-dictionary" });
    }
    return back(request, { adminOk: "dictionary-created" });
  }

  if (intent === "toggle") {
    const id = String(form.get("entryId") ?? "");
    const entry = await prisma.dictionaryEntry.findUnique({ where: { id } });
    if (!entry) return back(request, { adminError: "dictionary-not-found" });
    await prisma.dictionaryEntry.update({ where: { id }, data: { active: !entry.active } });
    return back(request, { adminOk: "dictionary-updated" });
  }

  return back(request, { adminError: "unknown-action" });
}
