"use client";

import { useState, useMemo } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { getAuthHeaders } from "@/lib/authHeaders";
import { cn } from "@/lib/utils";
import type { PanelTest } from "../page";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  tests: PanelTest[];
  onChanged: () => void;
}

type RowState = {
  canonical_name: string;
  display_name: string;
  visit_count: number;
  /** Current value in the rename/merge input */
  inputValue: string;
  saving: boolean;
  error: string | null;
  success: boolean;
};

export default function ManageTestsSheet({ open, onOpenChange, tests, onChanged }: Props) {
  const [rows, setRows] = useState<RowState[]>([]);
  const [search, setSearch] = useState("");

  // Initialise rows whenever the sheet opens or tests change
  useMemo(() => {
    if (!open) return;
    setRows(
      [...tests]
        .sort((a, b) => a.display_name.localeCompare(b.display_name))
        .map((t) => ({
          canonical_name: t.canonical_name,
          display_name: t.display_name,
          visit_count: t.visit_count,
          inputValue: t.canonical_name,
          saving: false,
          error: null,
          success: false,
        }))
    );
    setSearch("");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, tests]);

  const filteredRows = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return rows;
    return rows.filter(
      (r) => r.canonical_name.toLowerCase().includes(q) || r.display_name.toLowerCase().includes(q)
    );
  }, [rows, search]);

  function setRow(canonical_name: string, patch: Partial<RowState>) {
    setRows((prev) => prev.map((r) => r.canonical_name === canonical_name ? { ...r, ...patch } : r));
  }

  async function handleSave(row: RowState) {
    const to = row.inputValue.trim();
    if (!to || to === row.canonical_name) return;

    setRow(row.canonical_name, { saving: true, error: null, success: false });
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/labs/canonical", {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ from: row.canonical_name, to }),
      });
      const data = await res.json();
      if (!res.ok) {
        setRow(row.canonical_name, { saving: false, error: data.error ?? "Failed" });
      } else {
        setRow(row.canonical_name, { saving: false, success: true });
        onChanged();
      }
    } catch {
      setRow(row.canonical_name, { saving: false, error: "Network error" });
    }
  }

  const hasPendingChanges = rows.some((r) => r.inputValue.trim() !== r.canonical_name);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" storageKey="lab_manage_tests_sheet_width" defaultWidth={560} className="flex flex-col overflow-hidden">
        <SheetHeader className="pb-4 border-b pr-8 flex-shrink-0">
          <SheetTitle>Manage Tests</SheetTitle>
          <SheetDescription>
            Rename or merge test canonical names. Merging combines all history under one name.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-shrink-0 pt-3">
          <input
            type="text"
            placeholder="Search tests..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-8 px-3 text-sm border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        {hasPendingChanges && (
          <p className="text-xs text-amber-600 dark:text-amber-400 flex-shrink-0">
            Save each row individually to apply changes.
          </p>
        )}

        <div className="flex-1 overflow-y-auto mt-1 space-y-1 pr-1">
          {filteredRows.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">No tests found.</p>
          )}
          {filteredRows.map((row) => {
            const isDirty = row.inputValue.trim() !== row.canonical_name;
            const targetExists = isDirty && rows.some(
              (r) => r.canonical_name !== row.canonical_name && r.canonical_name.toLowerCase() === row.inputValue.trim().toLowerCase()
            );
            return (
              <div
                key={row.canonical_name}
                className={cn(
                  "rounded-lg border px-3 py-2 space-y-1.5",
                  row.success ? "border-green-500/40 bg-green-500/5" : "bg-card"
                )}
              >
                <div className="flex items-center gap-1.5">
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-muted-foreground">
                      {row.display_name !== row.canonical_name
                        ? `${row.display_name} · `
                        : ""}
                      {row.visit_count} draw{row.visit_count !== 1 ? "s" : ""}
                    </div>
                  </div>
                  {row.success && (
                    <span className="text-xs text-green-500 font-medium">✓ Saved</span>
                  )}
                </div>

                <div className="flex gap-2 items-center">
                  <input
                    type="text"
                    value={row.inputValue}
                    onChange={(e) => setRow(row.canonical_name, { inputValue: e.target.value, error: null, success: false })}
                    onKeyDown={(e) => e.key === "Enter" && isDirty && handleSave(row)}
                    className={cn(
                      "flex-1 h-7 px-2 text-sm border rounded bg-background focus:outline-none focus:ring-1 focus:ring-ring font-mono",
                      isDirty && "border-primary"
                    )}
                    disabled={row.saving}
                  />
                  <Button
                    size="sm"
                    variant={targetExists ? "default" : "outline"}
                    className="h-7 px-2 text-xs"
                    disabled={!isDirty || row.saving}
                    onClick={() => handleSave(row)}
                  >
                    {row.saving ? "…" : targetExists ? "Merge" : "Rename"}
                  </Button>
                </div>

                {targetExists && (
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    "{row.inputValue.trim()}" already exists — this will merge all {row.visit_count} draw{row.visit_count !== 1 ? "s" : ""} into it.
                  </p>
                )}
                {row.error && (
                  <p className="text-xs text-red-500">{row.error}</p>
                )}
              </div>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
}
