"use client";

import { useEffect, useState, useCallback } from "react";
import { getAuthHeaders } from "@/lib/authHeaders";
import { Button } from "@/components/ui/button";
import LabUploadSheet from "./components/LabUploadSheet";
import LabVisitSheet from "./components/LabVisitSheet";

export interface LabResult {
  id: string;
  test_name: string;
  canonical_name: string | null;
  category: string | null;
  value: number | null;
  unit: string | null;
  ref_low: number | null;
  ref_high: number | null;
  ref_text: string | null;
  in_range: boolean | null;
  notes: string | null;
}

export interface LabVisit {
  id: string;
  visit_date: string;
  lab_name: string | null;
  provider: string | null;
  notes: string | null;
  lab_results: LabResult[];
}

const CATEGORY_ORDER = ["CBC", "Metabolic", "Lipid", "Thyroid", "Hormone", "Vitamin", "Urinalysis", "Other"];

function formatDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric", timeZone: "UTC",
  });
}

function VisitCard({ visit, onClick }: { visit: LabVisit; onClick: () => void }) {
  const abnormal = visit.lab_results.filter((r) => r.in_range === false);
  const categories = [...new Set(visit.lab_results.map((r) => r.category).filter(Boolean))];
  categories.sort((a, b) => CATEGORY_ORDER.indexOf(a!) - CATEGORY_ORDER.indexOf(b!));

  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-xl border bg-card p-4 hover:bg-accent/30 transition-colors"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-base">{formatDate(visit.visit_date)}</p>
          {(visit.lab_name || visit.provider) && (
            <p className="text-sm text-muted-foreground mt-0.5">
              {[visit.lab_name, visit.provider].filter(Boolean).join(" · ")}
            </p>
          )}
          {categories.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {categories.map((c) => (
                <span key={c} className="text-xs bg-muted px-2 py-0.5 rounded-full">{c}</span>
              ))}
            </div>
          )}
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm font-medium">{visit.lab_results.length} tests</p>
          {abnormal.length > 0 && (
            <p className="text-xs text-red-500 font-medium mt-0.5">{abnormal.length} abnormal</p>
          )}
        </div>
      </div>
    </button>
  );
}

export default function LabsPage() {
  const [visits, setVisits] = useState<LabVisit[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [selectedVisit, setSelectedVisit] = useState<LabVisit | null>(null);
  const [visitSheetOpen, setVisitSheetOpen] = useState(false);

  const fetchVisits = useCallback(async () => {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/labs/visits", { headers });
      if (res.ok) setVisits(await res.json());
    } catch { /* best effort */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchVisits(); }, [fetchVisits]);

  const handleVisitClick = (visit: LabVisit) => {
    setSelectedVisit(visit);
    setVisitSheetOpen(true);
  };

  const handleSaved = () => {
    setUploadOpen(false);
    fetchVisits();
  };

  const handleVisitUpdated = () => {
    fetchVisits();
  };

  const handleVisitDeleted = () => {
    setVisitSheetOpen(false);
    fetchVisits();
  };

  return (
    <main className="max-w-2xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Lab Results</h1>
        <Button onClick={() => setUploadOpen(true)}>+ Upload Report</Button>
      </div>

      {loading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 bg-muted animate-pulse rounded-xl" />
          ))}
        </div>
      )}

      {!loading && visits.length === 0 && (
        <div className="text-center py-20">
          <p className="text-muted-foreground text-sm mb-4">No lab results yet.</p>
          <Button variant="outline" onClick={() => setUploadOpen(true)}>
            Upload your first lab report
          </Button>
        </div>
      )}

      {!loading && visits.length > 0 && (
        <div className="space-y-3">
          {visits.map((v) => (
            <VisitCard key={v.id} visit={v} onClick={() => handleVisitClick(v)} />
          ))}
        </div>
      )}

      <LabUploadSheet
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onSaved={handleSaved}
      />

      {selectedVisit && (
        <LabVisitSheet
          open={visitSheetOpen}
          onOpenChange={setVisitSheetOpen}
          visit={selectedVisit}
          onUpdated={handleVisitUpdated}
          onDeleted={handleVisitDeleted}
        />
      )}
    </main>
  );
}
