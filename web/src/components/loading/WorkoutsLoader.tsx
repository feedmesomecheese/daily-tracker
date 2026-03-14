"use client";

// Kettlebell outline that fills from the bottom up, holds, then drains.
//
// Fill technique: a <mask> containing a SMIL-animated <rect> that grows
// upward (y+height anchored at y=92). SMIL animates SVG attributes
// directly inside <defs>, sidestepping the CSS-transform/clipPath
// coordinate mismatch that caused the fill to appear as a separate shape.
//
// Outline technique: two separate OPEN paths (outer arch + inner arch)
// so the ring has no horizontal closing lines at the base.
export function WorkoutsLoader() {
  return (
    <svg viewBox="0 0 80 100" width="80" height="100" aria-hidden="true">
      <defs>
        <mask id="kb-reveal-mask">
          {/* White rect grows upward from y=92 (bottom of body) to y=22 (top of handle).
              Bottom edge stays fixed at y=92; top edge rises as height increases. */}
          <rect x="0" width="80" fill="white">
            <animate
              attributeName="y"
              values="92;22;22;92"
              dur="1.5s"
              repeatCount="indefinite"
              calcMode="spline"
              keyTimes="0;0.65;0.82;1"
              keySplines="0.4 0 0.2 1;0 0 0 0;0.4 0 0.2 1"
            />
            <animate
              attributeName="height"
              values="0;70;70;0"
              dur="1.5s"
              repeatCount="indefinite"
              calcMode="spline"
              keyTimes="0;0.65;0.82;1"
              keySplines="0.4 0 0.2 1;0 0 0 0;0.4 0 0.2 1"
            />
          </rect>
        </mask>
      </defs>

      {/* ── Filled kettlebell, revealed from bottom by the mask ── */}
      <g mask="url(#kb-reveal-mask)">
        {/* Handle ring as a thick stroke — solid band, no hollow-center artifacts */}
        <path
          d="M 20,61 L 20,42 Q 20,22 40,22 Q 60,22 60,42 L 60,61"
          fill="none"
          stroke="currentColor"
          strokeWidth="8"
          strokeLinecap="round"
        />
        {/* Body */}
        <circle cx="40" cy="70" r="22" fill="currentColor" />
      </g>

      {/* ── Outline — always visible on top ── */}
      {/* Outer handle arch — open path, ends at circle surface (y≈61) */}
      <path
        d="M 20,61 L 20,42 Q 20,22 40,22 Q 60,22 60,42 L 60,61"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      {/* Inner handle arch — open path, ends at circle surface (y≈52) */}
      <path
        d="M 28,52 L 28,44 Q 28,30 40,30 Q 52,30 52,44 L 52,52"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      {/* Body */}
      <circle cx="40" cy="70" r="22" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}
