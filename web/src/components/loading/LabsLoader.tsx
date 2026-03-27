"use client";

// Vertical syringe — indigo liquid rises from bottom to fill barrel, then drains. Loops.
// Needle points down. Plunger + thumb grip static at top.
export function LabsLoader() {
  // viewBox: 40 wide × 115 tall
  // Barrel: x=10..30, y=10..80 (20 wide, 70 tall)
  // Plunger rod + thumb grip above barrel (negative y, overflows)
  // Needle hub + needle below barrel (y=80..108)
  return (
    <svg
      viewBox="0 0 40 115"
      width="48"
      height="138"
      aria-hidden="true"
      overflow="visible"
    >
      <style>{`
        @keyframes labs-syringe-fill {
          0%   { transform: scaleY(0); }
          55%  { transform: scaleY(1); }
          70%  { transform: scaleY(1); }
          88%  { transform: scaleY(0); }
          100% { transform: scaleY(0); }
        }
      `}</style>

      <defs>
        {/* Clip to barrel interior so liquid never bleeds outside */}
        <clipPath id="labs-barrel-clip">
          <rect x="11" y="11" width="18" height="68" />
        </clipPath>
      </defs>

      {/* ── Plunger rod ── */}
      <rect x="18.5" y="-20" width="3" height="22" rx="1" fill="currentColor" opacity="0.65" />

      {/* ── Thumb grip (horizontal bar) ── */}
      <rect x="11" y="-24" width="18" height="5" rx="2.5" fill="currentColor" opacity="0.65" />

      {/* ── Plunger head (rubber stopper, static at top of barrel) ── */}
      <rect x="12" y="2" width="16" height="9" rx="2" fill="currentColor" opacity="0.55" />

      {/* ── Barrel outline ── */}
      <rect
        x="10" y="10" width="20" height="70" rx="2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />

      {/* ── Liquid fill — scaleY from bottom so it rises upward ── */}
      <rect
        x="11" y="11" width="18" height="68"
        fill="#6366f1"
        fillOpacity="0.9"
        clipPath="url(#labs-barrel-clip)"
        style={{
          transformBox: "fill-box",
          transformOrigin: "bottom",
          animation: "labs-syringe-fill 2.4s ease-in-out infinite",
        }}
      />

      {/* ── Tick marks on left side of barrel ── */}
      {[25, 38, 51, 64].map((yPos) => (
        <line
          key={yPos}
          x1="10" y1={yPos} x2="5.5" y2={yPos}
          stroke="currentColor"
          strokeWidth="1"
          opacity="0.4"
        />
      ))}

      {/* ── Flanges (ears) at bottom of barrel ── */}
      <rect x="4"  y="76" width="6" height="6" rx="1.5" fill="currentColor" opacity="0.6" />
      <rect x="30" y="76" width="6" height="6" rx="1.5" fill="currentColor" opacity="0.6" />

      {/* ── Needle hub (tapers from barrel width to needle width) ── */}
      <path d="M 13,80 L 11,87 L 29,87 L 27,80 Z" fill="currentColor" opacity="0.5" />

      {/* ── Needle (tapers to a point) ── */}
      <path d="M 17.5,87 L 19.5,108 L 20.5,108 L 22.5,87 Z" fill="currentColor" opacity="0.7" />
    </svg>
  );
}
