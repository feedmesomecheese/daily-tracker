import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sendBackupEmail, ALL_MODULES, type BackupModule } from "@/lib/emailBackup";

type BackupSettings = {
  enabled?: boolean;
  frequency?: "daily" | "weekly" | "monthly";
  modules?: string[];
  last_sent_at?: string | null;
};

function isDue(settings: BackupSettings): boolean {
  if (!settings.enabled) return false;
  const freq = settings.frequency ?? "weekly";
  if (freq === "daily") return true;

  const last = settings.last_sent_at ? new Date(settings.last_sent_at) : null;
  if (!last) return true; // never sent

  const now = new Date();
  const diffDays = (now.getTime() - last.getTime()) / (1000 * 60 * 60 * 24);
  if (freq === "weekly") return diffDays >= 7;
  if (freq === "monthly") return diffDays >= 30;
  return false;
}

// GET /api/cron/email-backup
// Called daily by Vercel Cron. Sends backups to all users who are due.
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Fetch all user settings that have email_backup configured
  const { data: rows } = await supabaseAdmin
    .from("user_settings")
    .select("owner_id, settings");

  if (!rows || rows.length === 0) return NextResponse.json({ sent: 0 });

  let sent = 0;
  for (const row of rows) {
    const backup = (row.settings as Record<string, unknown>)?.email_backup as BackupSettings | undefined;
    if (!backup || !isDue(backup)) continue;

    const rawModules = Array.isArray(backup.modules) ? backup.modules : ALL_MODULES;
    const modules = rawModules.filter((m): m is BackupModule => ALL_MODULES.includes(m as BackupModule));
    if (modules.length === 0) continue;

    // Get user email
    const { data: { user } } = await supabaseAdmin.auth.admin.getUserById(row.owner_id);
    const email = user?.email;
    if (!email) continue;

    try {
      await sendBackupEmail(row.owner_id, email, modules);

      // Update last_sent_at
      const nextSettings = {
        ...(row.settings as object),
        email_backup: { ...backup, last_sent_at: new Date().toISOString() },
      };
      await supabaseAdmin
        .from("user_settings")
        .update({ settings: nextSettings })
        .eq("owner_id", row.owner_id);

      sent++;
    } catch (err) {
      console.error(`Backup failed for ${row.owner_id}:`, err);
    }
  }

  return NextResponse.json({ sent });
}
