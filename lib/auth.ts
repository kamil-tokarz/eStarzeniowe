import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

const COOKIE_NAME = process.env.SESSION_COOKIE_NAME ?? "estarzeniowe_session";

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function getCurrentUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: tokenHash(token) },
    include: { user: true },
  });

  // Server Components mogą odczytywać cookies, ale nie mogą ich modyfikować.
  // Wygasłe/nieaktywne sesje są więc traktowane jak brak sesji; fizyczne
  // usunięcie cookie odbywa się wyłącznie w Route Handlerze /api/auth/logout.
  if (!session || session.expiresAt <= new Date() || !session.user.active) {
    return null;
  }

  return session.user;
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}
