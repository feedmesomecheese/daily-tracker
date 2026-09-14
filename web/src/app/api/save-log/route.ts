import { NextResponse } from "next/server";
import { supabaseServerFromRequest } from "@/lib/supabaseServer";
import { saveLogEntries, type LogEntryInput } from "@/lib/domain/saveLog";

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
  const { date, entries } = body as { date: string; entries: LogEntryInput[] };

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

  try {
    const result = await saveLogEntries(supabase, user.id, date, entries);

    console.log("SAVE-LOG complete:", {
      date,
      upserted: result.upserted,
      deleted: result.deleted,
      recalcDays: result.recalculated,
      newAchievements: result.new_achievements.length,
    });

    return NextResponse.json({
      ok: true,
      recalculated: result.recalculated,
      new_achievements: result.new_achievements,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
