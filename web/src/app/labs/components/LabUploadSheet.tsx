"use client";

import { useState, useRef, useCallback, useEffect } from "react";
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

interface VisitDraft {
  fileName: string;
  visitDate: string;
  labName: string;
  provider: string;
  results: ParsedResult[];
  error?: string;
  expanded: boolean;
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
  const dragCounterRef = useRef(0);

  // Resizable sheet width
  const MIN_WIDTH = 400;
  const [sheetWidth, setSheetWidth] = useState<number>(() => {
    if (typeof window === "undefined") return 720;
    return Math.min(parseInt(localStorage.getItem("labs_sheet_width") ?? "720", 10) || 720, window.innerWidth - 48);
  });
  const isResizing = useRef(false);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!isResizing.current) return;
      const newWidth = Math.min(Math.max(window.innerWidth - e.clientX, MIN_WIDTH), window.innerWidth - 48);
      setSheetWidth(newWidth);
    };
    const onMouseUp = () => {
      if (!isResizing.current) return;
      isResizing.current = false;
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      setSheetWidth((w) => { localStorage.setItem("labs_sheet_width", String(w)); return w; });
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => { window.removeEventListener("mousemove", onMouseMove); window.removeEventListener("mouseup", onMouseUp); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [step, setStep] = useState<"upload" | "review">("upload");
  const [parsing, setParsing] = useState(false);
  const [parseProgress, setParseProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [visits, setVisits] = useState<VisitDraft[]>([]);
  const [dragging, setDragging] = useState(false);

  const reset = () => {
    setStep("upload");
    setParsing(false);
    setParseProgress({ done: 0, total: 0 });
    setSaving(false);
    setError(null);
    setVisits([]);
    setDragging(false);
    dragCounterRef.current = 0;
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleClose = () => { reset(); onClose(); };

  const parseFile = async (file: File): Promise<VisitDraft> => {
    try {
      const headers = await getAuthHeaders();
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/labs/parse", { method: "POST", headers, body: form });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || "Parse failed");
      return {
        fileName: file.name,
        visitDate: json.visit_date || "",
        labName: json.lab_name || "",
        provider: json.provider || "",
        results: (json.results || []).map((r: ParsedResult) => ({ ...r, in_range: inferInRange(r) })),
        expanded: true,
      };
    } catch (err: unknown) {
      return {
        fileName: file.name,
        visitDate: "",
        labName: "",
        provider: "",
        results: [],
        error: err instanceof Error ? err.message : "Failed to parse",
        expanded: true,
      };
    }
  };

  const processFiles = useCallback(async (files: File[]) => {
    const pdfs = files.filter((f) => f.name.toLowerCase().endsWith(".pdf"));
    if (pdfs.length === 0) { setError("Please select PDF files only"); return; }
    if (pdfs.length > 100) { setError("Maximum 100 files at once"); return; }

    setError(null);
    setParsing(true);
    setParseProgress({ done: 0, total: pdfs.length });

    // Parse in parallel, updating progress as each completes
    const results: VisitDraft[] = new Array(pdfs.length);
    await Promise.all(
      pdfs.map(async (file, i) => {
        results[i] = await parseFile(file);
        setParseProgress((prev) => ({ ...prev, done: prev.done + 1 }));
      })
    );

    // Sort by visit date desc
    results.sort((a, b) => b.visitDate.localeCompare(a.visitDate));
    setVisits(results);
    setParsing(false);
    setStep("review");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length) processFiles(files);
  };

  // Drag and drop handlers — use a counter to avoid flicker when crossing child elements
  const handleDragEnter = (e: React.DragEvent) => { e.preventDefault(); dragCounterRef.current++; setDragging(true); };
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); dragCounterRef.current--; if (dragCounterRef.current === 0) setDragging(false); };
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current = 0;
    setDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length) processFiles(files);
  };

  const updateVisit = (vi: number, field: "visitDate" | "labName" | "provider", value: string) => {
    setVisits((prev) => prev.map((v, i) => i === vi ? { ...v, [field]: value } : v));
  };

  const toggleExpanded = (vi: number) => {
    setVisits((prev) => prev.map((v, i) => i === vi ? { ...v, expanded: !v.expanded } : v));
  };

  const updateResult = (vi: number, ri: number, field: keyof ParsedResult, raw: string) => {
    setVisits((prev) => prev.map((v, i) => {
      if (i !== vi) return v;
      const updated = v.results.map((r, j) => {
        if (j !== ri) return r;
        const next = { ...r };
        if (field === "value" || field === "ref_low" || field === "ref_high") {
          (next as Record<string, unknown>)[field] = raw === "" ? null : parseFloat(raw);
        } else {
          (next as Record<string, unknown>)[field] = raw || null;
        }
        if (field === "value" || field === "ref_low" || field === "ref_high") {
          next.in_range = inferInRange(next);
        }
        return next;
      });
      return { ...v, results: updated };
    }));
  };

  const removeResult = (vi: number, ri: number) => {
    setVisits((prev) => prev.map((v, i) =>
      i === vi ? { ...v, results: v.results.filter((_, j) => j !== ri) } : v
    ));
  };

  const removeVisit = (vi: number) => {
    setVisits((prev) => prev.filter((_, i) => i !== vi));
  };

  const addRow = (vi: number) => {
    setVisits((prev) => prev.map((v, i) =>
      i === vi ? {
        ...v,
        results: [...v.results, { test_name: "", category: "Other", value: null, unit: null, ref_low: null, ref_high: null, ref_text: null, in_range: null }],
      } : v
    ));
  };

  const handleSaveAll = async () => {
    const valid = visits.filter((v) => v.visitDate && !v.error);
    if (valid.length === 0) { setError("At least one visit needs a date"); return; }
    setSaving(true);
    setError(null);
    try {
      const headers = await getAuthHeaders();
      await Promise.all(valid.map((v) =>
        fetch("/api/labs/visits", {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ visit_date: v.visitDate, lab_name: v.labName || null, provider: v.provider || null, results: v.results }),
        })
      ));
      reset();
      onSaved();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const validCount = visits.filter((v) => v.visitDate && !v.error).length;

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <SheetContent
        side="right"
        className="overflow-hidden flex flex-col"
        style={{ width: sheetWidth, maxWidth: "calc(100vw - 48px)", minWidth: MIN_WIDTH }}
      >
        {/* Drag-to-resize handle */}
        <div
          onMouseDown={(e) => { e.preventDefault(); isResizing.current = true; document.body.style.userSelect = "none"; document.body.style.cursor = "ew-resize"; }}
          className="absolute left-0 top-0 h-full w-1.5 cursor-ew-resize hover:bg-primary/20 transition-colors z-10"
          title="Drag to resize"
        />
        <SheetHeader className="flex-shrink-0">
          <SheetTitle>{step === "upload" ? "Upload Lab Reports" : `Review ${visits.length} Report${visits.length !== 1 ? "s" : ""}`}</SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto mt-4 pr-1">
          {error && (
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 text-destructive text-sm px-4 py-3 mb-4">
              {error}
            </div>
          )}

          {/* ── Upload step ── */}
          {step === "upload" && (
            <div className="space-y-6">
              <div
                onDragEnter={handleDragEnter}
                onDragLeave={handleDragLeave}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onClick={() => !parsing && fileInputRef.current?.click()}
                className={cn(
                  "border-2 border-dashed rounded-xl flex flex-col items-center justify-center gap-3 transition-colors h-48",
                  parsing ? "cursor-default" : "cursor-pointer",
                  dragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-accent/20"
                )}
              >
                {parsing ? (
                  <>
                    <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    <p className="text-sm font-medium">
                      Parsing {parseProgress.done} of {parseProgress.total}…
                    </p>
                    <p className="text-xs text-muted-foreground">Extracting your lab results…</p>
                    {/* Progress bar */}
                    <div className="w-full max-w-xs h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all duration-300"
                        style={{ width: `${parseProgress.total > 0 ? (parseProgress.done / parseProgress.total) * 100 : 0}%` }}
                      />
                    </div>
                  </>
                ) : dragging ? (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-10 h-10 text-primary">
                      <path fillRule="evenodd" d="M11.47 2.47a.75.75 0 0 1 1.06 0l4.5 4.5a.75.75 0 0 1-1.06 1.06l-3.22-3.22V16.5a.75.75 0 0 1-1.5 0V4.81L8.03 8.03a.75.75 0 0 1-1.06-1.06l4.5-4.5ZM3 15.75a.75.75 0 0 1 .75.75v2.25a1.5 1.5 0 0 0 1.5 1.5h13.5a1.5 1.5 0 0 0 1.5-1.5V16.5a.75.75 0 0 1 1.5 0v2.25a3 3 0 0 1-3 3H5.25a3 3 0 0 1-3-3V16.5a.75.75 0 0 1 .75-.75Z" clipRule="evenodd" />
                    </svg>
                    <p className="text-sm font-medium text-primary">Drop to upload</p>
                  </>
                ) : (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-10 h-10 text-muted-foreground">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m6.75 12-3-3m0 0-3 3m3-3v6m-1.5-15H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                    </svg>
                    <p className="text-sm font-medium">Drop PDFs here or click to browse</p>
                    <p className="text-xs text-muted-foreground">Multiple files supported · Quest, LabCorp, any lab format</p>
                  </>
                )}
              </div>
              <input ref={fileInputRef} type="file" accept="application/pdf,.pdf" multiple className="hidden" onChange={handleFileInput} disabled={parsing} />

              <div className="border-t pt-4">
                <p className="text-xs text-muted-foreground font-medium mb-3">Or enter manually</p>
                <Button variant="outline" className="w-full" onClick={() => {
                  setVisits([{ fileName: "", visitDate: "", labName: "", provider: "", results: [
                    { test_name: "", category: "Other", value: null, unit: null, ref_low: null, ref_high: null, ref_text: null, in_range: null },
                  ], expanded: true }]);
                  setStep("review");
                }}>
                  Manual Entry
                </Button>
              </div>
            </div>
          )}

          {/* ── Review step ── */}
          {step === "review" && (
            <div className="space-y-4">
              {visits.map((visit, vi) => (
                <div key={vi} className={cn("border rounded-xl overflow-hidden", visit.error ? "border-destructive/40" : "border-border")}>
                  {/* Visit header */}
                  <div
                    className="flex items-center gap-2 px-4 py-3 bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => toggleExpanded(vi)}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"
                      className={cn("w-4 h-4 text-muted-foreground transition-transform shrink-0", visit.expanded ? "rotate-90" : "")}>
                      <path fillRule="evenodd" d="M8.22 5.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L11.94 10 8.22 6.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd"/>
                    </svg>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium truncate">
                        {visit.fileName || "Manual entry"}
                      </span>
                      {visit.visitDate && <span className="text-xs text-muted-foreground ml-2">{visit.visitDate}</span>}
                      {visit.error && <span className="text-xs text-destructive ml-2">Parse error</span>}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {!visit.error && (
                        <span className="text-xs text-muted-foreground">
                          {visit.results.filter((r) => r.in_range === false).length > 0 && (
                            <span className="text-red-500 mr-1">
                              {visit.results.filter((r) => r.in_range === false).length} abnormal ·
                            </span>
                          )}
                          {visit.results.length} tests
                        </span>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); removeVisit(vi); }}
                        className="text-muted-foreground hover:text-destructive text-xs p-1"
                        title="Remove this report"
                      >✕</button>
                    </div>
                  </div>

                  {visit.expanded && (
                    <div className="p-4 space-y-4">
                      {visit.error ? (
                        <p className="text-sm text-destructive">{visit.error}</p>
                      ) : (
                        <>
                          {/* Visit metadata */}
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div>
                              <label className="text-xs text-muted-foreground">Visit Date *</label>
                              <CalendarInput value={visit.visitDate} onChange={(d) => updateVisit(vi, "visitDate", d)} placeholder="Select date" />
                            </div>
                            <div>
                              <label className="text-xs text-muted-foreground">Lab / Facility</label>
                              <input value={visit.labName} onChange={(e) => updateVisit(vi, "labName", e.target.value)}
                                placeholder="e.g. Quest Diagnostics"
                                className="w-full h-9 px-3 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                            </div>
                            <div>
                              <label className="text-xs text-muted-foreground">Provider</label>
                              <input value={visit.provider} onChange={(e) => updateVisit(vi, "provider", e.target.value)}
                                placeholder="Ordering provider"
                                className="w-full h-9 px-3 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                            </div>
                          </div>

                          {/* Results table */}
                          <div>
                            <div className="flex items-center justify-between mb-1.5">
                              <p className="text-xs text-muted-foreground font-medium">{visit.results.length} results</p>
                              <button onClick={() => addRow(vi)} className="text-xs text-primary hover:underline">+ Add row</button>
                            </div>
                            <div className="overflow-x-auto">
                              <table className="w-full text-xs border-separate border-spacing-y-0.5" style={{ minWidth: 560 }}>
                                <colgroup>
                                  <col style={{ minWidth: 140 }} />
                                  <col style={{ width: 100 }} />
                                  <col style={{ width: 72 }} />
                                  <col style={{ width: 80 }} />
                                  <col style={{ width: 76 }} />
                                  <col style={{ width: 76 }} />
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
                                  {[...visit.results]
                                    .map((r, origIdx) => ({ r, origIdx }))
                                    .sort((a, b) => CATEGORY_ORDER.indexOf(a.r.category || "Other") - CATEGORY_ORDER.indexOf(b.r.category || "Other"))
                                    .map(({ r, origIdx }) => (
                                      <tr key={origIdx} className={cn("rounded-lg", r.in_range === false ? "bg-red-500/5" : "bg-muted/30")}>
                                        <td className="px-1 py-0.5">
                                          <input value={r.test_name} onChange={(e) => updateResult(vi, origIdx, "test_name", e.target.value)}
                                            className="w-full h-7 px-2 border rounded text-xs bg-background focus:outline-none focus:ring-1 focus:ring-ring" placeholder="Test name" />
                                        </td>
                                        <td className="px-1 py-0.5">
                                          <select value={r.category || "Other"} onChange={(e) => updateResult(vi, origIdx, "category", e.target.value)}
                                            className="w-full h-7 px-1 border rounded text-xs bg-background focus:outline-none">
                                            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                                          </select>
                                        </td>
                                        <td className="px-1 py-0.5">
                                          <input type="number" value={r.value ?? ""} onChange={(e) => updateResult(vi, origIdx, "value", e.target.value)}
                                            className={cn("w-full h-7 px-2 border rounded text-xs bg-background focus:outline-none font-mono", r.in_range === false ? "text-red-600 font-semibold" : "")}
                                            placeholder="—" />
                                        </td>
                                        <td className="px-1 py-0.5">
                                          <input value={r.unit || ""} onChange={(e) => updateResult(vi, origIdx, "unit", e.target.value)}
                                            className="w-full h-7 px-2 border rounded text-xs bg-background focus:outline-none" placeholder="—" />
                                        </td>
                                        <td className="px-1 py-0.5">
                                          <input type="number" value={r.ref_low ?? ""} onChange={(e) => updateResult(vi, origIdx, "ref_low", e.target.value)}
                                            className="w-full h-7 px-2 border rounded text-xs bg-background focus:outline-none" placeholder="—" />
                                        </td>
                                        <td className="px-1 py-0.5">
                                          <input type="number" value={r.ref_high ?? ""} onChange={(e) => updateResult(vi, origIdx, "ref_high", e.target.value)}
                                            className="w-full h-7 px-2 border rounded text-xs bg-background focus:outline-none" placeholder="—" />
                                        </td>
                                        <td className="px-1 py-0.5 text-center">
                                          <button onClick={() => removeResult(vi, origIdx)} className="text-muted-foreground hover:text-destructive px-1">✕</button>
                                        </td>
                                      </tr>
                                    ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              ))}

              {visits.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">All reports removed. Go back to upload new ones.</p>
              )}

              <div className="flex gap-2 pt-2 border-t sticky bottom-0 bg-background pb-2">
                <Button variant="outline" onClick={() => setStep("upload")} disabled={saving}>Back</Button>
                <Button onClick={handleSaveAll} disabled={saving || validCount === 0} className="flex-1">
                  {saving ? "Saving…" : `Save ${validCount} Visit${validCount !== 1 ? "s" : ""}`}
                </Button>
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
