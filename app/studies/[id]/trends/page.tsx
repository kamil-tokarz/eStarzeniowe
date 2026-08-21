import Link from "next/link";
import { notFound } from "next/navigation";
import { TestValueType } from "@/generated/prisma/client";
import { AppShell } from "@/components/app-shell";
import { StudyTrends } from "@/components/study-trends";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function StudyTrendsPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const study = await prisma.study.findUnique({
    where: { id },
    include: {
      client: true,
      samples: {
        where: { checkpointDays: { not: null } },
        include: {
          initialMeasurement: true,
          tests: { include: { testDefinition: true, result: true } },
        },
      },
    },
  });
  if (!study) notFound();

  const points = study.samples.flatMap((sample) => sample.tests.flatMap((test) => {
    if (test.testDefinition.valueType !== TestValueType.NUMBER || test.result?.numericValue == null || sample.checkpointDays == null) return [];
    let parameter = test.testDefinition.name;
    let value = test.result.numericValue;
    let unit = test.testDefinition.unit;
    if (test.testDefinition.code === "WEIGHT") {
      if (sample.initialMeasurement?.initialWeightG == null) return [];
      parameter = "Zmiana wagi";
      value -= sample.initialMeasurement.initialWeightG;
      unit = "g";
    } else if (test.testDefinition.code === "PRESSURE") {
      if (sample.initialMeasurement?.initialPressureBar == null) return [];
      parameter = "Zmiana ciśnienia";
      value -= sample.initialMeasurement.initialPressureBar;
      unit = "bar";
    }
    return [{
      parameter,
      unit,
      condition: [sample.storageCondition, sample.position].filter(Boolean).join(" · "),
      checkpoint: sample.checkpointLabel || `+${sample.checkpointDays}D`,
      days: sample.checkpointDays,
      value,
    }];
  }));

  return <AppShell user={user} active="studies">
    <div className="topline">
      <div><div className="eyebrow">{study.studyNumber} · {study.client.name}</div><h1>Trendy</h1><div className="subtle">{study.projectName} · wyniki liczbowe w kolejnych checkpointach i warunkach przechowywania.</div></div>
      <div className="top-actions"><Link href={`/studies/${study.id}`} className="btn btn-secondary">← Karta badania</Link></div>
    </div>
    <div className="study-tabs"><Link href={`/studies/${study.id}`}>Podsumowanie</Link><Link href={`/studies/${study.id}#results`}>Wyniki</Link><Link className="active" href={`/studies/${study.id}/trends`}>Trendy</Link><Link href={`/studies/${study.id}#samples`}>Próbki</Link><Link href={`/studies/${study.id}#criteria`}>Kryteria</Link><Link href={`/studies/${study.id}#history`}>Historia</Link></div>
    <section className="section"><div className="section-head"><div><div className="eyebrow">Analiza przebiegu</div><div className="section-title">Parametry w czasie</div><div className="subtle">Waga i ciśnienie pokazują zmianę względem wartości bazowej tej samej próbki. Pozostałe parametry pokazują zapisany wynik rzeczywisty.</div></div></div><StudyTrends points={points} /></section>
  </AppShell>;
}
