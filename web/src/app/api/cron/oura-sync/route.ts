import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { decrypt } from "@/lib/encryption";
import { getLocalDateString } from "@/lib/dateUtils";
import { refreshOuraToken, performOuraSync } from "@/lib/oura-sync";

/**
 * GET /api/cron/oura-sync
 *
 * Runs daily at noon UTC via Vercel Cron (≈ 7am EST / 6am CST / 4am PST).
 * Syncs yesterday + today for all Oura integrations with auto_sync enabled,
 * skipping any that have already been synced today.
 */
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  console.log(`[CRON] oura-sync: UTC=${now.toISOString()}`);

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

    const tz: string = syncConfig.timezone || process.env.USER_TIMEZONE || "America/New_York";
    const today = getLocalDateString(now, tz);
    const yesterday = getLocalDateString(new Date(now.getTime() - 86_400_000), tz);

    // Skip if already synced today
    if (integration.last_sync_at) {
      const lastSyncDate = getLocalDateString(new Date(integration.last_sync_at), tz);
      if (lastSyncDate >= today) { skipped++; continue; }
    }

    console.log(`[CRON] Syncing Oura for user ${integration.owner_id} (${tz})`);

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
