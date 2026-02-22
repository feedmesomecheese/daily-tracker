import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { decrypt } from "@/lib/encryption";
import { getLocalDateString } from "@/lib/dateUtils";
import { refreshOuraToken, performOuraSync } from "@/lib/oura-sync";

/**
 * GET /api/cron/oura-sync
 *
 * Runs hourly via Vercel Cron. For each Oura integration with auto_sync enabled,
 * checks if the current local hour matches the user's configured sync hour,
 * then syncs yesterday + today if not already synced today.
 *
 * Timezone is read from USER_TIMEZONE env var (set in Vercel project settings).
 */
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tz = process.env.USER_TIMEZONE || "America/New_York";
  const now = new Date();

  // Get current local hour (0–23). % 24 handles midnight edge case in some environments.
  const currentHour =
    parseInt(new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hour12: false }).format(now), 10) % 24;
  const today = getLocalDateString(now, tz);
  const yesterday = getLocalDateString(new Date(now.getTime() - 86_400_000), tz);

  console.log(`[CRON] oura-sync: ${today}, hour=${currentHour} (${tz})`);

  const { data: integrations, error } = await supabaseAdmin
    .from("integrations")
    .select("*")
    .eq("provider", "oura");

  if (error) {
    console.error("[CRON] Failed to fetch integrations:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let synced = 0;
  let skipped = 0;

  for (const integration of integrations || []) {
    const syncConfig = integration.sync_config || {};

    if (!syncConfig.auto_sync) { skipped++; continue; }

    const syncHour: number = syncConfig.auto_sync_hour ?? 7;
    if (currentHour !== syncHour) { skipped++; continue; }

    // Skip if already synced today
    if (integration.last_sync_at) {
      const lastSyncDate = getLocalDateString(new Date(integration.last_sync_at), tz);
      if (lastSyncDate >= today) { skipped++; continue; }
    }

    console.log(`[CRON] Syncing Oura for user ${integration.owner_id}`);

    try {
      let accessToken = decrypt(integration.access_token);
      if (integration.token_expires_at && new Date(integration.token_expires_at) < now) {
        const newToken = await refreshOuraToken(supabaseAdmin, integration);
        if (!newToken) {
          console.error(`[CRON] Failed to refresh token for ${integration.owner_id}`);
          continue;
        }
        accessToken = newToken;
      }

      const result = await performOuraSync(supabaseAdmin, {
        userId: integration.owner_id,
        accessToken,
        startDate: yesterday,
        endDate: today,
        metricMapping: syncConfig.metric_mapping || {},
        overwriteManual: syncConfig.overwrite_manual || false,
      });

      const completedAt = new Date().toISOString();

      await supabaseAdmin
        .from("integrations")
        .update({ last_sync_at: completedAt, updated_at: completedAt })
        .eq("id", integration.id);

      await supabaseAdmin
        .from("integration_sync_log")
        .insert({
          integration_id: integration.id,
          status: result.errors.length > 0 ? "partial" : "success",
          date_range_start: yesterday,
          date_range_end: today,
          started_at: now.toISOString(),
          completed_at: completedAt,
          records_synced: result.synced,
          error_message: result.errors.length > 0 ? result.errors.join("; ") : null,
          details: result.details,
        });

      console.log(`[CRON] Synced ${result.synced} records for ${integration.owner_id}`);
      synced++;
    } catch (e) {
      console.error(`[CRON] Error syncing ${integration.owner_id}:`, e);
    }
  }

  return NextResponse.json({ ok: true, synced, skipped });
}
