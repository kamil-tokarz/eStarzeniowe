import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";

const uploadRoot = process.env.UPLOAD_DIR ?? path.join(process.cwd(), "data", "uploads");
const MAX_REPORT_SIZE = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Map([
  ["application/pdf", ".pdf"],
  ["image/png", ".png"],
  ["image/jpeg", ".jpg"],
]);

export async function saveReportFile(file: File, sampleId: string) {
  if (!ALLOWED_TYPES.has(file.type)) throw new Error("Raport musi być plikiem PDF, PNG albo JPG.");
  if (file.size > MAX_REPORT_SIZE) throw new Error("Raport może mieć maksymalnie 10 MB.");

  await mkdir(uploadRoot, { recursive: true });
  const ext = ALLOWED_TYPES.get(file.type)!;
  const storageName = `${sampleId}-${Date.now()}-${randomBytes(6).toString("hex")}${ext}`;
  const absolutePath = path.join(uploadRoot, storageName);
  const bytes = Buffer.from(await file.arrayBuffer());
  await writeFile(/* turbopackIgnore: true */ absolutePath, bytes);
  return { storageName, originalName: file.name || `raport${ext}`, mimeType: file.type };
}

export async function readReportFile(storageName: string) {
  const safeName = path.basename(storageName);
  if (safeName !== storageName) throw new Error("Nieprawidłowa ścieżka pliku.");
  const absolutePath = path.join(uploadRoot, safeName);
  return readFile(/* turbopackIgnore: true */ absolutePath);
}

export async function deleteReportFile(storageName: string | null | undefined) {
  if (!storageName) return;
  const safeName = path.basename(storageName);
  if (safeName !== storageName) return;
  try {
    const absolutePath = path.join(uploadRoot, safeName);
    await unlink(/* turbopackIgnore: true */ absolutePath);
  } catch {
    // Plik mógł już zostać usunięty; rekord bazy pozostaje źródłem prawdy.
  }
}
