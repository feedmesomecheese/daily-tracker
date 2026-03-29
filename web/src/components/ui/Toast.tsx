"use client";

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ToastType = "success" | "error" | "info";

interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
}

export interface ConfirmOptions {
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Renders the confirm button in destructive (red) style */
  destructive?: boolean;
}

interface ConfirmState {
  options: ConfirmOptions;
  resolve: (value: boolean) => void;
}

interface PromptState {
  message: string;
  resolve: (value: string | null) => void;
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType) => void;
  confirm: (options: ConfirmOptions | string) => Promise<boolean>;
  prompt: (message: string, defaultValue?: string) => Promise<string | null>;
}

// ── Context ───────────────────────────────────────────────────────────────────

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within <ToastProvider>");
  return ctx;
}

// ── Provider ──────────────────────────────────────────────────────────────────

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [promptState, setPromptState] = useState<PromptState | null>(null);
  const [promptValue, setPromptValue] = useState("");
  const promptInputRef = useRef<HTMLInputElement>(null);

  // ── toast ──────────────────────────────────────────────────────────────────

  const toast = useCallback((message: string, type: ToastType = "info") => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev.slice(-2), { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, type === "error" ? 5000 : 3000);
  }, []);

  // ── confirm ────────────────────────────────────────────────────────────────

  const confirm = useCallback((options: ConfirmOptions | string): Promise<boolean> => {
    const opts = typeof options === "string" ? { message: options } : options;
    return new Promise<boolean>((resolve) => {
      setConfirmState({ options: opts, resolve });
    });
  }, []);

  const resolveConfirm = useCallback((value: boolean) => {
    setConfirmState((prev) => { prev?.resolve(value); return null; });
  }, []);

  // ── prompt ─────────────────────────────────────────────────────────────────

  const prompt = useCallback((message: string, defaultValue = ""): Promise<string | null> => {
    return new Promise<string | null>((resolve) => {
      setPromptValue(defaultValue);
      setPromptState({ message, resolve });
    });
  }, []);

  const resolvePrompt = useCallback((value: string | null) => {
    setPromptState((prev) => { prev?.resolve(value); return null; });
    setPromptValue("");
  }, []);

  useEffect(() => {
    if (promptState) {
      const t = setTimeout(() => promptInputRef.current?.focus(), 30);
      return () => clearTimeout(t);
    }
  }, [promptState]);

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <ToastContext.Provider value={{ toast, confirm, prompt }}>
      {children}

      {/* ── Toast stack ── */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[300] flex flex-col-reverse gap-2 items-center pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              "px-4 py-2.5 rounded-xl shadow-lg text-sm font-medium pointer-events-auto max-w-xs text-center",
              t.type === "success" && "bg-green-600 text-white",
              t.type === "error" && "bg-destructive text-destructive-foreground",
              t.type === "info" && "bg-foreground text-background"
            )}
          >
            {t.message}
          </div>
        ))}
      </div>

      {/* ── Confirm dialog ── */}
      {confirmState && (
        <div className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => resolveConfirm(false)} />
          <div className="relative z-10 w-full max-w-sm bg-background rounded-t-2xl sm:rounded-2xl p-6 shadow-xl">
            <p className="text-sm text-foreground mb-5 leading-relaxed whitespace-pre-line">
              {confirmState.options.message}
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => resolveConfirm(false)}
                className="px-4 py-2 rounded-lg border border-border text-sm font-medium hover:bg-muted transition-colors"
              >
                {confirmState.options.cancelLabel ?? "Cancel"}
              </button>
              <button
                autoFocus
                onClick={() => resolveConfirm(true)}
                className={cn(
                  "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                  confirmState.options.destructive
                    ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    : "bg-primary text-primary-foreground hover:bg-primary/90"
                )}
              >
                {confirmState.options.confirmLabel ?? "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Prompt dialog ── */}
      {promptState && (
        <div className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => resolvePrompt(null)} />
          <div className="relative z-10 w-full max-w-sm bg-background rounded-t-2xl sm:rounded-2xl p-6 shadow-xl">
            <p className="text-sm font-medium text-foreground mb-3">{promptState.message}</p>
            <input
              ref={promptInputRef}
              type="text"
              value={promptValue}
              onChange={(e) => setPromptValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && promptValue.trim()) resolvePrompt(promptValue.trim());
                if (e.key === "Escape") resolvePrompt(null);
              }}
              className="w-full rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring mb-4"
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => resolvePrompt(null)}
                className="px-4 py-2 rounded-lg border border-border text-sm font-medium hover:bg-muted transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => { if (promptValue.trim()) resolvePrompt(promptValue.trim()); }}
                disabled={!promptValue.trim()}
                className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </ToastContext.Provider>
  );
}
