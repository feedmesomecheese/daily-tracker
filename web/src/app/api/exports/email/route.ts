import { NextResponse } from "next/server";
import { supabaseServerFromRequest } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sendBackupEmail, ALL_MODULES, type BackupModule } from "@/lib/emailBackup";

// POST /api/exports/email
// Sends a backup email immediately for the authenticated user.
export async function POST(req: Request) {
  const supabase = supabaseServerFromRequest(req);
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  // Load backup settings
  const { data: settingsRow } = await supabaseAdmin
    .from("user_settings")
    .select("settings")
    .eq("owner_id", user.id)
    .maybeSingle();

  const backup = (settingsRow?.settings as Record<string, unknown>)?.email_backup as Record<string, unknown> | undefined;
  const rawModules = Array.isArray(backup?.modules) ? backup.modules as string[] : ALL_MODULES;
  const modules = rawModules.filter((m): m is BackupModule => ALL_MODULES.includes(m as BackupModule));

  if (modules.length === 0) return NextResponse.json({ error: "No modules selected" }, { status: 400 });

  // Get user email from auth
  const { data: { user: authUser } } = await supabaseAdmin.auth.admin.getUserById(user.id);
  const email = authUser?.email;
  if (!email) return NextResponse.json({ error: "No email on account" }, { status: 400 });

  await sendBackupEmail(user.id, email, modules);

  // Update last_sent_at
  const nextSettings = {
    ...(settingsRow?.settings as object ?? {}),
    email_backup: { ...(backup ?? {}), last_sent_at: new Date().toISOString() },
  };
  await supabaseAdmin
    .from("user_settings")
    .upsert({ owner_id: user.id, settings: nextSettings }, { onConflict: "owner_id" });

  return NextResponse.json({ success: true });
}
