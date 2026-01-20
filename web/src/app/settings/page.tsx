"use client";

import { useEffect, useState } from "react";
import { getAuthHeaders } from "@/lib/authHeaders";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTheme } from "@/components/theme-provider";

type MainPageSettings = {
  show_indicators: boolean;
  show_trends: boolean;
  show_streaks: boolean;
};

type UserSettings = {
  main_page: MainPageSettings;
};

const DEFAULT_SETTINGS: UserSettings = {
  main_page: {
    show_indicators: true,
    show_trends: true,
    show_streaks: true,
  },
};

export default function SettingsPage() {
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const { theme, setTheme } = useTheme();

  // Backfill state
  const [backfillRunning, setBackfillRunning] = useState(false);
  const [backfillFromDate, setBackfillFromDate] = useState("");
  const [backfillResult, setBackfillResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  // Load settings on mount
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const headers = await getAuthHeaders();
        const res = await fetch("/api/settings", { headers });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || "Failed to load settings");
        setSettings(json);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Save settings helper
  const saveSettings = async (newSettings: UserSettings) => {
    try {
      setSaving(true);
      setSaveStatus(null);
      const headers = await getAuthHeaders();
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(newSettings),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to save settings");
      setSettings(json);
      setSaveStatus("Saved");
      setTimeout(() => setSaveStatus(null), 2000);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  // Toggle handler with auto-save
  const handleToggle = (key: keyof MainPageSettings) => {
    const newSettings: UserSettings = {
      ...settings,
      main_page: {
        ...settings.main_page,
        [key]: !settings.main_page[key],
      },
    };
    setSettings(newSettings);
    saveSettings(newSettings);
  };

  // Backfill handlers
  const runBackfill = async (all: boolean) => {
    try {
      setBackfillRunning(true);
      setBackfillResult(null);
      const headers = await getAuthHeaders();
      const body = all
        ? { all: true }
        : { fromDate: backfillFromDate };

      const res = await fetch("/api/backfill", {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      const json = await res.json();

      if (!res.ok) {
        setBackfillResult({
          success: false,
          message: json?.error || "Backfill failed",
        });
        return;
      }

      setBackfillResult({
        success: true,
        message: `Recalculated ${json.daysProcessed} days`,
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setBackfillResult({ success: false, message: msg });
    } finally {
      setBackfillRunning(false);
    }
  };

  return (
    <main className="p-6 max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Settings</h1>
        {saveStatus && (
          <span className="text-sm text-green-600">{saveStatus}</span>
        )}
        {saving && <span className="text-sm text-muted-foreground">Saving...</span>}
      </div>

      {loading && <div className="text-sm text-muted-foreground">Loading...</div>}
      {error && <div className="text-sm text-red-600">Error: {error}</div>}

      {/* Theme Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Appearance</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Choose your preferred color theme.
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setTheme("light")}
              className={`px-4 py-2 rounded-md border text-sm ${
                theme === "light"
                  ? "bg-primary text-primary-foreground"
                  : "bg-background hover:bg-muted"
              }`}
            >
              Light
            </button>
            <button
              onClick={() => setTheme("dark")}
              className={`px-4 py-2 rounded-md border text-sm ${
                theme === "dark"
                  ? "bg-primary text-primary-foreground"
                  : "bg-background hover:bg-muted"
              }`}
            >
              Dark
            </button>
            <button
              onClick={() => setTheme("system")}
              className={`px-4 py-2 rounded-md border text-sm ${
                theme === "system"
                  ? "bg-primary text-primary-foreground"
                  : "bg-background hover:bg-muted"
              }`}
            >
              System
            </button>
          </div>
        </CardContent>
      </Card>

      {!loading && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Main Page Indicators</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Control which indicators appear on the daily input page next to
              your metrics.
            </p>

            <div className="space-y-3">
              {/* Master toggle */}
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 rounded border-gray-300"
                  checked={settings.main_page.show_indicators}
                  onChange={() => handleToggle("show_indicators")}
                />
                <div>
                  <div className="font-medium">Show indicators</div>
                  <div className="text-sm text-muted-foreground">
                    Master toggle for all indicator badges on the main page
                  </div>
                </div>
              </label>

              {/* Trends toggle - only enabled if master is on */}
              <label
                className={`flex items-start gap-3 cursor-pointer pl-6 ${
                  !settings.main_page.show_indicators ? "opacity-50" : ""
                }`}
              >
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 rounded border-gray-300"
                  checked={settings.main_page.show_trends}
                  onChange={() => handleToggle("show_trends")}
                  disabled={!settings.main_page.show_indicators}
                />
                <div>
                  <div className="font-medium">Trend arrows</div>
                  <div className="text-sm text-muted-foreground">
                    Show trend direction (up/down/flat) for numeric metrics
                    based on 7-day comparison
                  </div>
                </div>
              </label>

              {/* Streaks toggle - only enabled if master is on */}
              <label
                className={`flex items-start gap-3 cursor-pointer pl-6 ${
                  !settings.main_page.show_indicators ? "opacity-50" : ""
                }`}
              >
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 rounded border-gray-300"
                  checked={settings.main_page.show_streaks}
                  onChange={() => handleToggle("show_streaks")}
                  disabled={!settings.main_page.show_indicators}
                />
                <div>
                  <div className="font-medium">Streak badges</div>
                  <div className="text-sm text-muted-foreground">
                    Show current streak count for checkbox metrics
                  </div>
                </div>
              </label>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Data Maintenance */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Data Maintenance</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Recalculate computed metrics (like those using <code className="bg-muted px-1 rounded">prev()</code> or <code className="bg-muted px-1 rounded">diff()</code>).
            Use this after changing formulas or if calculated values seem incorrect.
          </p>

          {/* Full backfill */}
          <div className="flex items-center gap-3">
            <Button
              onClick={() => runBackfill(true)}
              disabled={backfillRunning}
              variant="outline"
            >
              {backfillRunning ? "Running..." : "Recalculate All History"}
            </Button>
            <span className="text-sm text-muted-foreground">
              Recalculates all calculated metrics from the beginning
            </span>
          </div>

          {/* From date backfill */}
          <div className="flex items-center gap-3">
            <Input
              type="date"
              value={backfillFromDate}
              onChange={(e) => setBackfillFromDate(e.target.value)}
              className="w-40"
              disabled={backfillRunning}
            />
            <Button
              onClick={() => runBackfill(false)}
              disabled={backfillRunning || !backfillFromDate}
              variant="outline"
            >
              {backfillRunning ? "Running..." : "Recalculate from Date"}
            </Button>
          </div>

          {/* Result message */}
          {backfillResult && (
            <div
              className={`text-sm p-2 rounded ${
                backfillResult.success
                  ? "bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                  : "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400"
              }`}
            >
              {backfillResult.message}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="text-xs text-muted-foreground/70">
        Settings are saved automatically when changed.
      </div>
    </main>
  );
}
