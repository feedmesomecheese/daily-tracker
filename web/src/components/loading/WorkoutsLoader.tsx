"use client";

// Front-facing barbell back squat silhouette — two poses cross-fading.
// Standing (top of lift) ↔ bottom of squat, with loaded barbell and plates.
export function WorkoutsLoader() {
  return (
    <svg
      viewBox="0 0 100 100"
      width="100"
      height="100"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {/* ── Standing pose ─────────────────────────────── */}
      <g style={{ animation: "squat-stand 2s ease-in-out infinite" }}>
        {/* head */}
        <circle cx="50" cy="8" r="7" fill="currentColor" stroke="none" />
        {/* barbell plates (drawn first so bar renders on top) */}
        <circle cx="9"  cy="22" r="9" fill="currentColor" stroke="none" />
        <circle cx="91" cy="22" r="9" fill="currentColor" stroke="none" />
        {/* barbell bar */}
        <line x1="4" y1="22" x2="96" y2="22" strokeWidth="3.5" />
        {/* traps / collar area — wide shoulders under bar */}
        <line x1="27" y1="26" x2="73" y2="26" strokeWidth="8" />
        {/* torso */}
        <line x1="50" y1="15" x2="50" y2="55" strokeWidth="9" />
        {/* upper legs */}
        <line x1="40" y1="55" x2="30" y2="78" strokeWidth="7" />
        <line x1="60" y1="55" x2="70" y2="78" strokeWidth="7" />
        {/* lower legs */}
        <line x1="30" y1="78" x2="28" y2="96" strokeWidth="6" />
        <line x1="70" y1="78" x2="72" y2="96" strokeWidth="6" />
      </g>

      {/* ── Bottom-of-squat pose ──────────────────────── */}
      <g style={{ animation: "squat-down 2s ease-in-out infinite" }}>
        {/* head (lower — body is compressed into squat) */}
        <circle cx="50" cy="40" r="7" fill="currentColor" stroke="none" />
        {/* barbell plates at shoulder height (now much lower) */}
        <circle cx="9"  cy="54" r="9" fill="currentColor" stroke="none" />
        <circle cx="91" cy="54" r="9" fill="currentColor" stroke="none" />
        {/* barbell bar */}
        <line x1="4" y1="54" x2="96" y2="54" strokeWidth="3.5" />
        {/* traps / collar area */}
        <line x1="27" y1="58" x2="73" y2="58" strokeWidth="8" />
        {/* torso (short — hips near ankles) */}
        <line x1="50" y1="47" x2="50" y2="66" strokeWidth="9" />
        {/* thighs — wide, nearly horizontal (knees flared out) */}
        <line x1="43" y1="66" x2="20" y2="72" strokeWidth="7" />
        <line x1="57" y1="66" x2="80" y2="72" strokeWidth="7" />
        {/* lower legs — angled back from knees to floor */}
        <line x1="20" y1="72" x2="22" y2="94" strokeWidth="6" />
        <line x1="80" y1="72" x2="78" y2="94" strokeWidth="6" />
      </g>
    </svg>
  );
}
