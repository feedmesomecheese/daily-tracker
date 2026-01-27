import { NextResponse } from "next/server";
import { supabaseServerFromRequest } from "@/lib/supabaseServer";

function csvEscape(v: string) {
  if (v == null) return "";
  // wrap if needed; escape quotes
  if (/[",\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

export async function GET(req: Request) {
  const supabase = supabaseServerFromRequest(req);
  const url = new URL(req.url);

  const start = url.searchParams.get("start"); // optional YYYY-MM-DD
  const end = url.searchParams.get("end");     // optional YYYY-MM-DD
  const includeArchived = url.searchParams.get("archived") === "1";
  const includePrivate = url.searchParams.get("private") === "1";

  const isISODate = (s: string | null) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
  if ((start && !isISODate(start)) || (end && !isISODate(end))) {
    return NextResponse.json(
      { error: "Invalid start/end. Use YYYY-MM-DD." },
      { status: 400 }
    );
  }

  // Auth
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // 1) Metric columns (filtered by archived/private params)
  const { data: cfg, error: cfgErr } = await supabase
    .from("config")
    .select("metric_id, type, private, active, group_order, group, metric_order")
    .eq("owner_id", user.id)
    .order("group_order", { ascending: true, nullsFirst: false })
    .order("group", { ascending: true, nullsFirst: true })
    .order("metric_order", { ascending: true, nullsFirst: false })
    .order("metric_id", { ascending: true });

  if (cfgErr) {
    return NextResponse.json({ error: cfgErr.message }, { status: 500 });
  }

  const metricIds =
    (cfg ?? [])
      .filter((c: any) => {
        if (!includeArchived && !(c.active ?? true)) return false;
        if (!includePrivate && c.private) return false;
        return true;
      })
      .map((c: any) => String(c.metric_id)) ?? [];

  const typeById = new Map<string, string>();
    for (const c of cfg ?? []) {
    typeById.set(String(c.metric_id), String((c as any).type));
  }


  // 2) Load log rows (optionally ranged)
  // Fetch ALL log rows via pagination.
    // PostgREST/Supabase often caps max rows per request (commonly 1000),
    // so keep pageSize at 1000 to avoid server errors/timeouts.
    const rows: any[] = [];
    const pageSize = 1000;
    let from = 0;

    // Safety: prevent infinite loops if the backend keeps returning the same page
    let pages = 0;
    const maxPages = 5000; // absurdly high; prevents runaway loops

    while (true) {
    pages++;
    if (pages > maxPages) {
        return NextResponse.json(
        { error: `Export aborted: exceeded maxPages (${maxPages}).` },
        { status: 500 }
        );
    }

    let q = supabase
        .from("log")
        .select("date, metric_id, value, value_text")
        .eq("owner_id", user.id)
        .order("date", { ascending: true })
        .order("metric_id", { ascending: true })
        .range(from, from + pageSize - 1);

    if (start) q = q.gte("date", start);
    if (end) q = q.lte("date", end);

    const { data, error } = await q;

    if (error) {
        // Return the actual supabase error message so we can see what's wrong
        return NextResponse.json(
        {
            error: "Log fetch failed during export",
            details: error.message,
            hint: (error as any).hint,
            code: (error as any).code,
            from,
            to: from + pageSize - 1,
        },
        { status: 500 }
        );
    }

    const batch = data ?? [];
    rows.push(...batch);

    // If we got fewer than a full page, we're done.
    if (batch.length < pageSize) break;

    from += pageSize;
    }

  // 3) Pivot date -> metric_id -> value
  const dateSet = new Set<string>();
  type Cell = { value: number | null; value_text: string | null };

  const byDate = new Map<string, Map<string, Cell>>();

  for (const r of rows ?? []) {
    dateSet.add(r.date);

    if (!byDate.has(r.date)) byDate.set(r.date, new Map<string, Cell>());

    byDate.get(r.date)!.set(String(r.metric_id), {
        value: (r as any).value ?? null,
        value_text: (r as any).value_text ?? null,
    });
  }


  const dates = Array.from(dateSet).sort(); // YYYY-MM-DD sorts correctly

  // 4) Build CSV
  const header = ["date", ...metricIds].map(csvEscape).join(",");
  const lines: string[] = [header];

  for (const d of dates) {
    const m: Map<string, Cell> = byDate.get(d) ?? new Map<string, Cell>();
    const cells: string[] = [d];

    for (const mid of metricIds) {
        const cell = m.get(mid);
        const t = typeById.get(mid);

        if (!cell) {
            cells.push("");
            continue;
        }

        if (t === "text") {
            cells.push(cell.value_text == null ? "" : String(cell.value_text));
        } else {
            cells.push(cell.value == null ? "" : String(cell.value));
        }
    }

    lines.push(cells.map(csvEscape).join(","));
  }

  const csvText = lines.join("\n");

  return new Response(csvText, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="daily-tracker-wide${start ? `_${start}` : ""}${end ? `_to_${end}` : ""}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
