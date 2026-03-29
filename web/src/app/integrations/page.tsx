"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { getAuthHeaders } from "@/lib/authHeaders";
import { useToast } from "@/components/ui/Toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type IntegrationStatus = {
  connected: boolean;
  last_sync_at?: string;
};

const INTEGRATIONS = [
  {
    id: "oura",
    name: "Oura Ring",
    description: "Import sleep, readiness, and activity data from your Oura Ring",
    icon: "🔵",
    available: true,
  },
  {
    id: "apple_health",
    name: "Apple Health",
    description: "Sync health data from Apple Health (iOS only)",
    icon: "❤️",
    available: false,
  },
  {
    id: "fitbit",
    name: "Fitbit",
    description: "Import activity and sleep data from Fitbit devices",
    icon: "⌚",
    available: false,
  },
  {
    id: "garmin",
    name: "Garmin",
    description: "Sync data from Garmin Connect",
    icon: "🏃",
    available: false,
  },
];

export default function IntegrationsPage() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");

  const [statuses, setStatuses] = useState<Record<string, IntegrationStatus>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const headers = await getAuthHeaders();

        // Check Oura status
        const ouraRes = await fetch("/api/integrations/oura/config", { headers });
        const ouraData = await ouraRes.json();

        setStatuses({
          oura: {
            connected: ouraData.connected,
            last_sync_at: ouraData.integration?.last_sync_at,
          },
        });
      } catch (e) {
        console.error("Failed to load integration status:", e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <main className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Integrations</h1>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          Failed to connect: {error}
        </div>
      )}

      <p className="text-muted-foreground">
        Connect external services to automatically import data into Daily Tracker.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {INTEGRATIONS.map((integration) => {
          const status = statuses[integration.id];

          return (
            <Card
              key={integration.id}
              className={!integration.available ? "opacity-60" : ""}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">{integration.icon}</span>
                    <div>
                      <CardTitle className="text-lg">{integration.name}</CardTitle>
                      {status?.connected && (
                        <Badge variant="default" className="mt-1">Connected</Badge>
                      )}
                      {!integration.available && (
                        <Badge variant="secondary" className="mt-1">Coming Soon</Badge>
                      )}
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <CardDescription className="mb-4">
                  {integration.description}
                </CardDescription>

                {status?.connected && status.last_sync_at && (
                  <p className="text-xs text-muted-foreground mb-3">
                    Last synced: {new Date(status.last_sync_at).toLocaleString()}
                  </p>
                )}

                {integration.available ? (
                  status?.connected ? (
                    <Link href={`/integrations/${integration.id}`}>
                      <Button variant="outline" size="sm">
                        Manage
                      </Button>
                    </Link>
                  ) : (
                    <ConnectButton provider={integration.id} />
                  )
                ) : (
                  <Button variant="outline" size="sm" disabled>
                    Coming Soon
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </main>
  );
}

function ConnectButton({ provider }: { provider: string }) {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleConnect = async () => {
    setLoading(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/integrations/${provider}/authorize`, { headers });
      const data = await res.json();

      if (data.auth_url) {
        window.location.href = data.auth_url;
      } else {
        toast(data.error || "Failed to start authorization", "error");
      }
    } catch (e) {
      toast("Failed to connect", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button size="sm" onClick={handleConnect} disabled={loading}>
      {loading ? "Connecting..." : "Connect"}
    </Button>
  );
}
