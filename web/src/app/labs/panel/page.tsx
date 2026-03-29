"use client";

import { useEffect, useState, useMemo } from "react";
import { getAuthHeaders } from "@/lib/authHeaders";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import LabTestDetailSheet from "./components/LabTestDetailSheet";
import ManageTestsSheet from "./components/ManageTestsSheet";
import LabSystemsRadar from "./components/LabSystemsRadar";
import LabCompareSheet from "./components/LabCompareSheet";
import LabUploadSheet from "../components/LabUploadSheet";
import { LabsLoader } from "@/components/loading/LabsLoader";
import { LoadingScreen } from "@/components/loading/LoadingScreen";

// ── Types ────────────────────────────────────────────────────────────────────

export type HistoryEntry = {
  visit_id: string;
  visit_date: string;
  value: number;
  ref_low: number | null;
  ref_high: number | null;
  ref_text: string | null;
  in_range: boolean | null;
};

export type PanelTest = {
  canonical_name: string;
  display_name: string;
  category: string;
  unit: string | null;
  history: HistoryEntry[];
  latest: HistoryEntry | null;
  trend: "up" | "down" | "stable" | "insufficient_data";
  times_out_of_range: number;
  last_tested: string | null;
  visit_count: number;
  opt_low: number | null;
  opt_high: number | null;
};

const CATEGORY_ORDER = ["CBC", "Metabolic", "Lipid", "Thyroid", "Hormone", "Vitamin", "Urinalysis", "Other"];
const ALL_CATEGORIES = ["CBC", "Metabolic", "Lipid", "Thyroid", "Hormone", "Vitamin", "Urinalysis", "Other"];

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric", timeZone: "UTC",
  });
}

function isSuboptimal(test: PanelTest): boolean {
  const l = test.latest;
  if (!l || l.in_range !== true) return false;
  if (test.opt_low == null && test.opt_high == null) return false;
  return (test.opt_low != null && l.value < test.opt_low) ||
         (test.opt_high != null && l.value > test.opt_high);
}

function statusDotColor(test: PanelTest, showOptimal: boolean): string {
  const l = test.latest;
  if (!l || l.in_range == null) return "bg-gray-400";
  if (l.in_range === false) {
    if (l.ref_high != null && l.value > l.ref_high) return "bg-red-500";
    if (l.ref_low != null && l.value < l.ref_low) return "bg-blue-500";
    return "bg-red-500";
  }
  if (showOptimal && isSuboptimal(test)) return "bg-amber-400";
  return "bg-green-500";
}

function abnormalLabel(test: PanelTest, showOptimal: boolean): { text: string; cls: string; border: string } | null {
  const l = test.latest;
  if (!l) return null;
  if (l.in_range === false) {
    if (l.ref_high != null && l.value > l.ref_high)
      return { text: "↑ High", cls: "bg-red-700/10 text-red-700 dark:bg-red-400/10 dark:text-red-400", border: "border-red-700/30 dark:border-red-400/30" };
    if (l.ref_low != null && l.value < l.ref_low)
      return { text: "↓ Low", cls: "bg-blue-700/10 text-blue-700 dark:bg-blue-400/10 dark:text-blue-400", border: "border-blue-700/30 dark:border-blue-400/30" };
    return { text: "Abnormal", cls: "bg-red-700/10 text-red-700 dark:bg-red-400/10 dark:text-red-400", border: "border-red-700/30 dark:border-red-400/30" };
  }
  if (showOptimal && isSuboptimal(test))
    return { text: "Suboptimal", cls: "bg-amber-600/10 text-amber-700 dark:bg-amber-400/10 dark:text-amber-400", border: "border-amber-600/30 dark:border-amber-400/30" };
  return null;
}

const TREND_ICON: Record<string, string> = {
  up: "↑",
  down: "↓",
  stable: "→",
  insufficient_data: "—",
};

const TREND_COLOR: Record<string, string> = {
  up: "text-blue-500",
  down: "text-blue-500",
  stable: "text-muted-foreground",
  insufficient_data: "text-muted-foreground",
};

// ── CSV export ───────────────────────────────────────────────────────────────

function exportToCsv(tests: PanelTest[]) {
  const header = ["Test Name", "Canonical Name", "Category", "Date", "Value", "Unit", "Ref Low", "Ref High", "In Range"];
  const rows: (string | number)[][] = [header];
  for (const t of tests) {
    for (const h of t.history) {
      rows.push([
        t.display_name,
        t.canonical_name,
        t.category,
        h.visit_date,
        h.value,
        t.unit ?? "",
        h.ref_low ?? "",
        h.ref_high ?? "",
        h.in_range == null ? "" : h.in_range ? "Yes" : "No",
      ]);
    }
  }
  const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `lab-results-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Test card ────────────────────────────────────────────────────────────────

function TestCard({ test, onClick, showOptimal }: { test: PanelTest; onClick: () => void; showOptimal: boolean }) {
  const latest = test.latest;
  const label = abnormalLabel(test, showOptimal);
  const dotColor = statusDotColor(test, showOptimal);
  const latestValueColor = latest?.in_range === false
    ? (latest.ref_low != null && latest.value < latest.ref_low
        ? "text-blue-600 dark:text-blue-400"
        : "text-red-600 dark:text-red-400")
    : showOptimal && isSuboptimal(test)
      ? "text-amber-600 dark:text-amber-400"
      : "text-foreground";

  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-xl border bg-card px-4 py-3 hover:bg-accent/30 transition-colors"
    >
      <div className="flex items-start gap-3">
        {/* Status dot */}
        <div className={cn("mt-1.5 h-2 w-2 rounded-full shrink-0", dotColor)} />

        {/* Main content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm">{test.display_name}</span>
            <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
              {test.category}
            </span>
            {label && (
              <span className={cn("text-xs px-1.5 py-0.5 rounded font-medium border", label.cls, label.border)}>
                {label.text}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground flex-wrap">
            {latest != null ? (
              <span className={cn("font-mono font-semibold tabular-nums", latestValueColor)}>
                {latest.value}{test.unit ? ` ${test.unit}` : ""}
              </span>
            ) : (
              <span className="text-muted-foreground/60 italic">no value</span>
            )}
            {test.trend !== "insufficient_data" && (
              <span className={cn("text-sm font-medium", TREND_COLOR[test.trend])}>
                {TREND_ICON[test.trend]}
              </span>
            )}
            {test.visit_count > 1 && (
              <span className="text-xs text-muted-foreground">{test.visit_count} results</span>
            )}
            {test.times_out_of_range > 0 && (
              <span className="text-xs text-muted-foreground">{test.times_out_of_range}× out of range</span>
            )}
          </div>
        </div>

        {/* Last tested */}
        <div className="text-xs text-muted-foreground shrink-0 text-right mt-0.5">
          {test.last_tested ? formatDate(test.last_tested) : "—"}
        </div>
      </div>
    </button>
  );
}

// ── Compareable wrapper ───────────────────────────────────────────────────────

function CompareableTestCard({
  test, showOptimal, compareMode, selected, onToggle, onClick,
}: {
  test: PanelTest;
  showOptimal: boolean;
  compareMode: boolean;
  selected: boolean;
  onToggle: () => void;
  onClick: () => void;
}) {
  if (!compareMode) return <TestCard test={test} showOptimal={showOptimal} onClick={onClick} />;
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-xl border transition-colors cursor-pointer",
        selected ? "border-primary bg-primary/5" : "hover:bg-accent/30"
      )}
      onClick={onToggle}
    >
      <div className="pl-3 py-1 shrink-0">
        <div className={cn(
          "w-4 h-4 rounded border-2 flex items-center justify-center transition-colors",
          selected ? "border-primary bg-primary" : "border-muted-foreground/40"
        )}>
          {selected && (
            <svg viewBox="0 0 12 12" fill="none" className="w-2.5 h-2.5 text-primary-foreground">
              <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </div>
      </div>
      <div className="flex-1 pointer-events-none">
        <TestCard test={test} showOptimal={showOptimal} onClick={() => {}} />
      </div>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

type StatusFilter = "all" | "out_of_range" | "suboptimal" | "in_range";
type TrendFilter = "any" | "up" | "down" | "stable";
type SortBy = "name" | "last_tested" | "out_of_range_first";

export default function LabPanelPage() {
  const [tests, setTests] = useState<PanelTest[]>([]);
  const [loading, setLoading] = useState(true);
  const [showLoader, setShowLoader] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);

  // Filters
  const [search, setSearch] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [status, setStatus] = useState<StatusFilter>("all");
  const [trending, setTrending] = useState<TrendFilter>("any");
  const [currentVisitOnly, setCurrentVisitOnly] = useState(false);
  const [hideStale, setHideStale] = useState(false);
  const [showOptimal, setShowOptimal] = useState(true);
  const [sortBy, setSortBy] = useState<SortBy>("name");

  const fetchTests = async () => {
    setLoading(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/labs/panel", { headers });
      const data = await res.json();
      if (res.ok) setTests(data);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  useEffect(() => {
    fetchTests();
    const t = setTimeout(() => setShowLoader(true), 400);
    return () => clearTimeout(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Most recent visit date (for "current visit only" filter)
  const mostRecentVisitDate = useMemo(() => {
    const dates = tests.map((t) => t.last_tested).filter(Boolean) as string[];
    return dates.length > 0 ? dates.sort().reverse()[0] : null;
  }, [tests]);

  // Stale cutoff: 12 months ago
  const staleCutoff = useMemo(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 1);
    return d.toISOString().slice(0, 10);
  }, []);

  // Filtered + sorted tests
  const filteredTests = useMemo(() => {
    let result = tests;

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((t) =>
        t.display_name.toLowerCase().includes(q) ||
        t.canonical_name.toLowerCase().includes(q)
      );
    }

    if (selectedCategories.length > 0) {
      result = result.filter((t) => selectedCategories.includes(t.category));
    }

    if (status === "out_of_range") {
      result = result.filter((t) => t.latest?.in_range === false);
    } else if (status === "suboptimal") {
      result = result.filter((t) => isSuboptimal(t));
    } else if (status === "in_range") {
      result = result.filter((t) => t.latest?.in_range === true);
    }

    if (trending !== "any") {
      result = result.filter((t) => t.trend === trending);
    }

    if (currentVisitOnly && mostRecentVisitDate) {
      result = result.filter((t) => t.last_tested === mostRecentVisitDate);
    }

    if (hideStale) {
      result = result.filter((t) => t.last_tested && t.last_tested >= staleCutoff);
    }

    // Sort
    result = [...result].sort((a, b) => {
      if (sortBy === "last_tested") {
        return (b.last_tested ?? "").localeCompare(a.last_tested ?? "");
      }
      if (sortBy === "out_of_range_first") {
        const aAbn = a.latest?.in_range === false ? 0 : 1;
        const bAbn = b.latest?.in_range === false ? 0 : 1;
        if (aAbn !== bAbn) return aAbn - bAbn;
        return a.display_name.localeCompare(b.display_name);
      }
      return a.display_name.localeCompare(b.display_name);
    });

    return result;
  }, [tests, search, selectedCategories, status, trending, currentVisitOnly, hideStale, showOptimal, sortBy, mostRecentVisitDate, staleCutoff]);

  // Group by category for display
  const isFiltering = !!(search.trim() || selectedCategories.length > 0 || status !== "all" || trending !== "any" || currentVisitOnly || hideStale);

  const grouped = useMemo(() => {
    if (isFiltering) return null; // flat list when filtering
    const map = new Map<string, PanelTest[]>();
    for (const t of filteredTests) {
      const cat = t.category || "Other";
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(t);
    }
    return map;
  }, [filteredTests, isFiltering]);

  const orderedGroups = useMemo(() => {
    if (!grouped) return null;
    return [...grouped.entries()].sort(
      ([a], [b]) => CATEGORY_ORDER.indexOf(a) - CATEGORY_ORDER.indexOf(b)
    );
  }, [grouped]);

  const toggleCategory = (cat: string) => {
    setSelectedCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  };

  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  const [selectedTest, setSelectedTest] = useState<PanelTest | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);

  // Compare mode
  const [compareMode, setCompareMode] = useState(false);
  const [compareSelected, setCompareSelected] = useState<string[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);

  const toggleCompareSelect = (canonical: string) => {
    setCompareSelected((prev) =>
      prev.includes(canonical) ? prev.filter((c) => c !== canonical) : [...prev, canonical]
    );
  };

  const openCompare = () => {
    if (compareSelected.length >= 2) setCompareOpen(true);
  };

  const exitCompareMode = () => {
    setCompareMode(false);
    setCompareSelected([]);
    setCompareOpen(false);
  };

  const toggleCategoryCollapse = (cat: string) => {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      next.has(cat) ? next.delete(cat) : next.add(cat);
      return next;
    });
  };

  const abnormalCount = tests.filter((t) => t.latest?.in_range === false).length;
  const suboptimalCount = showOptimal ? tests.filter((t) => isSuboptimal(t)).length : 0;
  const hasActiveFilters = !!(search || selectedCategories.length || status !== "all" || trending !== "any" || currentVisitOnly || hideStale);

  return (
    <main className="p-4 sm:p-6 max-w-4xl mx-auto space-y-4">
      {/* Page header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Lab Panel</h1>
          {!loading && (
            <p className="text-sm text-muted-foreground mt-0.5">
              {tests.length} unique tests
              {abnormalCount > 0 && (
                <span className="text-red-600 ml-2">· {abnormalCount} abnormal</span>
              )}
              {suboptimalCount > 0 && (
                <span className="text-amber-600 ml-2">· {suboptimalCount} suboptimal</span>
              )}
            </p>
          )}
        </div>
        <div className="flex gap-2 flex-wrap">
          {compareMode ? (
            <>
              <Button
                size="sm"
                onClick={openCompare}
                disabled={compareSelected.length < 2}
              >
                Compare ({compareSelected.length})
              </Button>
              <Button variant="outline" size="sm" onClick={exitCompareMode}>
                Cancel
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCompareMode(true)}
                disabled={tests.length < 2}
              >
                Compare
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setManageOpen(true)}
                disabled={tests.length === 0}
              >
                Manage Tests
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => exportToCsv(filteredTests)}
                disabled={filteredTests.length === 0}
              >
                Export CSV
              </Button>
              <Button size="sm" onClick={() => setUploadOpen(true)}>
                + Upload Report
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Health systems radar */}
      {!loading && tests.length > 0 && (
        <LabSystemsRadar
          tests={tests}
          showOptimal={showOptimal}
          selectedCategories={selectedCategories}
          onCategoryToggle={toggleCategory}
        />
      )}

      {/* Filter bar */}
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2 items-center">
          {/* Search */}
          <input
            type="text"
            placeholder="Search tests..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 px-3 text-sm border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-ring flex-1 min-w-40"
          />

          {/* Status */}
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as StatusFilter)}
            className="h-8 px-2 text-sm border rounded-md bg-background focus:outline-none"
          >
            <option value="all">All statuses</option>
            <option value="out_of_range">Abnormal only</option>
            {showOptimal && <option value="suboptimal">Suboptimal only</option>}
            <option value="in_range">Normal only</option>
          </select>

          {/* Trending */}
          <select
            value={trending}
            onChange={(e) => setTrending(e.target.value as TrendFilter)}
            className="h-8 px-2 text-sm border rounded-md bg-background focus:outline-none"
          >
            <option value="any">Any trend</option>
            <option value="up">Trending up ↑</option>
            <option value="down">Trending down ↓</option>
            <option value="stable">Stable →</option>
          </select>

          {/* Sort */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortBy)}
            className="h-8 px-2 text-sm border rounded-md bg-background focus:outline-none"
          >
            <option value="name">Sort: Name</option>
            <option value="last_tested">Sort: Most Recent</option>
            <option value="out_of_range_first">Sort: Abnormal First</option>
          </select>
        </div>

        {/* Category pills */}
        <div className="flex flex-wrap gap-1.5 items-center">
          {ALL_CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => toggleCategory(cat)}
              className={cn(
                "px-2.5 py-0.5 rounded-full text-xs font-medium border transition-colors",
                selectedCategories.includes(cat)
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-muted-foreground border-border hover:border-primary/50 hover:text-foreground"
              )}
            >
              {cat}
            </button>
          ))}
          <div className="flex items-center gap-3 ml-1">
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
              <input
                type="checkbox"
                checked={currentVisitOnly}
                onChange={(e) => setCurrentVisitOnly(e.target.checked)}
                className="rounded"
              />
              Current visit only
            </label>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
              <input
                type="checkbox"
                checked={hideStale}
                onChange={(e) => setHideStale(e.target.checked)}
                className="rounded"
              />
              Hide stale (&gt;1yr)
            </label>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showOptimal}
                onChange={(e) => {
                  setShowOptimal(e.target.checked);
                  if (!e.target.checked && status === "suboptimal") setStatus("all");
                }}
                className="rounded"
              />
              Show optimal ranges
            </label>
          </div>
          {hasActiveFilters && (
            <button
              onClick={() => {
                setSearch(""); setSelectedCategories([]); setStatus("all");
                setTrending("any"); setCurrentVisitOnly(false); setHideStale(false);
              }}
              className="text-xs text-muted-foreground hover:text-foreground underline ml-1"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      {loading && showLoader ? (
        <LoadingScreen>
          <LabsLoader />
        </LoadingScreen>
      ) : filteredTests.length === 0 && !loading ? (
        <div className="text-sm text-muted-foreground py-8 text-center">
          {hasActiveFilters ? "No tests match the current filters." : "No lab results found."}
        </div>
      ) : isFiltering ? (
        /* Flat list when filtering */
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">{filteredTests.length} result{filteredTests.length !== 1 ? "s" : ""}</p>
          {filteredTests.map((t) => (
            <CompareableTestCard
              key={t.canonical_name}
              test={t}
              showOptimal={showOptimal}
              compareMode={compareMode}
              selected={compareSelected.includes(t.canonical_name)}
              onToggle={() => toggleCompareSelect(t.canonical_name)}
              onClick={() => { if (!compareMode) { setSelectedTest(t); setDetailOpen(true); } }}
            />
          ))}
        </div>
      ) : (
        /* Grouped by category */
        <div className="space-y-4">
          {orderedGroups!.map(([category, categoryTests]) => {
            const isCollapsed = collapsedCategories.has(category);
            const abnormal = categoryTests.filter((t) => t.latest?.in_range === false).length;
            return (
              <div key={category}>
                <button
                  onClick={() => toggleCategoryCollapse(category)}
                  className="flex items-center gap-2 mb-2 w-full text-left group"
                >
                  <svg
                    className={cn("h-3 w-3 text-muted-foreground transition-transform", isCollapsed && "-rotate-90")}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="m19 9-7 7-7-7" />
                  </svg>
                  <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide group-hover:text-foreground transition-colors">
                    {category}
                  </h2>
                  <span className="text-xs text-muted-foreground">({categoryTests.length})</span>
                  {abnormal > 0 && (
                    <span className="text-xs text-red-500 font-medium">{abnormal} abnormal</span>
                  )}
                </button>
                {!isCollapsed && (
                  <div className="space-y-1.5">
                    {categoryTests.map((t) => (
                      <CompareableTestCard
                        key={t.canonical_name}
                        test={t}
                        showOptimal={showOptimal}
                        compareMode={compareMode}
                        selected={compareSelected.includes(t.canonical_name)}
                        onToggle={() => toggleCompareSelect(t.canonical_name)}
                        onClick={() => { if (!compareMode) { setSelectedTest(t); setDetailOpen(true); } }}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      <LabTestDetailSheet
        test={selectedTest}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        showOptimal={showOptimal}
        allTests={tests}
      />
      <LabCompareSheet
        open={compareOpen}
        onClose={() => setCompareOpen(false)}
        selectedTests={tests.filter((t) => compareSelected.includes(t.canonical_name))}
        allTests={tests}
        onAddTest={(c) => setCompareSelected((prev) => [...prev, c])}
        onRemoveTest={(c) => setCompareSelected((prev) => prev.filter((x) => x !== c))}
      />
      <ManageTestsSheet
        open={manageOpen}
        onOpenChange={setManageOpen}
        tests={tests}
        onChanged={fetchTests}
      />
      <LabUploadSheet
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onSaved={() => { setUploadOpen(false); fetchTests(); }}
      />
    </main>
  );
}
