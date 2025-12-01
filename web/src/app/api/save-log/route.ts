import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { supabaseServerFromRequest } from "@/lib/supabaseServer";

type Entry = {
  metric_id: string;
  value: number | null;
};

export async function POST(req: Request) {
  const supabase = supabaseServerFromRequest(req);

  // Auth
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json(
      { error: "Not authenticated" },
      { status: 401 }
    );
  }

  const owner_id = user.id;

  // Parse body
  let body: { date: string; entries: Entry[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const { date, entries } = body;

  if (!date || !Array.isArray(entries)) {
    return NextResponse.json(
      { error: "date and entries are required" },
      { status: 400 }
    );
  }

  const toUpsert = entries.filter((e) => e.value !== null);
  const toDelete = entries.filter((e) => e.value === null);

  // Upsert non-null values
  if (toUpsert.length > 0) {
    const { error } = await supabaseAdmin
      .from("log")
      .upsert(
        toUpsert.map((e) => ({
          owner_id,
          date,
          metric_id: e.metric_id,
          value: e.value,
        })),
        {
          onConflict: "owner_id,date,metric_id",
        }
      );

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }
  }

  // Delete entries that were cleared (value === null)
  if (toDelete.length > 0) {
    const metricIds = toDelete.map((e) => e.metric_id);

    const { error } = await supabaseAdmin
      .from("log")
      .delete()
      .eq("owner_id", owner_id)
      .eq("date", date)
      .in("metric_id", metricIds);

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }
  }

  // Auto-populate start_date for metrics that don't have it yet
  if (toUpsert.length > 0) {
    const metricIds = Array.from(new Set(toUpsert.map((e) => e.metric_id)));

    const { error } = await supabaseAdmin
      .from("config")
      .update({ start_date: date })
      .eq("owner_id", owner_id)
      .is("start_date", null)
      .in("metric_id", metricIds);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
