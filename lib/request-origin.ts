import type { NextRequest } from "next/server";

export function publicOrigin(request: NextRequest) {
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || request.headers.get("host") || request.nextUrl.host;
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const proto = forwardedProto || request.nextUrl.protocol.replace(":", "") || "http";
  return `${proto}://${host}`;
}

export function publicUrl(request: NextRequest, path: string) {
  return new URL(path, publicOrigin(request));
}
