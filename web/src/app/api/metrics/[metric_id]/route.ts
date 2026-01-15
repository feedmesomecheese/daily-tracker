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

  // First, verify the metric exists and belongs to this user
  const { data: existing, error: checkError } = await supabase
    .from("config")
    .select("metric_id")
    .eq("owner_id", user.id)
    .eq("metric_id", metric_id)
    .single();

  if (checkError || !existing) {
    return NextResponse.json(
      { error: "Metric not found or already deleted" },
      { status: 404 }
    );
  }

  // Delete associated log entries first (required due to foreign key constraint)
  const { data: deletedLogs, error: logError } = await supabase
    .from("log")
    .delete()
    .eq("owner_id", user.id)
    .eq("metric_id", metric_id)
    .select("date");

  if (logError) {
    console.error("Delete log entries error:", logError);
    return NextResponse.json(
      { error: logError.message || "Failed to delete log entries" },
      { status: 500 }
    );
  }

  console.log("Deleted log entries for metric:", metric_id, "count:", deletedLogs?.length ?? 0);

  // Now delete from config table
  const { data: deleted, error: configError } = await supabase
    .from("config")
    .delete()
    .eq("owner_id", user.id)
    .eq("metric_id", metric_id)
    .select("metric_id");

  if (configError) {
    console.error("Delete config error:", configError);
    return NextResponse.json(
      { error: configError.message || "Failed to delete metric" },
      { status: 500 }
    );
  }

  console.log("Deleted metric:", metric_id);

  return NextResponse.json({
    ok: true,
    deleted_logs: deletedLogs?.length ?? 0
  });
}
