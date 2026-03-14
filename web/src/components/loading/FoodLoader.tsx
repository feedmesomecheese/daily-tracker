"use client";

// Fork and knife spinning in-place simultaneously (synchronized slow spin).
// Each utensil rotates around its own vertical center axis.
export function FoodLoader() {
  return (
    <svg
      viewBox="0 0 80 100"
      width="60"
      height="75"
      fill="currentColor"
      overflow="visible"
      aria-hidden="true"
    >
      {/* ── Fork (centered at x=20) ────────────────── */}
      <g style={{ transformOrigin: "20px 50px", animation: "utensil-spin 1.5s ease-in-out infinite" }}>
        {/* tines (4) */}
        <rect x="10" y="5"  width="3" height="33" rx="1.5" />
        <rect x="15" y="5"  width="3" height="33" rx="1.5" />
        <rect x="20" y="5"  width="3" height="33" rx="1.5" />
        <rect x="25" y="5"  width="3" height="33" rx="1.5" />
        {/* neck / base connecting tines to handle */}
        <rect x="13" y="35" width="12" height="13" rx="2" />
        {/* handle */}
        <rect x="16" y="46" width="7"  height="47" rx="3.5" />
      </g>

      {/* ── Knife (centered at x=60) ──────────────── */}
      <g style={{ transformOrigin: "60px 50px", animation: "utensil-spin 1.5s ease-in-out infinite" }}>
        {/* blade — tapers from wide shoulder to thin tip */}
        <path d="M 56,46 L 56,14 Q 57,5 60,5 Q 62,5 63,14 L 65,46 Z" />
        {/* handle */}
        <rect x="56" y="46" width="9"  height="47" rx="4.5" />
      </g>
    </svg>
  );
}
