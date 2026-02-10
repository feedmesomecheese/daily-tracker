import { NextResponse } from "next/server";
import { supabaseServerFromRequest } from "@/lib/supabaseServer";

export async function GET(req: Request) {
  const supabase = supabaseServerFromRequest(req);

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Get integration
  const { data: integration, error: intError } = await supabase
    .from("integrations")
    .select("id, provider, last_sync_at, sync_config, token_expires_at, created_at")
    .eq("owner_id", user.id)
    .eq("provider", "oura")
    .single();

  if (intError || !integration) {
    return NextResponse.json({ connected: false });
  }

  // Get sync history
  const { data: syncHistory } = await supabase
    .from("integration_sync_log")
    .select("*")
    .eq("integration_id", integration.id)
    .order("started_at", { ascending: false })
    .limit(10);

  // Get available metrics for mapping
  const { data: metrics } = await supabase
    .from("config")
    .select("metric_id, metric_name, type")
    .eq("owner_id", user.id)
    .eq("active", true)
    .order("metric_name");

  return NextResponse.json({
    connected: true,
    integration: {
      id: integration.id,
      provider: integration.provider,
      last_sync_at: integration.last_sync_at,
      sync_config: integration.sync_config,
      created_at: integration.created_at,
      token_expires_at: integration.token_expires_at,
    },
    sync_history: syncHistory || [],
    available_metrics: metrics || [],
  });
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
  const { sync_config } = body as {
    sync_config: {
      auto_sync?: boolean;
      overwrite_manual?: boolean;
      metric_mapping?: Record<string, { enabled: boolean; metric_id: string }>;
    };
  };

  const { error } = await supabase
    .from("integrations")
    .update({
      sync_config,
      updated_at: new Date().toISOString(),
    })
    .eq("owner_id", user.id)
    .eq("provider", "oura");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const supabase = supabaseServerFromRequest(req);

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { error } = await supabase
    .from("integrations")
    .delete()
    .eq("owner_id", user.id)
    .eq("provider", "oura");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
