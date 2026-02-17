"use client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function ChartTooltip({ active, payload, formatter }: { active?: boolean; payload?: any[]; formatter: (entry: any) => string }) {
  if (!active || !payload?.length) return null;
  const data = payload[0]?.payload;
  const dateStr = data?.date;

  function formatDate(d: string) {
    const [y, m, day] = d.split("-");
    return `${m}/${day}/${y}`;
  }

  return (
    <div className="bg-background border rounded-lg shadow-lg px-3 py-2 text-sm">
      {dateStr && (
        <p className="font-semibold text-foreground mb-1">
          {formatDate(dateStr)}
        </p>
      )}
      {payload.map((entry: any, i: number) => (
        <p key={i} style={{ color: entry.color || entry.stroke }}>
          {formatter(entry)}
        </p>
      ))}
    </div>
  );
}
