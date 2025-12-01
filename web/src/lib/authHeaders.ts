"use client";

import { supabaseBrowser } from "./supabaseBrowser";

export async function getAuthHeaders(): Promise<HeadersInit> {
  const { data, error } = await supabaseBrowser.auth.getSession();
  if (error || !data.session) {
    return {};
  }
  const token = data.session.access_token;
  return { Authorization: `Bearer ${token}` };
}
