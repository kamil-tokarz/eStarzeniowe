import { NextRequest, NextResponse } from "next/server";
import path from "node:path";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { readReportFile } from "@/lib/storage";

const mimeByExtension: Record<string, string> = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
};

export async function GET(_request: NextRequest, { params }: { params: Promise<{ sampleId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Brak autoryzacji." }, { status: 401 });

  const { sampleId } = await params;
  const result = await prisma.microbiologyResult.findUnique({ where: { sampleId } });
  if (!result?.reportPath) return NextResponse.json({ error: "Brak załączonego raportu." }, { status: 404 });

  try {
    const bytes = await readReportFile(result.reportPath);
    const extension = path.extname(result.reportPath).toLowerCase();
    const fileName = result.reportName || `raport-mikrobiologii${extension || ".pdf"}`;
    return new NextResponse(bytes, {
      headers: {
        "Content-Type": mimeByExtension[extension] || "application/octet-stream",
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "Plik raportu nie jest dostępny." }, { status: 404 });
  }
}
