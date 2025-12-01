import { NextResponse } from "next/server";
import { supabaseServerFromRequest } from "@/lib/supabaseServer";

export async function GET(req: Request) {
  const supabase = supabaseServerFromRequest(req);

  // 1) Get current user (auth)
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

  // 2) Load ONLY this user's config rows
  const { data, error } = await supabase
    .from("config")
    .select("*")
    .eq("owner_id", user.id)
    .order("metric_id");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // 3) IMPORTANT: keep the original shape (array),
  // because other pages already expect that.
  return NextResponse.json(data ?? []);
}
