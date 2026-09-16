import { NextResponse } from "next/server";
import { getAgentSupabase } from "@/lib/agent/auth";

/**
 * GET /api/oauth/client-info?client_id=…
 *
 * Just enough for the consent screen to name the app asking for access.
 * Returns the client's display name only — never its secret or registration.
 */
export async function GET(req: Request) {
  const clientId = new URL(req.url).searchParams.get("client_id");
  if (!clientId) {
    return NextResponse.json({ error: "client_id is required" }, { status: 400 });
  }

  const admin = getAgentSupabase();
  const { data } = await admin
    .from("oauth_clients")
    .select("client_id, client_name, redirect_uris")
    .eq("client_id", clientId)
    .maybeSingle();

  if (!data) {
    return NextResponse.json({ error: "Unknown client" }, { status: 404 });
  }

  return NextResponse.json({
    client_id: data.client_id,
    client_name: data.client_name,
    redirect_uris: data.redirect_uris,
  });
}
