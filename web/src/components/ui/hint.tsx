"use client";
import { useState, useRef, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";

type Props = {
  /** Tooltip text to display on hover */
  text: string;
  children: React.ReactNode;
};

/**
 * Wraps content with a dashed underline and a small tooltip on hover.
 * Use for abbreviated column headers, labels, or any UI element that
 * benefits from a short plain-text explanation.
 *
 * Usage:
 *   <Hint text="Active — inactive metrics are hidden from Today but data is preserved">Act</Hint>
 */
export function Hint({ text, children }: Props) {
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; above: boolean } | null>(null);
  const ref = useRef<HTMLSpanElement>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const computePos = useCallback(() => {
    if (!ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const above = r.bottom + 140 > window.innerHeight;
    setPos({
      left: Math.max(100, Math.min(r.left + r.width / 2, window.innerWidth - 100)),
      top: above ? r.top : r.bottom,
      above,
    });
  }, []);

  const handleEnter = useCallback(() => {
    timerRef.current = setTimeout(() => {
      computePos();
      setShow(true);
    }, 120);
  }, [computePos]);

  const handleLeave = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setShow(false);
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <span
      ref={ref}
      className="inline-flex items-center cursor-help border-b border-dashed border-muted-foreground/60"
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
    >
      {children}
      {show &&
        pos &&
        createPortal(
          <div
            className="fixed z-[9999] bg-popover text-popover-foreground border rounded-md shadow-md px-2.5 py-1.5 text-xs max-w-[220px] leading-snug pointer-events-none"
            style={{
              left: pos.left,
              transform: "translateX(-50%)",
              ...(pos.above
                ? { bottom: window.innerHeight - pos.top + 6 }
                : { top: pos.top + 6 }),
            }}
          >
            {text}
          </div>,
          document.body
        )}
    </span>
  );
}
