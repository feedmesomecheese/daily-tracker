"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Suggested name pre-populated in the field (e.g. workout type name) */
  initialName?: string;
  /** Number of exercises that will be saved — shown as context */
  exerciseCount: number;
  /** Parent handles the actual POST; receives the chosen name */
  onSave: (name: string) => Promise<void>;
};

export default function SaveTemplateDialog({
  open,
  onOpenChange,
  initialName = "",
  exerciseCount,
  onSave,
}: Props) {
  const [name, setName] = useState(initialName);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync name when dialog opens with a new suggestion
  useEffect(() => {
    if (open) {
      setName(initialName);
      setError(null);
    }
  }, [open, initialName]);

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await onSave(name.trim());
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Save as Template</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 mt-1">
          <p className="text-sm text-muted-foreground">
            {exerciseCount} exercise{exerciseCount !== 1 ? "s" : ""} will be saved.
          </p>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Template name…"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSave();
              if (e.key === "Escape") onOpenChange(false);
            }}
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex gap-2 pt-1">
            <Button onClick={handleSave} disabled={saving || !name.trim()} className="flex-1">
              {saving ? "Saving…" : "Save Template"}
            </Button>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
