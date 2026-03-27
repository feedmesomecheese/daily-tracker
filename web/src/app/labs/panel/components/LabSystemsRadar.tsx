"use client";

import React, { useMemo, useState, useEffect } from "react";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { PanelTest } from "../page";

// ── System definitions ────────────────────────────────────────────────────────

interface SystemDef {
  name: string;      // Short label on radar
  fullName: string;  // Tooltip / no-data callout
  category: string;  // Panel category pill to toggle
  keywords: string[];
}

const SYSTEMS: SystemDef[] = [
  {
    name: "Cardio", fullName: "Cardiovascular", category: "Lipid",
    keywords: ["ldl", "hdl", "triglyceride", "apob", "apolipoprotein b", "hs-crp", "hscrp", "c-reactive protein", "homocysteine", "lipoprotein"],
  },
  {
    name: "Metabolic", fullName: "Metabolic", category: "Metabolic",
    keywords: ["glucose", "hba1c", "hemoglobin a1c", "insulin", "egfr", "estimated gfr"],
  },
  {
    name: "Liver", fullName: "Liver", category: "Metabolic",
    keywords: ["alt", "alanine aminotransferase", "alanine transaminase", "ast", "aspartate aminotransferase", "ggt", "gamma-glutamyl", "gamma glutamyl", "bilirubin", "albumin", "alkaline phosphatase", "alp"],
  },
  {
    name: "Kidney", fullName: "Kidney", category: "Metabolic",
    keywords: ["creatinine", "bun", "blood urea nitrogen", "uric acid", "cystatin"],
  },
  {
    name: "Blood", fullName: "Blood (CBC)", category: "CBC",
    keywords: ["wbc", "white blood", "rbc", "red blood", "hemoglobin", "hematocrit", "platelet", "neutrophil", "lymphocyte", "monocyte", "eosinophil", "mch", "mcv", "rdw"],
  },
  {
    name: "Thyroid", fullName: "Thyroid", category: "Thyroid",
    keywords: ["tsh", "t3", "t4", "free t3", "free t4", "triiodothyronine", "thyroxine", "thyroid stimulating"],
  },
  {
    name: "Hormonal", fullName: "Hormonal", category: "Hormone",
    keywords: ["testosterone", "dhea", "estradiol", "estrogen", "cortisol", "progesterone", "igf"],
  },
  {
    name: "Nutrition", fullName: "Nutritional", category: "Vitamin",
    keywords: ["vitamin d", "25-oh", "25-hydroxy", "b12", "cobalamin", "folate", "folic", "magnesium", "zinc", "ferritin", "selenium"],
  },
];

// Short abbreviations that need word-boundary matching to avoid false positives
const WORD_BOUNDARY_KEYWORDS = new Set(["alt", "ast", "ggt", "alp", "bun", "wbc", "rbc", "hdl", "ldl", "b12", "tsh", "t3", "t4"]);

function matchesKeyword(canonicalName: string, kw: string): boolean {
  const lower = canonicalName.toLowerCase().trim();
  if (WORD_BOUNDARY_KEYWORDS.has(kw)) {
    return lower === kw ||
      new RegExp(`(^|[\\s,\\-])${kw}($|[\\s,\\-])`, "i").test(lower);
  }
  return lower.includes(kw);
}

function assignSystem(canonicalName: string): SystemDef | null {
  for (const sys of SYSTEMS) {
    if (sys.keywords.some((kw) => matchesKeyword(canonicalName, kw))) return sys;
  }
  return null;
}

// ── Scoring ───────────────────────────────────────────────────────────────────

function scoreTest(test: PanelTest, showOptimal: boolean): number | null {
  const latest = test.latest;
  if (!latest) return null;

  const { value, ref_low, ref_high, in_range } = latest;
  const { opt_low, opt_high } = test;

  // No range data at all — can't score
  if (in_range === null && ref_low == null && ref_high == null) return null;

  // Out of range: 0–35
  if (in_range === false) {
    if (ref_high != null && value > ref_high) {
      const span = ref_high - (ref_low ?? 0);
      const overshoot = span > 0 ? Math.min((value - ref_high) / span, 2) : 0.5;
      return Math.max(0, Math.round(35 - overshoot * 17));
    }
    if (ref_low != null && value < ref_low) {
      const span = (ref_high ?? ref_low * 2) - ref_low;
      const undershoot = span > 0 ? Math.min((ref_low - value) / span, 2) : 0.5;
      return Math.max(0, Math.round(35 - undershoot * 17));
    }
    return 20;
  }

  // In range (or inferred in-range from bounds)
  const effectiveInRange =
    in_range === true ||
    ((ref_low == null || value >= ref_low) && (ref_high == null || value <= ref_high));
  if (!effectiveInRange) return 20;

  // No optimal data → score 70 flat
  if (!showOptimal || (opt_low == null && opt_high == null)) return 70;

  const inOptimal =
    (opt_low == null || value >= opt_low) && (opt_high == null || value <= opt_high);

  if (inOptimal) {
    if (opt_low != null && opt_high != null) {
      const center = (opt_low + opt_high) / 2;
      const halfWidth = (opt_high - opt_low) / 2 || 1;
      const distFrac = Math.min(Math.abs(value - center) / halfWidth, 1);
      return Math.round(100 - distFrac * 30); // 70–100
    }
    return 85;
  }

  // Suboptimal: 40–69
  if (opt_high != null && value > opt_high) {
    const upper = ref_high ?? opt_high * 1.5;
    const span = Math.max(upper - opt_high, 0.001);
    const frac = Math.min((value - opt_high) / span, 1);
    return Math.round(69 - frac * 29);
  }
  if (opt_low != null && value < opt_low) {
    const lower = ref_low ?? opt_low * 0.5;
    const span = Math.max(opt_low - lower, 0.001);
    const frac = Math.min((opt_low - value) / span, 1);
    return Math.round(69 - frac * 29);
  }
  return 55;
}

function scoreColor(score: number): string {
  if (score >= 70) return "#16a34a";
  if (score >= 40) return "#d97706";
  return "#dc2626";
}

function scoreLabel(score: number): string {
  if (score >= 70) return "Good";
  if (score >= 40) return "Suboptimal";
  return "Needs attention";
}

// ── Custom radar dot ──────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ScoreDot(props: any) {
  const { cx, cy, payload, onHover } = props;
  if (cx == null || cy == null || payload?.score == null) return null;
  return (
    <circle
      cx={cx} cy={cy} r={6}
      fill={scoreColor(payload.score)}
      stroke="white" strokeOpacity={0.6} strokeWidth={1.5}
      style={{ cursor: "pointer" }}
      onMouseEnter={() => onHover?.(payload.system)}
      onMouseLeave={() => onHover?.(null)}
    />
  );
}

// ── Custom angle-axis tick (clickable system labels) ──────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function SystemTick(props: any) {
  const { x, y, payload, selectedCategories, onCategoryToggle, systemMap, labelColor, labelActiveColor } = props;
  const sysName: string = payload?.value;
  const sys: SystemDef | undefined = systemMap?.[sysName];
  if (!sys) return null;

  const isActive = (selectedCategories as string[]).includes(sys.category);

  return (
    <text
      x={x}
      y={y}
      textAnchor="middle"
      dominantBaseline="central"
      fontSize={11}
      fontWeight={isActive ? 700 : 400}
      fill={isActive ? (labelActiveColor ?? "#6366f1") : "currentColor"}
      opacity={isActive ? 1 : 0.7}
      style={{ cursor: "pointer", userSelect: "none", outline: "none" }}
      onClick={() => onCategoryToggle(sys.category)}
    >
      {sysName}
    </text>
  );
}


// ── Dark mode hook ────────────────────────────────────────────────────────────

function useIsDark() {
  const [isDark, setIsDark] = useState(false);
  useEffect(() => {
    const check = () => setIsDark(document.documentElement.classList.contains("dark"));
    check();
    const observer = new MutationObserver(check);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);
  return isDark;
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  tests: PanelTest[];
  showOptimal: boolean;
  selectedCategories: string[];
  onCategoryToggle: (category: string) => void;
}

export default function LabSystemsRadar({ tests, showOptimal, selectedCategories, onCategoryToggle }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [hoveredSystem, setHoveredSystem] = useState<string | null>(null);
  const isDark = useIsDark();
  const gridColor = isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.12)";
  const labelColor = isDark ? "#cbd5e1" : "#374151";  // slate-300 : gray-700
  const labelActiveColor = "#6366f1";

  const { scoredSystems, noDataSystems, overallScore } = useMemo(() => {
    // Assign each test to its system
    const systemTests = new Map<string, PanelTest[]>();
    for (const t of tests) {
      const sys = assignSystem(t.canonical_name);
      if (!sys) continue;
      if (!systemTests.has(sys.name)) systemTests.set(sys.name, []);
      systemTests.get(sys.name)!.push(t);
    }

    const all = SYSTEMS.map((sys) => {
      const sysTests = systemTests.get(sys.name) ?? [];
      const scores = sysTests
        .map((t) => scoreTest(t, showOptimal))
        .filter((s): s is number => s !== null);
      if (scores.length === 0) return { ...sys, score: null, testCount: 0 };
      const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
      return { ...sys, score: avg, testCount: sysTests.length };
    });

    const scored = all.filter((s) => s.score !== null) as (SystemDef & { score: number; testCount: number })[];
    const noData = all.filter((s) => s.score === null);

    const overall =
      scored.length > 0
        ? Math.round(scored.reduce((a, b) => a + b.score, 0) / scored.length)
        : null;

    return { scoredSystems: scored, noDataSystems: noData, overallScore: overall };
  }, [tests, showOptimal]);

  // Build lookup map for SystemTick
  const systemMap = useMemo(() => {
    const m: Record<string, SystemDef> = {};
    for (const s of SYSTEMS) m[s.name] = s;
    return m;
  }, []);

  const chartData = scoredSystems.map((s) => ({
    system: s.name,
    fullName: s.fullName,
    category: s.category,
    score: s.score,
    testCount: s.testCount,
  }));

  if (tests.length === 0) return null;

  return (
    <Card>
      <CardHeader className="px-3 py-2">
        <CardTitle className="text-sm font-medium flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span>Health Systems Overview</span>
            {overallScore != null && (
              <span
                className="text-xs font-semibold px-1.5 py-0.5 rounded"
                style={{
                  color: scoreColor(overallScore),
                  backgroundColor: `${scoreColor(overallScore)}18`,
                }}
              >
                {overallScore} / 100
              </span>
            )}
          </div>
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="text-muted-foreground hover:text-foreground transition-colors p-0.5"
          >
            <svg
              className={cn("h-4 w-4 transition-transform", collapsed && "-rotate-90")}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="m19 9-7 7-7-7" />
            </svg>
          </button>
        </CardTitle>
      </CardHeader>

      {!collapsed && (
        <CardContent className="px-3 pt-0 pb-2">
          {scoredSystems.length < 3 ? (
            <p className="text-xs text-muted-foreground text-center py-6">
              Not enough data to display — need at least 3 systems with lab results.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <RadarChart
                data={chartData}
                cx="50%" cy="50%"
                outerRadius="75%"
                onMouseLeave={() => setHoveredSystem(null)}
              >
                <PolarGrid stroke={gridColor} />
                <PolarRadiusAxis
                  angle={90}
                  domain={[0, 100]}
                  tickCount={4}
                  tick={false}
                  axisLine={false}
                />
                <PolarAngleAxis
                  dataKey="system"
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  tick={(props: any) => (
                    <SystemTick
                      {...props}
                      selectedCategories={selectedCategories}
                      onCategoryToggle={onCategoryToggle}
                      systemMap={systemMap}
                      labelActiveColor={labelActiveColor}
                    />
                  )}
                />
                <Radar
                  dataKey="score"
                  stroke="#6366f1"
                  strokeWidth={2}
                  fill="#6366f1"
                  fillOpacity={0.25}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  dot={(props: any) => <ScoreDot {...props} onHover={setHoveredSystem} />}
                  activeDot={false}
                  isAnimationActive={false}
                />
              </RadarChart>
            </ResponsiveContainer>
          )}

          {/* Hover info bar */}
          <div className="h-8 flex items-center justify-center">
            {hoveredSystem ? (() => {
              const d = chartData.find((c) => c.system === hoveredSystem);
              if (!d) return null;
              return (
                <p className="text-xs text-center">
                  <span className="font-medium text-foreground">{d.fullName}</span>
                  <span className="text-muted-foreground"> · </span>
                  <span style={{ color: scoreColor(d.score) }}>{d.score}/100 — {scoreLabel(d.score)}</span>
                  <span className="text-muted-foreground"> · {d.testCount} test{d.testCount !== 1 ? "s" : ""}</span>
                </p>
              );
            })() : (
              <p className="text-xs text-muted-foreground/60 text-center">
                Click a label to filter · hover a node for details
              </p>
            )}
          </div>

          {/* Score legend */}
          <div className="flex items-center justify-center gap-4 mb-1">
            {[
              { color: "#16a34a", label: "Good (70–100)" },
              { color: "#d97706", label: "Suboptimal (40–69)" },
              { color: "#dc2626", label: "Needs attention (0–39)" },
            ].map(({ color, label }) => (
              <div key={label} className="flex items-center gap-1 text-xs text-muted-foreground">
                <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                {label}
              </div>
            ))}
          </div>

          {/* No-data callout */}
          {noDataSystems.length > 0 && (
            <div className="text-xs text-muted-foreground text-center border-t pt-2">
              Not scored (no data):{" "}
              <span className="font-medium">
                {noDataSystems.map((s) => s.fullName).join(", ")}
              </span>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
