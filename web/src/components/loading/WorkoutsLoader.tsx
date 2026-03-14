"use client";

// Kettlebell outline that fills from the bottom up, drains, and repeats.
export function WorkoutsLoader() {
  return (
    <svg
      viewBox="0 0 80 100"
      width="80"
      height="100"
      aria-hidden="true"
    >
      <defs>
        {/* Shape used to clip the rising fill rect */}
        <clipPath id="kb-fill-clip">
          {/* handle ring — outer arch then inner arch reversed */}
          <path d="
            M 20,70
            L 20,42 Q 20,22 40,22 Q 60,22 60,42
            L 60,70
            L 52,70
            L 52,45 Q 52,30 40,30 Q 28,30 28,45
            L 28,70 Z
          " />
          {/* body */}
          <circle cx="40" cy="70" r="22" />
        </clipPath>
      </defs>

      {/* rising fill — clipped to kettlebell shape */}
      <rect
        x="0"
        y="22"
        width="80"
        height="70"
        fill="currentColor"
        clipPath="url(#kb-fill-clip)"
        style={{
          transformOrigin: "40px 92px",
          animation: "kettlebell-fill 1.5s ease-in-out infinite",
        } as React.CSSProperties}
      />

      {/* outline always on top */}
      <path
        d="
          M 20,70
          L 20,42 Q 20,22 40,22 Q 60,22 60,42
          L 60,70
          L 52,70
          L 52,45 Q 52,30 40,30 Q 28,30 28,45
          L 28,70 Z
        "
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle
        cx="40"
        cy="70"
        r="22"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
      />
    </svg>
  );
}
