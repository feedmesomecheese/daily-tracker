"use client";

// Open book with text lines appearing sequentially left→right, top→bottom.
// 8 lines × 0.2 s stagger, each on a 1.6 s opacity wave.
const LINE_ANIM = "text-line-appear 1.6s ease-in-out infinite";

export function BooksLoader() {
  return (
    <svg
      viewBox="0 0 100 72"
      width="120"
      height="86"
      fill="currentColor"
      stroke="currentColor"
      aria-hidden="true"
    >
      {/* ── Book pages ─────────────────────────────── */}
      {/* left page */}
      <polygon
        points="3,20 47,15 47,67 3,72"
        fill="currentColor"
        fillOpacity="0.07"
        strokeWidth="1.5"
        strokeOpacity="0.55"
      />
      {/* right page */}
      <polygon
        points="53,15 97,20 97,72 53,67"
        fill="currentColor"
        fillOpacity="0.07"
        strokeWidth="1.5"
        strokeOpacity="0.55"
      />
      {/* spine */}
      <line x1="50" y1="13" x2="50" y2="69" strokeWidth="1" strokeOpacity="0.35" />

      {/* ── Text lines — left page ────────────────── */}
      <rect x="9"  y="26" width="30" height="2.2" rx="1.1" style={{ opacity: 0, animation: LINE_ANIM, animationDelay: "0s"    } as React.CSSProperties} />
      <rect x="9"  y="33" width="25" height="2.2" rx="1.1" style={{ opacity: 0, animation: LINE_ANIM, animationDelay: "0.2s"  } as React.CSSProperties} />
      <rect x="9"  y="40" width="28" height="2.2" rx="1.1" style={{ opacity: 0, animation: LINE_ANIM, animationDelay: "0.4s"  } as React.CSSProperties} />
      <rect x="9"  y="47" width="21" height="2.2" rx="1.1" style={{ opacity: 0, animation: LINE_ANIM, animationDelay: "0.6s"  } as React.CSSProperties} />

      {/* ── Text lines — right page ───────────────── */}
      <rect x="58" y="26" width="30" height="2.2" rx="1.1" style={{ opacity: 0, animation: LINE_ANIM, animationDelay: "0.8s"  } as React.CSSProperties} />
      <rect x="58" y="33" width="25" height="2.2" rx="1.1" style={{ opacity: 0, animation: LINE_ANIM, animationDelay: "1.0s"  } as React.CSSProperties} />
      <rect x="58" y="40" width="28" height="2.2" rx="1.1" style={{ opacity: 0, animation: LINE_ANIM, animationDelay: "1.2s"  } as React.CSSProperties} />
      <rect x="58" y="47" width="21" height="2.2" rx="1.1" style={{ opacity: 0, animation: LINE_ANIM, animationDelay: "1.4s"  } as React.CSSProperties} />
    </svg>
  );
}
