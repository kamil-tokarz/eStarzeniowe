import { NextRequest, NextResponse } from "next/server";
import { UserRole } from "@/generated/prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { publicUrl } from "@/lib/request-origin";

function back(request: NextRequest, params?: Record<string, string>) {
  const url = publicUrl(request, "/admin#clients");
  for (const [key, value] of Object.entries(params ?? {})) url.searchParams.set(key, value);
  return NextResponse.redirect(url, 303);
}

export async function POST(request: NextRequest) {
  const admin = await getCurrentUser();
  if (!admin || admin.role !== UserRole.ADMIN) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "create");

  if (intent === "create") {
    const name = String(form.get("name") ?? "").trim();
    if (!name) return back(request, { adminError: "invalid-client" });
    try {
      await prisma.client.create({ data: { name, active: true } });
    } catch {
      return back(request, { adminError: "duplicate-client" });
    }
    return back(request, { adminOk: "client-created" });
  }

  if (intent === "toggle") {
    const id = String(form.get("clientId") ?? "");
    const client = await prisma.client.findUnique({ where: { id } });
    if (!client) return back(request, { adminError: "client-not-found" });
    await prisma.client.update({ where: { id }, data: { active: !client.active } });
    return back(request, { adminOk: "client-updated" });
  }

  return back(request, { adminError: "unknown-action" });
}
