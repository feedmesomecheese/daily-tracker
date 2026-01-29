"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Today" },
  { href: "/metrics", label: "Metrics" },
  { href: "/wide", label: "Wide" },
  { href: "/ma", label: "Moving Avg" },
  { href: "/stats", label: "Stats" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/settings", label: "Settings" },
];

export function NavMenu() {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  // Close on outside click
  useEffect(() => {
    if (!open) return;

    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // Close when route changes
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <div ref={menuRef} className="w-full">
      {/* Desktop: horizontal link bar */}
      <div className="hidden sm:flex items-center gap-4 text-sm">
        <span className="font-semibold mr-4">Daily Tracker</span>
        {links.map((link) => (
          <Link key={link.href} href={link.href} className="hover:underline">
            {link.label}
          </Link>
        ))}
      </div>

      {/* Mobile: title + hamburger */}
      <div className="flex sm:hidden items-center justify-between text-sm">
        <span className="font-semibold">Daily Tracker</span>
        <button
          onClick={() => setOpen((v) => !v)}
          className="p-1 -mr-1 text-lg leading-none"
          aria-label="Toggle navigation menu"
        >
          {open ? "\u2715" : "\u2630"}
        </button>
      </div>

      {/* Mobile dropdown */}
      {open && (
        <div className="sm:hidden flex flex-col gap-1 pt-2 pb-1 text-sm border-t mt-2">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="py-1.5 px-1 hover:bg-accent rounded"
              onClick={() => setOpen(false)}
            >
              {link.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
