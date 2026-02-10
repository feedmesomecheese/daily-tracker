import { NextResponse } from "next/server";
import { supabaseServerFromRequest } from "@/lib/supabaseServer";

const OURA_AUTH_URL = "https://cloud.ouraring.com/oauth/authorize";
const OURA_SCOPES = [
  "daily",
  "heartrate",
  "personal",
  "session",
  "sleep",
  "workout",
];

export async function GET(req: Request) {
  const supabase = supabaseServerFromRequest(req);

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const clientId = process.env.OURA_CLIENT_ID;
  const redirectUri = process.env.OURA_REDIRECT_URI;

  if (!clientId || !redirectUri) {
    return NextResponse.json(
      { error: "Oura integration not configured" },
      { status: 500 }
    );
  }

  // Generate a state token to prevent CSRF
  const state = Buffer.from(
    JSON.stringify({
      user_id: user.id,
      timestamp: Date.now(),
    })
  ).toString("base64url");

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: OURA_SCOPES.join(" "),
    state,
  });

  const authUrl = `${OURA_AUTH_URL}?${params}`;

  return NextResponse.json({ auth_url: authUrl });
}
