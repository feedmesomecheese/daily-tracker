import { createBrowserClient } from "@supabase/ssr";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Cookie options for persistent sessions (30 days)
const cookieOptions = {
  maxAge: 60 * 60 * 24 * 30, // 30 days in seconds
  path: "/",
  sameSite: "lax" as const,
  secure: typeof window !== "undefined" && window.location.protocol === "https:",
};

// This client runs in the browser and uses cookies for session persistence
// which is more reliable on mobile browsers than localStorage
export const supabaseBrowser = createBrowserClient(url, anonKey, {
  cookies: {
    // Custom cookie handling to ensure persistent cookies with proper expiration
    get(name: string) {
      if (typeof document === "undefined") return undefined;
      const cookies = document.cookie.split("; ");
      const cookie = cookies.find((c) => c.startsWith(`${name}=`));
      return cookie ? decodeURIComponent(cookie.split("=")[1]) : undefined;
    },
    set(name: string, value: string, options?: { maxAge?: number; path?: string }) {
      if (typeof document === "undefined") return;
      const opts = { ...cookieOptions, ...options };
      let cookieStr = `${name}=${encodeURIComponent(value)}`;
      if (opts.maxAge) cookieStr += `; max-age=${opts.maxAge}`;
      if (opts.path) cookieStr += `; path=${opts.path}`;
      if (opts.sameSite) cookieStr += `; samesite=${opts.sameSite}`;
      if (opts.secure) cookieStr += `; secure`;
      document.cookie = cookieStr;
    },
    remove(name: string, options?: { path?: string }) {
      if (typeof document === "undefined") return;
      const path = options?.path || "/";
      document.cookie = `${name}=; max-age=0; path=${path}`;
    },
  },
});
