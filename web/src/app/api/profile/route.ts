import { NextResponse } from "next/server";
import { supabaseServerFromRequest } from "@/lib/supabaseServer";

async function getAuth(req: Request) {
  const supabase = supabaseServerFromRequest(req);
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, userId: user?.id ?? null };
}

export async function GET(req: Request) {
  const { supabase, userId } = await getAuth(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data } = await supabase
    .from("user_profile")
    .select("gender, birth_year")
    .eq("owner_id", userId)
    .single();

  // Return empty profile if none exists yet
  return NextResponse.json(data ?? { gender: null, birth_year: null });
}

export async function PATCH(req: Request) {
  const { supabase, userId } = await getAuth(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { gender, birth_year } = await req.json();

  const { data, error } = await supabase
    .from("user_profile")
    .upsert(
      { owner_id: userId, gender: gender ?? null, birth_year: birth_year ?? null, updated_at: new Date().toISOString() },
      { onConflict: "owner_id" }
    )
    .select("gender, birth_year")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
