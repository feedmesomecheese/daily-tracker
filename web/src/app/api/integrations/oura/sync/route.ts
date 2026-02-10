import { NextResponse } from "next/server";
import { supabaseServerFromRequest } from "@/lib/supabaseServer";
import { decrypt, encrypt } from "@/lib/encryption";

const OURA_API_BASE = "https://api.ouraring.com/v2/usercollection";
const OURA_TOKEN_URL = "https://api.ouraring.com/oauth/token";

// Oura data types and their corresponding metrics
const OURA_DATA_TYPES = {
  sleep: {
    endpoint: "/daily_sleep",
    metrics: {
      sleep_duration: { field: "contributors.total_sleep", transform: "seconds_to_minutes" },
      sleep_efficiency: { field: "score", transform: null },
      deep_sleep: { field: "contributors.deep_sleep", transform: "seconds_to_minutes" },
      rem_sleep: { field: "contributors.rem_sleep", transform: "seconds_to_minutes" },
      light_sleep: { field: "contributors.total_sleep", transform: "calc_light_sleep" },
    },
  },
  readiness: {
    endpoint: "/daily_readiness",
    metrics: {
      readiness_score: { field: "score", transform: null },
      resting_heart_rate: { field: "contributors.resting_heart_rate", transform: null },
      hrv_average: { field: "contributors.hrv_balance", transform: null },
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

async function refreshToken(
  supabase: ReturnType<typeof supabaseServerFromRequest>,
  integration: { id: string; owner_id: string; refresh_token: string }
): Promise<string | null> {
  const clientId = process.env.OURA_CLIENT_ID;
  const clientSecret = process.env.OURA_CLIENT_SECRET;

  if (!clientId || !clientSecret || !integration.refresh_token) {
    return null;
  }

  try {
    const decryptedRefreshToken = decrypt(integration.refresh_token);

    const res = await fetch(OURA_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: decryptedRefreshToken,
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
        refresh_token: tokens.refresh_token ? encrypt(tokens.refresh_token) : integration.refresh_token,
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

export async function POST(req: Request) {
  const supabase = supabaseServerFromRequest(req);

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await req.json();
  const { start_date, end_date, data_types } = body as {
    start_date?: string;
    end_date?: string;
    data_types?: string[];
  };

  // Get integration
  const { data: integration, error: intError } = await supabase
    .from("integrations")
    .select("*")
    .eq("owner_id", user.id)
    .eq("provider", "oura")
    .single();

  if (intError || !integration) {
    return NextResponse.json({ error: "Oura not connected" }, { status: 400 });
  }

  // Check if token needs refresh
  let accessToken = decrypt(integration.access_token);
  if (integration.token_expires_at) {
    const expiresAt = new Date(integration.token_expires_at);
    if (expiresAt < new Date()) {
      const newToken = await refreshToken(supabase, integration);
      if (!newToken) {
        return NextResponse.json({ error: "Failed to refresh token" }, { status: 401 });
      }
      accessToken = newToken;
    }
  }

  // Create sync log entry
  const { data: syncLog, error: syncLogError } = await supabase
    .from("integration_sync_log")
    .insert({
      integration_id: integration.id,
      status: "running",
      date_range_start: start_date,
      date_range_end: end_date,
    })
    .select()
    .single();

  if (syncLogError) {
    console.error("Failed to create sync log:", syncLogError);
  }

  // Default date range: last 7 days
  const endDate = end_date || new Date().toISOString().slice(0, 10);
  const startDate =
    start_date ||
    new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const typesToSync = data_types || Object.keys(OURA_DATA_TYPES);
  const syncConfig = integration.sync_config || {};
  const metricMapping = syncConfig.metric_mapping || {};
  const overwriteManual = syncConfig.overwrite_manual || false;

  let totalSynced = 0;
  const errors: string[] = [];
  const details: Record<string, unknown> = {};

  for (const dataType of typesToSync) {
    const config = OURA_DATA_TYPES[dataType as keyof typeof OURA_DATA_TYPES];
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
      const items = data.data || [];

      details[dataType] = { fetched: items.length };

      for (const item of items) {
        const date = item.day;

        for (const [metricKey, metricConfig] of Object.entries(config.metrics)) {
          const mapping = metricMapping[metricKey];
          if (!mapping?.enabled) continue;

          const targetMetricId = mapping.metric_id;
          if (!targetMetricId) continue;

          // Get value from nested path
          let value = item;
          for (const key of metricConfig.field.split(".")) {
            value = value?.[key];
          }

          if (value == null) continue;

          // Apply transform
          if (metricConfig.transform === "seconds_to_minutes") {
            value = Math.round(value / 60);
          } else if (metricConfig.transform === "seconds_to_hours") {
            value = Math.round((value / 3600) * 10) / 10;
          }

          // Check if we should overwrite
          if (!overwriteManual) {
            const { data: existing } = await supabase
              .from("log")
              .select("value")
              .eq("owner_id", user.id)
              .eq("date", date)
              .eq("metric_id", targetMetricId)
              .single();

            if (existing?.value != null) continue;
          }

          // Upsert the value
          const { error: upsertError } = await supabase
            .from("log")
            .upsert(
              {
                owner_id: user.id,
                date,
                metric_id: targetMetricId,
                value,
              },
              { onConflict: "owner_id,date,metric_id" }
            );

          if (!upsertError) {
            totalSynced++;
          }
        }
      }
    } catch (e) {
      errors.push(`${dataType}: ${e instanceof Error ? e.message : "Unknown error"}`);
    }
  }

  // Update sync log
  if (syncLog) {
    await supabase
      .from("integration_sync_log")
      .update({
        completed_at: new Date().toISOString(),
        status: errors.length > 0 ? "partial" : "success",
        records_synced: totalSynced,
        error_message: errors.length > 0 ? errors.join("; ") : null,
        details,
      })
      .eq("id", syncLog.id);
  }

  // Update last sync timestamp
  await supabase
    .from("integrations")
    .update({
      last_sync_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", integration.id);

  return NextResponse.json({
    synced: totalSynced,
    errors,
    details,
    date_range: { start: startDate, end: endDate },
  });
}
