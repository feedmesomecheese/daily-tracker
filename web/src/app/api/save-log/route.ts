import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { supabaseServerFromRequest } from "@/lib/supabaseServer";

type Entry = {
  metric_id: string;
  value: number | null;
  value_text?: string | null;
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
  const body = await req.json();
  const { date, entries } = body as {
    date: string;
    entries: {
      metric_id: string;
      value: number | null;
      value_text?: string | null;
    }[];
  };

  if (!date || !Array.isArray(entries)) {
    return NextResponse.json(
      { error: "Invalid payload: date or entries missing" },
      { status: 400 }
    );
  }

  console.log("SAVE-LOG parsed:", {
    owner_id: user.id,
    date,
    entriesCount: entries.length,
  });

  const normalizeText = (s: any): string | null => {
    if (s == null) return null;
    const t = String(s);
    return t.trim() === "" ? null : t;
  };

  const toUpsert = entries.filter((e) => {
    const hasNumber = e.value !== null;
    const hasText = normalizeText(e.value_text) !== null;
    return hasNumber || hasText;
  });

  const toDelete = entries.filter((e) => {
    const noNumber = e.value === null;
    const noText = normalizeText(e.value_text) === null;
    return noNumber && noText;
  });

  // Upsert non-null values
  if (toUpsert.length > 0) {
    const { error: upsertErr } = await supabase
      .from("log")
      .upsert(
        toUpsert.map((e) => ({
          owner_id: user.id,
          date,
          metric_id: e.metric_id,
          value: e.value,
          value_text: normalizeText(e.value_text),
        })),
        { onConflict: "owner_id,date,metric_id" }
      );

    if (upsertErr) {
      return NextResponse.json({ error: upsertErr.message }, { status: 500 });
    }
  }


  // Delete entries that were cleared (value === null)
  if (toDelete.length > 0) {
    const { error: delErr } = await supabase
      .from("log")
      .delete()
      .eq("owner_id", user.id)
      .eq("date", date)
      .in(
        "metric_id",
        toDelete.map((e) => e.metric_id)
      );

    if (delErr) {
      return NextResponse.json({ error: delErr.message }, { status: 500 });
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
