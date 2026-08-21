import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const COOKIE_NAME = process.env.SESSION_COOKIE_NAME ?? "estarzeniowe_session";

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function externalUrl(request: NextRequest, path: string) {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? request.nextUrl.host;
  const proto = request.headers.get("x-forwarded-proto") ?? request.nextUrl.protocol.replace(":", "") ?? "http";
  return new URL(path, `${proto}://${host}`);
}

export async function POST(request: NextRequest) {
  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (token) {
    await prisma.session.deleteMany({ where: { tokenHash: tokenHash(token) } });
  }

  const response = NextResponse.redirect(externalUrl(request, "/login"), 303);
  response.cookies.delete(COOKIE_NAME);
  return response;
}
