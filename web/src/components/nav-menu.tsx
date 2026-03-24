"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

type NavModule = {
  name: string;
  links: { href: string; label: string }[];
};

const modules: NavModule[] = [
  {
    name: "Tracker",
    links: [
      { href: "/", label: "Today" },
      { href: "/metrics", label: "Metrics" },
      { href: "/log", label: "Log" },
      { href: "/ma", label: "Moving Avg" },
      { href: "/stats", label: "Stats" },
      { href: "/insights", label: "Insights" },
      { href: "/heatmap", label: "Heatmap" },
      { href: "/radar", label: "Radar" },
      { href: "/summary", label: "Summary" },
      { href: "/search", label: "Search" },
      { href: "/dashboard", label: "Dashboard" },
      { href: "/achievements", label: "Achievements" },
      { href: "/integrations", label: "Integrations" },
    ],
  },
  {
    name: "Books",
    links: [
      { href: "/books", label: "Library" },
      { href: "/books/stats", label: "Stats" },
    ],
  },
  {
    name: "Workouts",
    links: [
      { href: "/workouts", label: "Entry" },
      { href: "/workouts/log", label: "Log" },
      { href: "/workouts/exercises", label: "Exercises" },
    ],
  },
  {
    name: "Food",
    links: [
      { href: "/food", label: "Log" },
      { href: "/food/plan", label: "Plan" },
      { href: "/food/log", label: "History" },
      { href: "/food/library", label: "Library" },
      { href: "/food/goals", label: "Goals" },
    ],
  },
  {
    name: "Labs",
    links: [
      { href: "/labs", label: "Results" },
    ],
  },
];

const settingsLink = { href: "/settings", label: "Settings" };

export function NavMenu() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [hasSession, setHasSession] = useState<boolean | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  // Check auth session on mount
  useEffect(() => {
    supabaseBrowser.auth.getSession().then(({ data: { session } }) => {
      setHasSession(!!session);
    });
  }, []);

  // Determine which module is active based on current path
  const activeModule = modules.find((m) =>
    m.links.some((l) => l.href === pathname || (l.href !== "/" && pathname.startsWith(l.href)))
  );

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenDropdown(null);
        setMobileOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Close when route changes
  useEffect(() => {
    setOpenDropdown(null);
    setMobileOpen(false);
  }, [pathname]);

  const toggleDropdown = (name: string) => {
    setOpenDropdown((prev) => (prev === name ? null : name));
  };

  async function handleLogout() {
    await supabaseBrowser.auth.signOut();
    window.location.href = "/login";
  }

  // Hide nav when no session (login/signup/reset pages)
  if (hasSession === null || hasSession === false) return null;

  return (
    <div ref={menuRef} className="w-full">
      {/* Desktop: module dropdowns */}
      <div className="hidden sm:flex items-center gap-1 text-sm">
        {modules.map((module) => (
          <div key={module.name} className="relative">
            <button
              onClick={() => toggleDropdown(module.name)}
              className={`px-3 py-1.5 rounded-md font-medium transition-colors flex items-center gap-1 ${
                activeModule?.name === module.name
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-accent"
              }`}
            >
              {module.name}
              <svg
                className={`w-3.5 h-3.5 transition-transform ${openDropdown === module.name ? "rotate-180" : ""}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {openDropdown === module.name && (
              <div className="absolute top-full left-0 mt-1 bg-popover border rounded-md shadow-lg py-1 min-w-[160px] z-50">
                {module.links.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`block px-3 py-1.5 hover:bg-accent transition-colors ${
                      pathname === link.href ? "bg-accent font-medium" : ""
                    }`}
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
            )}
          </div>
        ))}

        <div className="mx-2 h-4 w-px bg-border" />

        <Link
          href={settingsLink.href}
          className={`px-3 py-1.5 rounded-md transition-colors ${
            pathname === settingsLink.href ? "bg-accent font-medium" : "hover:bg-accent"
          }`}
        >
          {settingsLink.label}
        </Link>

        <div className="mx-2 h-4 w-px bg-border" />

        <button
          onClick={handleLogout}
          className="px-3 py-1.5 rounded-md transition-colors hover:bg-accent text-muted-foreground"
        >
          Log Out
        </button>
      </div>

      {/* Mobile: hamburger menu */}
      <div className="flex sm:hidden items-center justify-between text-sm">
        <span className="font-semibold">
          {activeModule?.name === "Books" ? "Books" : activeModule?.name === "Workouts" ? "Workouts" : activeModule?.name === "Food" ? "Food" : "Daily Tracker"}
        </span>
        <button
          onClick={() => setMobileOpen((v) => !v)}
          className="p-1 -mr-1 text-lg leading-none"
          aria-label="Toggle navigation menu"
        >
          {mobileOpen ? "\u2715" : "\u2630"}
        </button>
      </div>

      {/* Mobile dropdown */}
      {mobileOpen && (
        <div className="sm:hidden flex flex-col gap-1 pt-2 pb-1 text-sm border-t mt-2">
          {modules.map((module) => (
            <div key={module.name}>
              <div className="px-1 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                {module.name}
              </div>
              {module.links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`py-1.5 px-3 hover:bg-accent rounded block ${
                    pathname === link.href ? "bg-accent font-medium" : ""
                  }`}
                  onClick={() => setMobileOpen(false)}
                >
                  {link.label}
                </Link>
              ))}
            </div>
          ))}
          <div className="border-t my-1" />
          <Link
            href={settingsLink.href}
            className={`py-1.5 px-3 hover:bg-accent rounded block ${
              pathname === settingsLink.href ? "bg-accent font-medium" : ""
            }`}
            onClick={() => setMobileOpen(false)}
          >
            {settingsLink.label}
          </Link>
          <div className="border-t my-1" />
          <button
            onClick={handleLogout}
            className="py-1.5 px-3 hover:bg-accent rounded block text-left text-muted-foreground"
          >
            Log Out
          </button>
        </div>
      )}
    </div>
  );
}
