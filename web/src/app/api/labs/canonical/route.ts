import { NextResponse } from "next/server";
import { supabaseServerFromRequest } from "@/lib/supabaseServer";

/**
 * PATCH /api/labs/canonical
 * Body: { from: string, to: string }
 * Renames or merges all lab_results with canonical_name = from → to.
 * Works for both rename (to is a new name) and merge (to is an existing canonical name).
 */
export async function PATCH(req: Request) {
  const supabase = supabaseServerFromRequest(req);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { from, to } = body as { from?: string; to?: string };

  if (!from || !to || typeof from !== "string" || typeof to !== "string") {
    return NextResponse.json({ error: "from and to are required strings" }, { status: 400 });
  }

  const fromTrimmed = from.trim();
  const toTrimmed = to.trim();

  if (!fromTrimmed || !toTrimmed) {
    return NextResponse.json({ error: "from and to must not be empty" }, { status: 400 });
  }

  if (fromTrimmed === toTrimmed) {
    return NextResponse.json({ updated: 0 });
  }

  // Find all visits owned by this user
  const { data: visits, error: visitsError } = await supabase
    .from("lab_visits")
    .select("id")
    .eq("owner_id", user.id);

  if (visitsError) return NextResponse.json({ error: visitsError.message }, { status: 500 });
  if (!visits || visits.length === 0) return NextResponse.json({ updated: 0 });

  const visitIds = visits.map((v: { id: string }) => v.id);

  // Update lab_results where canonical_name = from AND visit_id is owned by user
  // Chunk to avoid URL length issues
  let totalUpdated = 0;
  const chunkSize = 200;
  for (let i = 0; i < visitIds.length; i += chunkSize) {
    const chunk = visitIds.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from("lab_results")
      .update({ canonical_name: toTrimmed })
      .eq("canonical_name", fromTrimmed)
      .in("visit_id", chunk)
      .select("id");

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    totalUpdated += data?.length ?? 0;
  }

  return NextResponse.json({ updated: totalUpdated });
}
