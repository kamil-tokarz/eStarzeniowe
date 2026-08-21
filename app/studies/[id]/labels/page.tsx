import Link from "next/link";
import { notFound } from "next/navigation";
import { SampleRole } from "@/generated/prisma/client";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PrintButton } from "@/components/print-button";

const roleLabel: Record<SampleRole, string> = {
  STANDARD: "Próbka stabilności",
  MICROBIOLOGY: "Mikrobiologia",
  REFERENCE: "Próbka referencyjna RF/OOS",
};

function chunks<T>(items: T[], size: number) {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) result.push(items.slice(i, i + size));
  return result;
}

export default async function LabelsPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const study = await prisma.study.findUnique({
    where: { id },
    include: {
      client: true,
      samples: { orderBy: [{ role: "asc" }, { nominalDate: "asc" }, { code: "asc" }] },
    },
  });
  if (!study) notFound();

  const sheets = chunks(study.samples, 40);

  return (
    <main className="labels-root">
      <div className="labels-toolbar">
        <div>
          <strong>Etykiety próbek · {study.studyNumber}</strong>
          <span>{study.samples.length} etykiet · A4 · 4 × 10 · 52,5 × 29,7 mm</span>
        </div>
        <div className="labels-toolbar-actions">
          <Link href={`/studies/${study.id}`}>← Wróć do badania</Link>
          <PrintButton />
        </div>
      </div>

      {sheets.length === 0 ? (
        <div className="labels-empty">Próbki nie zostały jeszcze wygenerowane. Etykiety będą dostępne po przekazaniu zlecenia do Laboratorium.</div>
      ) : sheets.map((sheet, sheetIndex) => (
        <section className="label-sheet" key={sheetIndex} aria-label={`Arkusz ${sheetIndex + 1}`}>
          {sheet.map((sample) => (
            <article className="sample-label" key={sample.id}>
              <div className="label-topline">
                <div className="jagopro-wordmark">jago<span>PRO</span></div>
                <strong className="label-code">{sample.code}</strong>
              </div>
              <div className="label-project">{study.projectName}</div>
              <div className="label-meta"><strong>{study.studyNumber}</strong><span>·</span><span>{study.client.name}</span></div>
              <div className="label-detail">
                <span>{sample.checkpointLabel || roleLabel[sample.role]}</span>
                <span>{sample.storageCondition}</span>
              </div>
            </article>
          ))}
        </section>
      ))}

      <style>{`
        .labels-root { min-height: 100vh; background: #eef1f3; color: #171c26; font-family: Inter, Arial, sans-serif; }
        .labels-toolbar { max-width: 1180px; margin: 0 auto; padding: 20px 24px; display: flex; align-items: center; justify-content: space-between; gap: 24px; }
        .labels-toolbar > div:first-child { display: grid; gap: 3px; }
        .labels-toolbar span { color: #6d7480; font-size: 12px; }
        .labels-toolbar-actions { display: flex; align-items: center; gap: 14px; font-size: 13px; }
        .labels-print-button { border: 0; border-radius: 9px; padding: 10px 14px; background: #008c8d; color: white; font-weight: 750; cursor: pointer; }
        .labels-empty { max-width: 900px; margin: 50px auto; padding: 30px; background: white; border-radius: 14px; text-align: center; }
        .label-sheet { width: 210mm; height: 297mm; margin: 0 auto 18px; background: white; display: grid; grid-template-columns: repeat(4, 52.5mm); grid-template-rows: repeat(10, 29.7mm); overflow: hidden; box-shadow: 0 12px 35px rgba(0,0,0,.08); }
        .sample-label { width: 52.5mm; height: 29.7mm; padding: 2.1mm 2.4mm 1.7mm; border-right: .15mm solid #d9dde1; border-bottom: .15mm solid #d9dde1; overflow: hidden; display: flex; flex-direction: column; gap: .8mm; }
        .label-topline { display: flex; align-items: center; justify-content: space-between; gap: 2mm; min-width: 0; }
        .jagopro-wordmark { font-weight: 900; font-size: 8pt; letter-spacing: -.05em; white-space: nowrap; }
        .jagopro-wordmark span { color: #008c8d; }
        .label-code { font-size: 10pt; letter-spacing: -.03em; white-space: nowrap; }
        .label-project { font-size: 7pt; line-height: 1.15; font-weight: 760; overflow-wrap: anywhere; max-height: 6.2mm; overflow: hidden; }
        .label-meta { display: flex; gap: 1mm; min-width: 0; font-size: 5.7pt; line-height: 1.15; color: #545b65; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .label-meta span:last-child { overflow: hidden; text-overflow: ellipsis; }
        .label-detail { margin-top: auto; border-top: .2mm solid #008c8d; padding-top: .8mm; display: grid; grid-template-columns: minmax(0, .85fr) minmax(0, 1.15fr); gap: 1.5mm; font-size: 5.5pt; line-height: 1.1; color: #343b44; }
        .label-detail span { overflow-wrap: anywhere; }
        @page { size: A4 portrait; margin: 0; }
        @media print {
          html, body { margin: 0 !important; padding: 0 !important; background: white !important; }
          .labels-root { background: white; }
          .labels-toolbar, .labels-empty { display: none !important; }
          .label-sheet { margin: 0; box-shadow: none; break-after: page; page-break-after: always; }
          .label-sheet:last-child { break-after: auto; page-break-after: auto; }
        }
      `}</style>
    </main>
  );
}
