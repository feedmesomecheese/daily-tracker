"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { getAuthHeaders } from "@/lib/authHeaders";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { MetricMappingSheet, MetricMapping } from "@/components/oura/metric-mapping-sheet";

type OuraConfig = {
  connected: boolean;
  integration?: {
    id: string;
    last_sync_at: string | null;
    sync_config: {
      auto_sync?: boolean;
      overwrite_manual?: boolean;
      metric_mapping?: MetricMapping;
    };
    created_at: string;
  };
  sync_history: {
    id: string;
    started_at: string;
    completed_at: string | null;
    status: string;
    records_synced: number;
    error_message: string | null;
  }[];
  available_metrics: { metric_id: string; metric_name: string; type: string }[];
};

export default function OuraIntegrationPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const justConnected = searchParams.get("connected") === "1";

  const [config, setConfig] = useState<OuraConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  // Sync options
  const [syncStartDate, setSyncStartDate] = useState("");
  const [syncEndDate, setSyncEndDate] = useState("");

  const fetchConfig = useCallback(async () => {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/integrations/oura/config", { headers });
      const data = await res.json();
      setConfig(data);

      if (!data.connected) {
        router.push("/integrations");
      }
    } catch (e) {
      console.error("Failed to load config:", e);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const headers = await getAuthHeaders();
      const body: Record<string, string> = {};
      if (syncStartDate) body.start_date = syncStartDate;
      if (syncEndDate) body.end_date = syncEndDate;

      const res = await fetch("/api/integrations/oura/sync", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.error || "Sync failed");
      } else {
        alert(`Synced ${data.synced} records`);
        fetchConfig();
      }
    } catch (e) {
      alert("Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  const handleSaveMapping = async (mapping: MetricMapping) => {
    setSavingConfig(true);
    try {
      const headers = await getAuthHeaders();
      const syncConfig = {
        ...config?.integration?.sync_config,
        metric_mapping: mapping,
      };

      const res = await fetch("/api/integrations/oura/config", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ sync_config: syncConfig }),
      });

      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Failed to save");
      } else {
        fetchConfig();
      }
    } catch (e) {
      alert("Failed to save");
    } finally {
      setSavingConfig(false);
    }
  };

  const handleToggleSetting = async (key: "auto_sync" | "overwrite_manual", value: boolean) => {
    setSavingConfig(true);
    try {
      const headers = await getAuthHeaders();
      const syncConfig = {
        ...config?.integration?.sync_config,
        [key]: value,
      };

      await fetch("/api/integrations/oura/config", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ sync_config: syncConfig }),
      });

      fetchConfig();
    } catch (e) {
      console.error("Failed to update setting:", e);
    } finally {
      setSavingConfig(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm("Disconnect from Oura? This will not delete any synced data.")) {
      return;
    }

    setDisconnecting(true);
    try {
      const headers = await getAuthHeaders();
      await fetch("/api/integrations/oura/config", {
        method: "DELETE",
        headers,
      });
      router.push("/integrations");
    } catch (e) {
      alert("Failed to disconnect");
    } finally {
      setDisconnecting(false);
    }
  };

  if (loading) {
    return (
      <main className="p-6 max-w-4xl mx-auto">
        <h1 className="text-2xl font-semibold mb-4">Oura Integration</h1>
        <div className="text-sm text-muted-foreground">Loading...</div>
      </main>
    );
  }

  if (!config?.connected) {
    return null;
  }

  return (
    <main className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold">Oura Integration</h1>
          <Badge variant="default">Connected</Badge>
        </div>
        <Button
          variant="destructive"
          size="sm"
          onClick={handleDisconnect}
          disabled={disconnecting}
        >
          {disconnecting ? "Disconnecting..." : "Disconnect"}
        </Button>
      </div>

      {justConnected && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-green-700">
          Successfully connected to Oura! Configure your metric mapping below to start syncing data.
        </div>
      )}

      {/* Metric Mapping */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Metric Mapping</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Map Oura data types to your Daily Tracker metrics.
          </p>
          <MetricMappingSheet
            mapping={config.integration?.sync_config?.metric_mapping || {}}
            availableMetrics={config.available_metrics}
            onSave={handleSaveMapping}
            saving={savingConfig}
          />
        </CardContent>
      </Card>

      {/* Sync Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sync Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium text-sm">Overwrite manual entries</div>
              <div className="text-xs text-muted-foreground">
                Replace manually entered values with Oura data
              </div>
            </div>
            <Switch
              checked={config.integration?.sync_config?.overwrite_manual ?? false}
              onCheckedChange={(v) => handleToggleSetting("overwrite_manual", v)}
              disabled={savingConfig}
            />
          </div>
        </CardContent>
      </Card>

      {/* Manual Sync */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sync Data</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <label className="text-sm text-muted-foreground">Start Date</label>
              <Input
                type="date"
                value={syncStartDate}
                onChange={(e) => setSyncStartDate(e.target.value)}
              />
            </div>
            <div className="flex-1">
              <label className="text-sm text-muted-foreground">End Date</label>
              <Input
                type="date"
                value={syncEndDate}
                onChange={(e) => setSyncEndDate(e.target.value)}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Leave empty to sync the last 7 days.
          </p>
          <Button onClick={handleSync} disabled={syncing}>
            {syncing ? "Syncing..." : "Sync Now"}
          </Button>

          {config.integration?.last_sync_at && (
            <p className="text-xs text-muted-foreground">
              Last synced: {new Date(config.integration.last_sync_at).toLocaleString()}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Sync History */}
      {config.sync_history.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Sync History</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {config.sync_history.map((log) => (
                <div
                  key={log.id}
                  className="flex items-center justify-between text-sm p-2 border rounded"
                >
                  <div>
                    <span className="font-mono text-xs">
                      {new Date(log.started_at).toLocaleString()}
                    </span>
                    <Badge
                      variant={
                        log.status === "success"
                          ? "default"
                          : log.status === "error"
                          ? "destructive"
                          : "secondary"
                      }
                      className="ml-2"
                    >
                      {log.status}
                    </Badge>
                  </div>
                  <div className="text-muted-foreground">
                    {log.records_synced} records
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </main>
  );
}
