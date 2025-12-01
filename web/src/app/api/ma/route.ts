import { NextResponse } from "next/server";
import { supabaseServerFromRequest } from "@/lib/supabaseServer";

export async function GET(req: Request) {
  const supabase = supabaseServerFromRequest(req);
  const url = new URL(req.url);
  const metricId = url.searchParams.get("metric_id");
  const periodStr = url.searchParams.get("period");

  if (!metricId) {
    return NextResponse.json(
      { error: "metric_id is required" },
      { status: 400 }
    );
  }

  const period = periodStr ? parseInt(periodStr, 10) : 30;
  if (!Number.isFinite(period) || period <= 0 || period > 3650) {
    return NextResponse.json(
      { error: "Invalid period" },
      { status: 400 }
    );
  }

  // 1) Moving average series via SQL function
  const { data: maData, error: maError } = await supabase.rpc(
    "get_moving_average",
    {
      _metric_id: metricId,
      _period: period,
    }
  );

  if (maError) {
    return NextResponse.json(
      { error: maError.message },
      { status: 500 }
    );
  }

  // 2) Raw daily values for this metric (one value per day)
  const { data: rawData, error: rawError } = await supabase
    .from("log")
    .select("date,value")
    .eq("metric_id", metricId)
    .order("date");

  if (rawError) {
    return NextResponse.json(
      { error: rawError.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ma: maData ?? [],
    raw: rawData ?? [],
  });
}
