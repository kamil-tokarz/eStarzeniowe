import { createHash, randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/password";

const COOKIE_NAME = process.env.SESSION_COOKIE_NAME ?? "estarzeniowe_session";
const TTL_DAYS = Number(process.env.SESSION_TTL_DAYS ?? 14);

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function externalUrl(request: NextRequest, path: string) {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? request.nextUrl.host;
  const proto = request.headers.get("x-forwarded-proto") ?? request.nextUrl.protocol.replace(":", "") ?? "http";
  return new URL(path, `${proto}://${host}`);
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const login = String(formData.get("login") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!login || !password) {
    return NextResponse.redirect(externalUrl(request, "/login?error=missing"), 303);
  }

  const user = await prisma.user.findUnique({ where: { login } });
  if (!user || !user.active || !verifyPassword(password, user.passwordHash)) {
    return NextResponse.redirect(externalUrl(request, "/login?error=invalid"), 303);
  }

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + TTL_DAYS * 24 * 60 * 60 * 1000);
  await prisma.session.create({
    data: { userId: user.id, tokenHash: tokenHash(token), expiresAt },
  });

  const proto = request.headers.get("x-forwarded-proto") ?? request.nextUrl.protocol.replace(":", "");
  const response = NextResponse.redirect(externalUrl(request, "/"), 303);
  response.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: proto === "https" || process.env.APP_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
  return response;
}
