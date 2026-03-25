"use client";

import { useState } from "react";
import { getAuthHeaders } from "@/lib/authHeaders";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { LabVisit, LabResult } from "../page";

const CATEGORY_ORDER = ["CBC", "Metabolic", "Lipid", "Thyroid", "Hormone", "Vitamin", "Urinalysis", "Other"];

function formatDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric", timeZone: "UTC",
  });
}

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

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  visit: LabVisit;
  onUpdated: () => void;
  onDeleted: () => void;
}

export default function LabVisitSheet({ open, onOpenChange, visit, onUpdated, onDeleted }: Props) {
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleDelete = async () => {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    setDeleting(true);
    try {
      const headers = await getAuthHeaders();
      await fetch(`/api/labs/visits/${visit.id}`, { method: "DELETE", headers });
      onDeleted();
    } catch { /* ignore */ }
    finally { setDeleting(false); setConfirmDelete(false); }
  };

  // Group results by category
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

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="sm:max-w-xl w-full overflow-hidden flex flex-col" storageKey="lab_visit_sheet_width" defaultWidth={576}>
        <SheetHeader className="flex-shrink-0">
          <SheetTitle>{formatDate(visit.visit_date)}</SheetTitle>
          <div className="text-sm text-muted-foreground">
            {[visit.lab_name, visit.provider].filter(Boolean).join(" · ")}
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto mt-4 space-y-4">
          {/* Summary bar */}
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

          {/* Results by category */}
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

          {/* Delete */}
          <div className="border-t pt-4">
            {confirmDelete ? (
              <div className="flex gap-2 items-center">
                <p className="text-sm text-destructive flex-1">Delete this visit and all results?</p>
                <Button variant="outline" size="sm" onClick={() => setConfirmDelete(false)}>Cancel</Button>
                <Button variant="destructive" size="sm" onClick={handleDelete} disabled={deleting}>
                  {deleting ? "Deleting…" : "Delete"}
                </Button>
              </div>
            ) : (
              <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive" onClick={handleDelete}>
                Delete visit
              </Button>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
