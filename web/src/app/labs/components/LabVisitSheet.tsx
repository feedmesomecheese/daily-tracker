"use client";

import { useState } from "react";
import { getAuthHeaders } from "@/lib/authHeaders";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { LabVisit, LabResult } from "../page";

const CATEGORY_ORDER = ["CBC", "Metabolic", "Lipid", "Thyroid", "Hormone", "Vitamin", "Urinalysis", "Other"];
const CATEGORIES = ["CBC", "Metabolic", "Lipid", "Thyroid", "Hormone", "Vitamin", "Urinalysis", "Other"];

function formatDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric", timeZone: "UTC",
  });
}

// ── View mode result row ────────────────────────────────────────────────────

function ResultRow({ result }: { result: LabResult }) {
  const { test_name, value, unit, ref_low, ref_high, ref_text, in_range } = result;

  const refDisplay = ref_text ?? (
    ref_low != null && ref_high != null ? `${ref_low} – ${ref_high}` :
    ref_low != null ? `≥ ${ref_low}` :
    ref_high != null ? `≤ ${ref_high}` : ""
  );

  return (
    <div className={cn(
      "flex items-center justify-between px-3 py-2 rounded-lg text-sm",
      in_range === false ? "bg-red-500/8 border border-red-500/20" : "bg-muted/30"
    )}>
      <div className="flex-1 min-w-0">
        <span className={cn("font-medium", in_range === false && "text-red-600")}>{test_name}</span>
        {refDisplay && <span className="text-xs text-muted-foreground ml-2">({refDisplay} {unit || ""})</span>}
      </div>
      <div className="flex items-center gap-2 shrink-0 ml-3">
        {value != null && (
          <span className={cn("font-mono font-semibold tabular-nums", in_range === false ? "text-red-600" : "")}>
            {value}{unit ? ` ${unit}` : ""}
          </span>
        )}
        {in_range === false && (
          <span className="text-xs bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 px-1.5 py-0.5 rounded font-medium">
            Abnormal
          </span>
        )}
        {in_range === true && (
          <span className="text-xs text-green-600 dark:text-green-400">✓</span>
        )}
      </div>
    </div>
  );
}

// ── Edit mode types ─────────────────────────────────────────────────────────

type EditableResult = {
  _key: string;
  id: string | null;
  test_name: string;
  canonical_name: string;
  category: string;
  value: string;
  unit: string;
  ref_low: string;
  ref_high: string;
  ref_text: string;
  notes: string;
  _deleted: boolean;
};

type EditVisit = {
  visit_date: string;
  lab_name: string;
  provider: string;
  notes: string;
};

function resultToEditable(r: LabResult): EditableResult {
  return {
    _key: r.id,
    id: r.id,
    test_name: r.test_name,
    canonical_name: r.canonical_name ?? "",
    category: r.category ?? "Other",
    value: r.value != null ? String(r.value) : "",
    unit: r.unit ?? "",
    ref_low: r.ref_low != null ? String(r.ref_low) : "",
    ref_high: r.ref_high != null ? String(r.ref_high) : "",
    ref_text: r.ref_text ?? "",
    notes: r.notes ?? "",
    _deleted: false,
  };
}

function computeInRange(value: string, refLow: string, refHigh: string): boolean | null {
  const v = parseFloat(value);
  if (isNaN(v)) return null;
  const lo = refLow !== "" ? parseFloat(refLow) : null;
  const hi = refHigh !== "" ? parseFloat(refHigh) : null;
  if ((lo === null || isNaN(lo)) && (hi === null || isNaN(hi))) return null;
  if (lo !== null && !isNaN(lo) && v < lo) return false;
  if (hi !== null && !isNaN(hi) && v > hi) return false;
  return true;
}

let _keyCounter = 0;
function newKey() { return `new-${++_keyCounter}`; }


// ── Main component ──────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  visit: LabVisit;
  onUpdated: () => void;
  onDeleted: () => void;
}

export default function LabVisitSheet({ open, onOpenChange, visit, onUpdated, onDeleted }: Props) {
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [editVisit, setEditVisit] = useState<EditVisit>({ visit_date: "", lab_name: "", provider: "", notes: "" });
  const [editResults, setEditResults] = useState<EditableResult[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const enterEditMode = () => {
    setEditVisit({
      visit_date: visit.visit_date,
      lab_name: visit.lab_name ?? "",
      provider: visit.provider ?? "",
      notes: visit.notes ?? "",
    });
    setEditResults(visit.lab_results.map(resultToEditable));
    setError(null);
    setMode("edit");
  };

  const cancelEdit = () => {
    setMode("view");
    setError(null);
  };

  const handleSave = async () => {
    if (!editVisit.visit_date) { setError("Visit date is required"); return; }
    setSaving(true);
    setError(null);
    try {
      const headers = await getAuthHeaders();
      const jsonHeaders = { ...headers, "Content-Type": "application/json" };

      // 1. Update visit metadata
      const visitRes = await fetch(`/api/labs/visits/${visit.id}`, {
        method: "PATCH",
        headers: jsonHeaders,
        body: JSON.stringify({
          visit_date: editVisit.visit_date,
          lab_name: editVisit.lab_name || null,
          provider: editVisit.provider || null,
          notes: editVisit.notes || null,
        }),
      });
      if (!visitRes.ok) throw new Error((await visitRes.json()).error ?? "Failed to update visit");

      // 2. Process results in parallel
      await Promise.all(editResults.map(async (r) => {
        if (r._deleted) {
          if (r.id) {
            await fetch(`/api/labs/results/${r.id}`, { method: "DELETE", headers });
          }
          return;
        }

        const body = {
          test_name: r.test_name,
          canonical_name: r.canonical_name || null,
          category: r.category || null,
          value: r.value !== "" ? parseFloat(r.value) : null,
          unit: r.unit || null,
          ref_low: r.ref_low !== "" ? parseFloat(r.ref_low) : null,
          ref_high: r.ref_high !== "" ? parseFloat(r.ref_high) : null,
          ref_text: r.ref_text || null,
          in_range: computeInRange(r.value, r.ref_low, r.ref_high),
          notes: r.notes || null,
        };

        if (r.id) {
          await fetch(`/api/labs/results/${r.id}`, {
            method: "PATCH", headers: jsonHeaders, body: JSON.stringify(body),
          });
        } else {
          await fetch(`/api/labs/visits/${visit.id}/results`, {
            method: "POST", headers: jsonHeaders, body: JSON.stringify(body),
          });
        }
      }));

      setMode("view");
      onUpdated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const updateResult = (key: string, updates: Partial<EditableResult>) => {
    setEditResults((prev) => prev.map((r) => r._key === key ? { ...r, ...updates } : r));
  };

  const deleteResult = (key: string) => {
    setEditResults((prev) => prev.map((r) => r._key === key ? { ...r, _deleted: true } : r));
  };

  const addResult = () => {
    setEditResults((prev) => [...prev, {
      _key: newKey(),
      id: null,
      test_name: "",
      canonical_name: "",
      category: "Other",
      value: "",
      unit: "",
      ref_low: "",
      ref_high: "",
      ref_text: "",
      notes: "",
      _deleted: false,
    }]);
  };

  const handleDeleteVisit = async () => {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    setDeleting(true);
    try {
      const headers = await getAuthHeaders();
      await fetch(`/api/labs/visits/${visit.id}`, { method: "DELETE", headers });
      onDeleted();
    } catch { /* ignore */ }
    finally { setDeleting(false); setConfirmDelete(false); }
  };

  // View mode grouping
  const grouped: Record<string, LabResult[]> = {};
  for (const r of visit.lab_results) {
    const cat = r.category || "Other";
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(r);
  }
  const orderedCategories = Object.keys(grouped).sort(
    (a, b) => CATEGORY_ORDER.indexOf(a) - CATEGORY_ORDER.indexOf(b)
  );
  const abnormalCount = visit.lab_results.filter((r) => r.in_range === false).length;

  const visibleEditResults = editResults.filter((r) => !r._deleted);

  const inputCls = "w-full h-8 px-2 text-sm border rounded bg-background focus:outline-none focus:ring-1 focus:ring-ring";

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) { setMode("view"); setConfirmDelete(false); } onOpenChange(v); }}>
      <SheetContent side="right" className="overflow-hidden flex flex-col" storageKey="lab_visit_sheet_width" defaultWidth={576}>
        <SheetHeader className="flex-shrink-0">
          {mode === "view" ? (
            <>
              <div className="flex items-start justify-between gap-2 pr-8">
                <div>
                  <SheetTitle>{formatDate(visit.visit_date)}</SheetTitle>
                  <div className="text-sm text-muted-foreground mt-0.5">
                    {[visit.lab_name, visit.provider].filter(Boolean).join(" · ")}
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={enterEditMode} className="shrink-0 mt-0.5">
                  Edit
                </Button>
              </div>
            </>
          ) : (
            <div className="pr-8">
              <SheetTitle className="mb-3">Edit Visit</SheetTitle>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-muted-foreground">Date</label>
                  <input
                    type="date"
                    className={inputCls}
                    value={editVisit.visit_date}
                    onChange={(e) => setEditVisit((v) => ({ ...v, visit_date: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Lab</label>
                  <input
                    className={inputCls}
                    placeholder="Lab name"
                    value={editVisit.lab_name}
                    onChange={(e) => setEditVisit((v) => ({ ...v, lab_name: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Provider</label>
                  <input
                    className={inputCls}
                    placeholder="Provider"
                    value={editVisit.provider}
                    onChange={(e) => setEditVisit((v) => ({ ...v, provider: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Notes</label>
                  <input
                    className={inputCls}
                    placeholder="Notes"
                    value={editVisit.notes}
                    onChange={(e) => setEditVisit((v) => ({ ...v, notes: e.target.value }))}
                  />
                </div>
              </div>
            </div>
          )}
        </SheetHeader>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto mt-4 space-y-4">

          {/* ── VIEW MODE ── */}
          {mode === "view" && (
            <>
              <div className="flex gap-4 text-sm">
                <div>
                  <span className="font-semibold">{visit.lab_results.length}</span>
                  <span className="text-muted-foreground ml-1">tests</span>
                </div>
                {abnormalCount > 0 && (
                  <div>
                    <span className="font-semibold text-red-600">{abnormalCount}</span>
                    <span className="text-muted-foreground ml-1">abnormal</span>
                  </div>
                )}
                <div>
                  <span className="font-semibold text-green-600">
                    {visit.lab_results.filter((r) => r.in_range === true).length}
                  </span>
                  <span className="text-muted-foreground ml-1">normal</span>
                </div>
              </div>

              {orderedCategories.map((cat) => (
                <div key={cat}>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">{cat}</p>
                  <div className="space-y-1">
                    {grouped[cat].map((r) => <ResultRow key={r.id} result={r} />)}
                  </div>
                </div>
              ))}

              {visit.notes && (
                <div className="rounded-lg bg-muted/30 px-3 py-2 text-sm">
                  <p className="text-xs text-muted-foreground font-medium mb-1">Notes</p>
                  <p>{visit.notes}</p>
                </div>
              )}

              <div className="border-t pt-4">
                {confirmDelete ? (
                  <div className="flex gap-2 items-center">
                    <p className="text-sm text-destructive flex-1">Delete this visit and all results?</p>
                    <Button variant="outline" size="sm" onClick={() => setConfirmDelete(false)}>Cancel</Button>
                    <Button variant="destructive" size="sm" onClick={handleDeleteVisit} disabled={deleting}>
                      {deleting ? "Deleting…" : "Delete"}
                    </Button>
                  </div>
                ) : (
                  <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive" onClick={handleDeleteVisit}>
                    Delete visit
                  </Button>
                )}
              </div>
            </>
          )}

          {/* ── EDIT MODE ── */}
          {mode === "edit" && (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-separate border-spacing-y-0.5" style={{ minWidth: 520 }}>
                  <colgroup>
                    <col style={{ minWidth: 140 }} />
                    <col style={{ width: 100 }} />
                    <col style={{ width: 72 }} />
                    <col style={{ width: 80 }} />
                    <col style={{ width: 72 }} />
                    <col style={{ width: 72 }} />
                    <col style={{ width: 28 }} />
                  </colgroup>
                  <thead>
                    <tr className="text-muted-foreground font-medium">
                      <th className="text-left px-2 pb-1 font-medium">Test</th>
                      <th className="text-left px-2 pb-1 font-medium">Category</th>
                      <th className="text-left px-2 pb-1 font-medium">Value</th>
                      <th className="text-left px-2 pb-1 font-medium">Unit</th>
                      <th className="text-left px-2 pb-1 font-medium">Ref Low</th>
                      <th className="text-left px-2 pb-1 font-medium">Ref High</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {visibleEditResults.map((r) => (
                      <tr key={r._key} className={cn(r.id && computeInRange(r.value, r.ref_low, r.ref_high) === false ? "bg-red-500/5" : "bg-muted/30")}>
                        <td className="px-1 py-0.5">
                          <input
                            value={r.test_name}
                            onChange={(e) => updateResult(r._key, { test_name: e.target.value })}
                            className="w-full h-7 px-2 border rounded text-xs bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                            placeholder="Test name"
                          />
                          <input
                            value={r.canonical_name}
                            onChange={(e) => updateResult(r._key, { canonical_name: e.target.value })}
                            className={cn(
                              "w-full h-6 px-2 mt-0.5 border border-dashed rounded text-xs bg-background focus:outline-none focus:ring-1 focus:ring-ring",
                              r.canonical_name ? "text-muted-foreground" : "text-muted-foreground/40"
                            )}
                            placeholder="+ link name"
                            title="Canonical name — links this test across labs for trend tracking"
                          />
                        </td>
                        <td className="px-1 py-0.5">
                          <select
                            value={r.category}
                            onChange={(e) => updateResult(r._key, { category: e.target.value })}
                            className="w-full h-7 px-1 border rounded text-xs bg-background focus:outline-none"
                          >
                            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                          </select>
                        </td>
                        <td className="px-1 py-0.5">
                          <input
                            type="number"
                            value={r.value}
                            onChange={(e) => updateResult(r._key, { value: e.target.value })}
                            className="w-full h-7 px-2 border rounded text-xs bg-background focus:outline-none font-mono"
                            placeholder="—"
                          />
                        </td>
                        <td className="px-1 py-0.5">
                          <input
                            value={r.unit}
                            onChange={(e) => updateResult(r._key, { unit: e.target.value })}
                            className="w-full h-7 px-2 border rounded text-xs bg-background focus:outline-none"
                            placeholder="—"
                          />
                        </td>
                        <td className="px-1 py-0.5">
                          <input
                            type="number"
                            value={r.ref_low}
                            onChange={(e) => updateResult(r._key, { ref_low: e.target.value })}
                            className="w-full h-7 px-2 border rounded text-xs bg-background focus:outline-none"
                            placeholder="—"
                          />
                        </td>
                        <td className="px-1 py-0.5">
                          <input
                            type="number"
                            value={r.ref_high}
                            onChange={(e) => updateResult(r._key, { ref_high: e.target.value })}
                            className="w-full h-7 px-2 border rounded text-xs bg-background focus:outline-none"
                            placeholder="—"
                          />
                        </td>
                        <td className="px-1 py-0.5 text-center">
                          <button
                            onClick={() => deleteResult(r._key)}
                            className="text-muted-foreground hover:text-destructive px-1"
                            title="Remove result"
                          >✕</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <Button variant="outline" size="sm" className="w-full" onClick={addResult}>
                + Add Result
              </Button>

              {error && (
                <div className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded">
                  {error}
                </div>
              )}

              <div className="border-t pt-4 flex gap-2">
                <Button onClick={handleSave} disabled={saving}>
                  {saving ? "Saving…" : "Save Changes"}
                </Button>
                <Button variant="outline" onClick={cancelEdit} disabled={saving}>
                  Cancel
                </Button>
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
