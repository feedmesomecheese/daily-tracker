"use client";

// A polyline that draws itself left→right, holds, then fades and resets.
export function DailyTrackerLoader() {
  return (
    <svg
      viewBox="0 0 120 60"
      width="120"
      height="60"
      fill="none"
      stroke="currentColor"
      aria-hidden="true"
    >
      {/* subtle axes */}
      <line x1="8" y1="5"  x2="8"   y2="53" strokeWidth="1.5" opacity="0.25" strokeLinecap="round" />
      <line x1="8" y1="53" x2="116" y2="53" strokeWidth="1.5" opacity="0.25" strokeLinecap="round" />

      {/* trending upward chart line */}
      <polyline
        points="8,49 20,41 32,43 44,32 56,35 68,23 80,26 92,15 106,17"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{
          strokeDasharray: 200,
          animation: "draw-chart-line 1.2s ease-out infinite",
        } as React.CSSProperties}
      />
    </svg>
  );
}
