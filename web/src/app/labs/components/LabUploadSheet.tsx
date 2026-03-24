"use client";

import { useState, useRef } from "react";
import { getAuthHeaders } from "@/lib/authHeaders";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { CalendarInput } from "@/components/ui/calendar-input";
import { cn } from "@/lib/utils";

interface ParsedResult {
  test_name: string;
  category: string | null;
  value: number | null;
  unit: string | null;
  ref_low: number | null;
  ref_high: number | null;
  ref_text: string | null;
  in_range: boolean | null;
}

interface ParsedData {
  visit_date: string | null;
  lab_name: string | null;
  provider: string | null;
  results: ParsedResult[];
}

const CATEGORIES = ["CBC", "Metabolic", "Lipid", "Thyroid", "Hormone", "Vitamin", "Urinalysis", "Other"];
const CATEGORY_ORDER = ["CBC", "Metabolic", "Lipid", "Thyroid", "Hormone", "Vitamin", "Urinalysis", "Other"];

function inferInRange(r: ParsedResult): boolean | null {
  if (r.value == null) return null;
  if (r.ref_low != null && r.ref_high != null) return r.value >= r.ref_low && r.value <= r.ref_high;
  if (r.ref_low != null) return r.value >= r.ref_low;
  if (r.ref_high != null) return r.value <= r.ref_high;
  return null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export default function LabUploadSheet({ open, onClose, onSaved }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<"upload" | "review">("upload");
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [visitDate, setVisitDate] = useState("");
  const [labName, setLabName] = useState("");
  const [provider, setProvider] = useState("");
  const [results, setResults] = useState<ParsedResult[]>([]);
  const [fileName, setFileName] = useState("");

  const reset = () => {
    setStep("upload");
    setParsing(false);
    setSaving(false);
    setError(null);
    setVisitDate("");
    setLabName("");
    setProvider("");
    setResults([]);
    setFileName("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setError(null);
    setParsing(true);

    try {
      const headers = await getAuthHeaders();
      const form = new FormData();
      form.append("file", file);

      const res = await fetch("/api/labs/parse", {
        method: "POST",
        headers, // no Content-Type — browser sets multipart boundary
        body: form,
      });

      const json: ParsedData | { error: string } = await res.json();
      if (!res.ok || "error" in json) {
        throw new Error(("error" in json ? json.error : null) || "Parse failed");
      }

      const data = json as ParsedData;
      setVisitDate(data.visit_date || "");
      setLabName(data.lab_name || "");
      setProvider(data.provider || "");

      // Re-infer in_range to be safe
      setResults(data.results.map((r) => ({ ...r, in_range: inferInRange(r) })));
      setStep("review");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Parse failed");
    } finally {
      setParsing(false);
    }
  };

  const updateResult = (i: number, field: keyof ParsedResult, raw: string) => {
    setResults((prev) => {
      const updated = [...prev];
      const r = { ...updated[i] };

      if (field === "value" || field === "ref_low" || field === "ref_high") {
        (r as Record<string, unknown>)[field] = raw === "" ? null : parseFloat(raw);
      } else if (field === "in_range") {
        (r as Record<string, unknown>)[field] = raw === "true" ? true : raw === "false" ? false : null;
      } else {
        (r as Record<string, unknown>)[field] = raw || null;
      }

      // Re-infer in_range when numeric fields change
      if (field === "value" || field === "ref_low" || field === "ref_high") {
        r.in_range = inferInRange(r);
      }

      updated[i] = r;
      return updated;
    });
  };

  const removeResult = (i: number) => setResults((prev) => prev.filter((_, idx) => idx !== i));

  const addRow = () => setResults((prev) => [
    ...prev,
    { test_name: "", category: "Other", value: null, unit: null, ref_low: null, ref_high: null, ref_text: null, in_range: null },
  ]);

  const handleSave = async () => {
    if (!visitDate) { setError("Visit date is required"); return; }
    setSaving(true);
    setError(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/labs/visits", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ visit_date: visitDate, lab_name: labName || null, provider: provider || null, results }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Save failed");
      reset();
      onSaved();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  // Sort results by category order
  const sortedResults = [...results].sort((a, b) => {
    const ai = CATEGORY_ORDER.indexOf(a.category || "Other");
    const bi = CATEGORY_ORDER.indexOf(b.category || "Other");
    return ai - bi;
  });

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <SheetContent side="right" className="sm:max-w-2xl w-full overflow-hidden flex flex-col">
        <SheetHeader className="flex-shrink-0">
          <SheetTitle>{step === "upload" ? "Upload Lab Report" : "Review Results"}</SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto mt-4 pr-1">
          {error && (
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 text-destructive text-sm px-4 py-3 mb-4">
              {error}
            </div>
          )}

          {step === "upload" && (
            <div className="space-y-6">
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-border rounded-xl p-10 flex flex-col items-center justify-center gap-3 cursor-pointer hover:border-primary/50 hover:bg-accent/20 transition-colors"
              >
                {parsing ? (
                  <>
                    <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    <p className="text-sm text-muted-foreground">Parsing {fileName}…</p>
                    <p className="text-xs text-muted-foreground">Claude is extracting your lab results</p>
                  </>
                ) : (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-10 h-10 text-muted-foreground">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m6.75 12-3-3m0 0-3 3m3-3v6m-1.5-15H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                    </svg>
                    <p className="text-sm font-medium">Click to upload a PDF lab report</p>
                    <p className="text-xs text-muted-foreground">Quest, LabCorp, hospital labs — any format</p>
                  </>
                )}
              </div>
              <input ref={fileInputRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={handleFileSelect} disabled={parsing} />

              <div className="border-t pt-4">
                <p className="text-xs text-muted-foreground font-medium mb-3">Or enter manually</p>
                <Button variant="outline" className="w-full" onClick={() => {
                  setVisitDate(""); setLabName(""); setProvider(""); setResults([]);
                  addRow(); setStep("review");
                }}>
                  Manual Entry
                </Button>
              </div>
            </div>
          )}

          {step === "review" && (
            <div className="space-y-4">
              {/* Visit metadata */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">Visit Date *</label>
                  <CalendarInput value={visitDate} onChange={setVisitDate} placeholder="Select date" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Lab / Facility</label>
                  <input
                    value={labName}
                    onChange={(e) => setLabName(e.target.value)}
                    placeholder="e.g. Quest Diagnostics"
                    className="w-full h-9 px-3 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Provider</label>
                  <input
                    value={provider}
                    onChange={(e) => setProvider(e.target.value)}
                    placeholder="Ordering provider"
                    className="w-full h-9 px-3 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              </div>

              {/* Results table */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium">{results.length} results</p>
                  <button onClick={addRow} className="text-xs text-primary hover:underline">+ Add row</button>
                </div>

                <div className="space-y-1">
                  {/* Header */}
                  <div className="grid gap-1 text-xs text-muted-foreground font-medium px-1 hidden sm:grid" style={{ gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr 1fr auto" }}>
                    <span>Test</span><span>Category</span><span>Value</span><span>Unit</span><span>Ref Low</span><span>Ref High</span><span></span>
                  </div>

                  {sortedResults.map((r, i) => {
                    const origIdx = results.indexOf(r);
                    const inRange = r.in_range;
                    return (
                      <div
                        key={i}
                        className={cn(
                          "grid gap-1 items-center rounded-lg px-1 py-1",
                          inRange === false ? "bg-red-500/5 border border-red-500/20" : "bg-muted/30"
                        )}
                        style={{ gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr 1fr auto" }}
                      >
                        <input
                          value={r.test_name}
                          onChange={(e) => updateResult(origIdx, "test_name", e.target.value)}
                          className="h-7 px-2 border rounded text-xs bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                          placeholder="Test name"
                        />
                        <select
                          value={r.category || "Other"}
                          onChange={(e) => updateResult(origIdx, "category", e.target.value)}
                          className="h-7 px-1 border rounded text-xs bg-background focus:outline-none"
                        >
                          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                        </select>
                        <input
                          type="number"
                          value={r.value ?? ""}
                          onChange={(e) => updateResult(origIdx, "value", e.target.value)}
                          className={cn("h-7 px-2 border rounded text-xs bg-background focus:outline-none focus:ring-1 focus:ring-ring font-mono",
                            inRange === false ? "text-red-600 font-semibold" : "")}
                          placeholder="—"
                        />
                        <input
                          value={r.unit || ""}
                          onChange={(e) => updateResult(origIdx, "unit", e.target.value)}
                          className="h-7 px-2 border rounded text-xs bg-background focus:outline-none"
                          placeholder="unit"
                        />
                        <input
                          type="number"
                          value={r.ref_low ?? ""}
                          onChange={(e) => updateResult(origIdx, "ref_low", e.target.value)}
                          className="h-7 px-2 border rounded text-xs bg-background focus:outline-none"
                          placeholder="—"
                        />
                        <input
                          type="number"
                          value={r.ref_high ?? ""}
                          onChange={(e) => updateResult(origIdx, "ref_high", e.target.value)}
                          className="h-7 px-2 border rounded text-xs bg-background focus:outline-none"
                          placeholder="—"
                        />
                        <button onClick={() => removeResult(origIdx)} className="text-muted-foreground hover:text-destructive text-xs px-1">✕</button>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex gap-2 pt-2 border-t">
                <Button variant="outline" onClick={() => setStep("upload")} disabled={saving}>Back</Button>
                <Button onClick={handleSave} disabled={saving || !visitDate} className="flex-1">
                  {saving ? "Saving…" : `Save ${results.length} Results`}
                </Button>
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
