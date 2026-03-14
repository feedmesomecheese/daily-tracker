"use client";

// Two muscular stick-figure poses (standing ↔ bottom-of-squat) that cross-fade.
// Animation timing: 2 s cycle — each pose visible ~45%, 10% cross-fade overlap.
export function WorkoutsLoader() {
  return (
    <svg
      viewBox="0 0 64 96"
      width="64"
      height="96"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {/* ── Standing pose ─────────────────────────────── */}
      <g style={{ animation: "squat-stand 2s ease-in-out infinite" }}>
        {/* head */}
        <circle cx="32" cy="9" r="6.5" fill="currentColor" stroke="none" />
        {/* broad shoulders bar */}
        <line x1="11" y1="21" x2="53" y2="21" strokeWidth="8" />
        {/* torso */}
        <line x1="32" y1="17" x2="32" y2="52" strokeWidth="9" />
        {/* arms */}
        <line x1="12" y1="24" x2="5"  y2="44" strokeWidth="5" />
        <line x1="52" y1="24" x2="59" y2="44" strokeWidth="5" />
        {/* upper legs */}
        <line x1="26" y1="52" x2="19" y2="74" strokeWidth="7" />
        <line x1="38" y1="52" x2="45" y2="74" strokeWidth="7" />
        {/* lower legs */}
        <line x1="19" y1="74" x2="17" y2="92" strokeWidth="5.5" />
        <line x1="45" y1="74" x2="47" y2="92" strokeWidth="5.5" />
      </g>

      {/* ── Bottom-of-squat pose ──────────────────────── */}
      <g style={{ animation: "squat-down 2s ease-in-out infinite" }}>
        {/* head (lower) */}
        <circle cx="32" cy="45" r="6.5" fill="currentColor" stroke="none" />
        {/* broad shoulders */}
        <line x1="11" y1="57" x2="53" y2="57" strokeWidth="8" />
        {/* torso (short — compressed squat) */}
        <line x1="32" y1="52" x2="32" y2="66" strokeWidth="9" />
        {/* arms resting on thighs */}
        <line x1="12" y1="60" x2="7"  y2="74" strokeWidth="5" />
        <line x1="52" y1="60" x2="57" y2="74" strokeWidth="5" />
        {/* thighs — wide, nearly horizontal */}
        <line x1="27" y1="66" x2="7"  y2="70" strokeWidth="7" />
        <line x1="37" y1="66" x2="57" y2="70" strokeWidth="7" />
        {/* lower legs — down from knees */}
        <line x1="7"  y1="70" x2="9"  y2="92" strokeWidth="5.5" />
        <line x1="57" y1="70" x2="55" y2="92" strokeWidth="5.5" />
      </g>
    </svg>
  );
}
