import { NextResponse } from "next/server";
import { supabaseServerFromRequest } from "@/lib/supabaseServer";
import { recalculateFromDate, backfillAllCalculations } from "@/lib/recalculate";

/**
 * POST /api/backfill
 *
 * Recalculate all calculated metrics for a date range.
 *
 * Body options:
 * - { fromDate: "YYYY-MM-DD" } - Recalculate from this date to today
 * - { fromDate: "YYYY-MM-DD", toDate: "YYYY-MM-DD" } - Recalculate a specific range
 * - { all: true } - Backfill all historical data (use sparingly)
 */
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

  const body = await req.json();
  const { fromDate, toDate, all } = body as {
    fromDate?: string;
    toDate?: string;
    all?: boolean;
  };

  console.log("BACKFILL request:", { owner_id: user.id, fromDate, toDate, all });

  let result;

  if (all) {
    // Full historical backfill
    result = await backfillAllCalculations(supabase, user.id);
  } else if (fromDate) {
    // Backfill from specific date
    result = await recalculateFromDate(supabase, user.id, fromDate, toDate);
  } else {
    return NextResponse.json(
      { error: "Must specify 'fromDate' or 'all: true'" },
      { status: 400 }
    );
  }

  console.log("BACKFILL complete:", result);

  if (!result.success) {
    return NextResponse.json(
      {
        error: "Backfill completed with errors",
        daysProcessed: result.daysProcessed,
        errors: result.errors,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    daysProcessed: result.daysProcessed,
    errors: result.errors,
  });
}
