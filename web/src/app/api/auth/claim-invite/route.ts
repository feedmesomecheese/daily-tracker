import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function POST(request: Request) {
  try {
    const { code, userId } = await request.json();

    if (!code || !userId) {
      return NextResponse.json(
        { error: "Code and userId are required" },
        { status: 400 }
      );
    }

    // Verify the caller is authenticated as the claimed user
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll() {},
        },
      }
    );

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user || user.id !== userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Find and validate the invite code
    const { data: invite, error: findError } = await supabaseAdmin
      .from("invite_codes")
      .select("id, max_uses, use_count")
      .eq("code", code.trim().toUpperCase())
      .single();

    if (findError || !invite) {
      return NextResponse.json(
        { error: "Invalid invite code" },
        { status: 400 }
      );
    }

    if (invite.use_count >= invite.max_uses) {
      return NextResponse.json(
        { error: "Invite code already used" },
        { status: 400 }
      );
    }

    // Claim the invite code
    const { error: updateError } = await supabaseAdmin
      .from("invite_codes")
      .update({
        use_count: invite.use_count + 1,
        used_at: new Date().toISOString(),
        used_by: userId,
      })
      .eq("id", invite.id);

    if (updateError) {
      console.error("Failed to claim invite code:", updateError);
      return NextResponse.json(
        { error: "Failed to claim invite code" },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}
