import { NextResponse } from "next/server";
import { sendAccessRequestEmail } from "@/lib/email";

// Simple in-memory rate limit: 1 request per email per hour
const rateLimitMap = new Map<string, number>();

export async function POST(request: Request) {
  try {
    const { email, name, message } = await request.json();

    if (!email || typeof email !== "string") {
      return NextResponse.json({ ok: true }); // prevent enumeration
    }

    // Rate limit check
    const key = email.toLowerCase().trim();
    const lastRequest = rateLimitMap.get(key);
    const now = Date.now();
    if (lastRequest && now - lastRequest < 60 * 60 * 1000) {
      // Already sent within the hour — return ok to prevent enumeration
      return NextResponse.json({ ok: true });
    }

    rateLimitMap.set(key, now);

    // Clean up old entries periodically
    if (rateLimitMap.size > 1000) {
      const cutoff = now - 60 * 60 * 1000;
      for (const [k, v] of rateLimitMap) {
        if (v < cutoff) rateLimitMap.delete(k);
      }
    }

    await sendAccessRequestEmail({ email: key, name, message });

    return NextResponse.json({ ok: true });
  } catch {
    // Always return ok to prevent enumeration
    return NextResponse.json({ ok: true });
  }
}
