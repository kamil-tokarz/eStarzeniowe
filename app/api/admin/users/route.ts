import { NextRequest, NextResponse } from "next/server";
import { UserRole } from "@/generated/prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { hashPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import { publicUrl } from "@/lib/request-origin";

function back(request: NextRequest, params?: Record<string, string>) {
  const url = publicUrl(request, "/admin#users");
  for (const [key, value] of Object.entries(params ?? {})) url.searchParams.set(key, value);
  return NextResponse.redirect(url, 303);
}

export async function POST(request: NextRequest) {
  const admin = await getCurrentUser();
  if (!admin || admin.role !== UserRole.ADMIN) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const form = await request.formData();
  const intent = String(form.get("intent") ?? "create");

  if (intent === "create") {
    const login = String(form.get("login") ?? "").trim().toLowerCase();
    const name = String(form.get("name") ?? "").trim();
    const password = String(form.get("password") ?? "");
    const role = String(form.get("role") ?? "") as UserRole;
    if (!login || !name || password.length < 8 || !Object.values(UserRole).includes(role)) return back(request, { adminError: "invalid-user" });
    try {
      await prisma.user.create({ data: { login, name, passwordHash: hashPassword(password), role, active: true, mustChangePassword: true } });
    } catch {
      return back(request, { adminError: "duplicate-user" });
    }
    return back(request, { adminOk: "user-created" });
  }

  const userId = String(form.get("userId") ?? "");
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return back(request, { adminError: "user-not-found" });

  if (intent === "toggle") {
    if (user.id === admin.id && user.active) return back(request, { adminError: "self-disable" });
    await prisma.user.update({ where: { id: user.id }, data: { active: !user.active } });
    if (user.active) await prisma.session.deleteMany({ where: { userId: user.id } });
    return back(request, { adminOk: "user-updated" });
  }

  if (intent === "reset-password") {
    const password = String(form.get("password") ?? "");
    if (password.length < 8) return back(request, { adminError: "short-password" });
    await prisma.$transaction([
      prisma.user.update({ where: { id: user.id }, data: { passwordHash: hashPassword(password), mustChangePassword: true } }),
      prisma.session.deleteMany({ where: { userId: user.id } }),
    ]);
    return back(request, { adminOk: "password-reset" });
  }

  return back(request, { adminError: "unknown-action" });
}
