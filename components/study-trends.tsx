"use client";

import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type TrendPoint = {
  parameter: string;
  unit: string | null;
  condition: string;
  checkpoint: string;
  days: number;
  value: number;
};

const lineColors = ["#008c8d", "#485462", "#e89a21", "#6c63a8", "#477f51", "#ad5c5c"];

export function StudyTrends({ points }: { points: TrendPoint[] }) {
  const parameters = [...new Set(points.map((point) => point.parameter))];
  if (!parameters.length) return <div className="empty-state"><strong>Brak danych liczbowych do wykresów</strong><span>Trendy pojawią się po zapisaniu wyników kolejnych checkpointów.</span></div>;

  return <div className="trend-grid">
    {parameters.map((parameter) => {
      const parameterPoints = points.filter((point) => point.parameter === parameter);
      const unit = parameterPoints[0]?.unit;
      const conditions = [...new Set(parameterPoints.map((point) => point.condition))];
      const days = [...new Set(parameterPoints.map((point) => point.days))].sort((a, b) => a - b);
      const data = days.map((day) => {
        const row: Record<string, number | string> = { day, checkpoint: parameterPoints.find((point) => point.days === day)?.checkpoint ?? `D${day}` };
        for (const condition of conditions) {
          const matches = parameterPoints.filter((point) => point.days === day && point.condition === condition);
          if (matches.length) row[condition] = matches.reduce((sum, point) => sum + point.value, 0) / matches.length;
        }
        return row;
      });

      return <article className="trend-card" key={parameter}>
        <div className="trend-card-head"><div><span>Trend</span><strong>{parameter}</strong></div><small>{unit || "wartość"}</small></div>
        <div className="trend-chart">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 12, left: -14, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#edf0f2" />
              <XAxis dataKey="checkpoint" tick={{ fontSize: 10, fill: "#737b86" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "#737b86" }} axisLine={false} tickLine={false} width={55} />
              <Tooltip contentStyle={{ border: "1px solid #e8ebef", borderRadius: 10, boxShadow: "0 12px 28px rgba(23,28,38,.08)", fontSize: 12 }} />
              {conditions.length > 1 && <Legend wrapperStyle={{ fontSize: 10 }} />}
              {conditions.map((condition, index) => <Line key={condition} type="monotone" dataKey={condition} name={condition} stroke={lineColors[index % lineColors.length]} strokeWidth={2.2} dot={{ r: 3 }} connectNulls />)}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </article>;
    })}
  </div>;
}
