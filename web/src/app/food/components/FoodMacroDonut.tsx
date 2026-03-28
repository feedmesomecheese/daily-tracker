// Lightweight SVG macro donut — no Recharts dependency
// Segments: Protein (green) → Carbs (amber) → Fat (blue), starting at 12 o'clock

interface Props {
  protein: number;
  carbs: number;
  fat: number;
  size?: number;
}

export function FoodMacroDonut({ protein, carbs, fat, size = 24 }: Props) {
  const pCal = protein * 4;
  const cCal = carbs * 4;
  const fCal = fat * 9;
  const total = pCal + cCal + fCal;

  if (total === 0) return <div style={{ width: size, height: size }} className="shrink-0" />;

  const r = size * 0.36;
  const cx = size / 2;
  const cy = size / 2;
  const circ = 2 * Math.PI * r;
  const strokeW = size * 0.24;

  const segs = [
    { f: pCal / total, color: "#22c55e" },
    { f: cCal / total, color: "#f59e0b" },
    { f: fCal / total, color: "#60a5fa" },
  ];

  let cum = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
      {segs.map((seg, i) => {
        const dash = seg.f * circ;
        const gap = circ - dash;
        // stroke-dashoffset: positive = shift start backward along the path
        // circ * 0.25 puts start at 12 o'clock (path starts at 3 o'clock by default)
        // subtract each prior segment's arc length to advance the start
        const offset = circ * 0.25 - cum * circ;
        cum += seg.f;
        if (dash < 0.5) return null;
        return (
          <circle
            key={i}
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke={seg.color}
            strokeWidth={strokeW}
            strokeDasharray={`${dash} ${gap}`}
            strokeDashoffset={offset}
          />
        );
      })}
    </svg>
  );
}
