"use client";

import { supabaseBrowser } from "./supabaseBrowser";

/** Browser timezone, cached once */
const browserTz = typeof window !== "undefined"
  ? Intl.DateTimeFormat().resolvedOptions().timeZone
  : undefined;

// Set a cookie so the server can read the timezone on any request
if (typeof document !== "undefined" && browserTz) {
  document.cookie = `tz=${encodeURIComponent(browserTz)};path=/;max-age=31536000;SameSite=Lax`;
}

export async function getAuthHeaders(): Promise<HeadersInit> {
  const { data, error } = await supabaseBrowser.auth.getSession();
  if (error || !data.session) {
    return {};
  }
  const token = data.session.access_token;
  return { Authorization: `Bearer ${token}` };
}
