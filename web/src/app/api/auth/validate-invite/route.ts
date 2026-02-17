import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(request: Request) {
  try {
    const { code } = await request.json();

    if (!code || typeof code !== "string") {
      return NextResponse.json(
        { valid: false, error: "Invite code is required" },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("invite_codes")
      .select("id, code, max_uses, use_count")
      .eq("code", code.trim().toUpperCase())
      .single();

    if (error || !data) {
      return NextResponse.json({ valid: false, error: "Invalid invite code" });
    }

    if (data.use_count >= data.max_uses) {
      return NextResponse.json({
        valid: false,
        error: "This invite code has already been used",
      });
    }

    return NextResponse.json({ valid: true });
  } catch {
    return NextResponse.json(
      { valid: false, error: "Something went wrong" },
      { status: 500 }
    );
  }
}
