import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export function hashPassword(password: string, salt = randomBytes(16).toString("hex")) {
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string) {
  const [salt, hashHex] = stored.split(":");
  if (!salt || !hashHex) return false;
  const candidate = scryptSync(password, salt, 64);
  const storedHash = Buffer.from(hashHex, "hex");
  return candidate.length === storedHash.length && timingSafeEqual(candidate, storedHash);
}
