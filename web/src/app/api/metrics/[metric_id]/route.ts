import { NextResponse } from "next/server";
import { supabaseServerFromRequest } from "@/lib/supabaseServer";

async function getAuthedClient(req: Request) {
  const supabase = supabaseServerFromRequest(req);
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return { supabase: null, user: null };
  }
  return { supabase, user };
}

// DELETE /api/metrics/[metric_id]
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ metric_id: string }> }
) {
  const { supabase, user } = await getAuthedClient(req);
  if (!supabase || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { metric_id } = await params;
  if (!metric_id) {
    return NextResponse.json({ error: "metric_id is required" }, { status: 400 });
  }

  // Delete from config table
  const { error: configError } = await supabase
    .from("config")
    .delete()
    .eq("owner_id", user.id)
    .eq("metric_id", metric_id);

  if (configError) {
    return NextResponse.json(
      { error: configError.message || "Failed to delete metric" },
      { status: 500 }
    );
  }

  // Optionally: also delete associated log entries
  // This is commented out to preserve historical data
  // const { error: logError } = await supabase
  //   .from("log")
  //   .delete()
  //   .eq("owner_id", user.id)
  //   .eq("metric_id", metric_id);

  return NextResponse.json({ ok: true });
}
