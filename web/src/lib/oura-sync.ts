import { SupabaseClient } from "@supabase/supabase-js";
import { decrypt, encrypt } from "@/lib/encryption";

export const OURA_API_BASE = "https://api.ouraring.com/v2/usercollection";
const OURA_TOKEN_URL = "https://api.ouraring.com/oauth/token";

// Sleep durations, RHR, and HRV come from /sleep (actual measured values).
// /daily_sleep and /daily_readiness contributors are 0-100 scores, not real values.
// /sleep can return multiple sessions per day; dedupByDay picks the longest.
export const OURA_DATA_TYPES: Record<string, {
  endpoint: string;
  dedupByDay?: string;
  metrics: Record<string, { field: string; transform: string | null }>;
}> = {
  sleep: {
    endpoint: "/sleep",
    dedupByDay: "total_sleep_duration",
    metrics: {
      sleep_duration: { field: "total_sleep_duration", transform: "seconds_to_minutes" },
      sleep_efficiency: { field: "efficiency", transform: null },
      deep_sleep: { field: "deep_sleep_duration", transform: "seconds_to_minutes" },
      rem_sleep: { field: "rem_sleep_duration", transform: "seconds_to_minutes" },
      light_sleep: { field: "light_sleep_duration", transform: "seconds_to_minutes" },
      resting_heart_rate: { field: "lowest_heart_rate", transform: null },
      hrv_average: { field: "average_hrv", transform: null },
    },
  },
  readiness: {
    endpoint: "/daily_readiness",
    metrics: {
      readiness_score: { field: "score", transform: null },
    },
  },
  activity: {
    endpoint: "/daily_activity",
    metrics: {
      activity_score: { field: "score", transform: null },
      steps: { field: "steps", transform: null },
      calories_active: { field: "active_calories", transform: null },
      calories_total: { field: "total_calories", transform: null },
    },
  },
};

export async function refreshOuraToken(
  supabase: SupabaseClient,
  integration: { id: string; refresh_token: string }
): Promise<string | null> {
  const clientId = process.env.OURA_CLIENT_ID;
  const clientSecret = process.env.OURA_CLIENT_SECRET;
  if (!clientId || !clientSecret || !integration.refresh_token) return null;

  try {
    const res = await fetch(OURA_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: decrypt(integration.refresh_token),
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });

    if (!res.ok) return null;
    const tokens = await res.json();

    const expiresAt = new Date();
    expiresAt.setSeconds(expiresAt.getSeconds() + (tokens.expires_in || 86400));

    await supabase
      .from("integrations")
      .update({
        access_token: encrypt(tokens.access_token),
        refresh_token: tokens.refresh_token
          ? encrypt(tokens.refresh_token)
          : integration.refresh_token,
        token_expires_at: expiresAt.toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", integration.id);

    return tokens.access_token;
  } catch (e) {
    console.error("Failed to refresh Oura token:", e);
    return null;
  }
}

export type SyncResult = {
  synced: number;
  errors: string[];
  details: Record<string, unknown>;
};

export async function performOuraSync(
  supabase: SupabaseClient,
  params: {
    userId: string;
    accessToken: string;
    startDate: string;
    endDate: string;
    metricMapping: Record<string, { enabled: boolean; metric_id: string }>;
    overwriteManual: boolean;
    dataTypes?: string[];
  }
): Promise<SyncResult> {
  const { userId, accessToken, startDate, endDate, metricMapping, overwriteManual, dataTypes } = params;
  const typesToSync = dataTypes || Object.keys(OURA_DATA_TYPES);

  let totalSynced = 0;
  const errors: string[] = [];
  const details: Record<string, unknown> = {};

  for (const dataType of typesToSync) {
    const config = OURA_DATA_TYPES[dataType];
    if (!config) continue;

    try {
      const url = `${OURA_API_BASE}${config.endpoint}?start_date=${startDate}&end_date=${endDate}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!res.ok) {
        errors.push(`${dataType}: API error ${res.status}`);
        continue;
      }

      const data = await res.json();
      let items: Record<string, unknown>[] = data.data || [];

      details[dataType] = { fetched: items.length };

      // For endpoints with multiple records per day, keep only the longest session.
      if (config.dedupByDay) {
        const field = config.dedupByDay;
        const byDay = new Map<string, Record<string, unknown>>();
        for (const item of items) {
          const day = item.day as string;
          const existing = byDay.get(day);
          if (!existing || ((item[field] as number) ?? 0) > ((existing[field] as number) ?? 0)) {
            byDay.set(day, item);
          }
        }
        items = Array.from(byDay.values());
      }

      for (const item of items) {
        const date = item.day as string;

        for (const [metricKey, metricConfig] of Object.entries(config.metrics)) {
          const mapping = metricMapping[metricKey];
          if (!mapping?.enabled) continue;

          const targetMetricId = mapping.metric_id;
          if (!targetMetricId) continue;

          let value: unknown = item;
          for (const key of metricConfig.field.split(".")) {
            value = (value as Record<string, unknown>)?.[key];
          }
          if (value == null) continue;

          let numValue = value as number;
          if (metricConfig.transform === "seconds_to_minutes") {
            numValue = Math.round(numValue / 60);
          } else if (metricConfig.transform === "seconds_to_hours") {
            numValue = Math.round((numValue / 3600) * 10) / 10;
          }

          if (!overwriteManual) {
            const { data: existing } = await supabase
              .from("log")
              .select("value")
              .eq("owner_id", userId)
              .eq("date", date)
              .eq("metric_id", targetMetricId)
              .single();
            if (existing?.value != null) continue;
          }

          const { error: upsertError } = await supabase
            .from("log")
            .upsert(
              { owner_id: userId, date, metric_id: targetMetricId, value: numValue },
              { onConflict: "owner_id,date,metric_id" }
            );

          if (!upsertError) totalSynced++;
        }
      }
    } catch (e) {
      errors.push(`${dataType}: ${e instanceof Error ? e.message : "Unknown error"}`);
    }
  }

  return { synced: totalSynced, errors, details };
}
