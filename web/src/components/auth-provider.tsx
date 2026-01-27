"use client";

import { useEffect, useRef } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { useRouter, usePathname } from "next/navigation";

/**
 * AuthProvider component that handles auth state changes.
 * Wraps the app to ensure sessions are properly maintained.
 *
 * On mount, it proactively refreshes the session to ensure the access token
 * is valid. This is crucial for mobile browsers where the app might be
 * backgrounded for extended periods.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const refreshAttempted = useRef(false);

  useEffect(() => {
    // Proactively refresh session on mount (only once)
    // This ensures we have a valid access token even if the app was closed
    if (!refreshAttempted.current) {
      refreshAttempted.current = true;

      // Don't refresh on login page - user is about to sign in anyway
      if (pathname !== "/login") {
        supabaseBrowser.auth.refreshSession().then(({ data, error }) => {
          if (error) {
            console.log("Session refresh failed:", error.message);
            // Only redirect if we're not already on login page
            if (pathname !== "/login") {
              router.push("/login");
            }
          } else if (data.session) {
            console.log("Session refreshed successfully");
          }
        });
      }
    }
  }, [pathname, router]);

  useEffect(() => {
    // Listen for auth state changes (sign in, sign out, token refresh)
    const {
      data: { subscription },
    } = supabaseBrowser.auth.onAuthStateChange((event, session) => {
      // Handle different auth events
      if (event === "SIGNED_OUT") {
        router.push("/login");
      } else if (event === "TOKEN_REFRESHED") {
        // Token was refreshed successfully - session is still valid
        console.log("Auth token refreshed");
      } else if (event === "SIGNED_IN") {
        // User signed in
        console.log("User signed in");
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [router]);

  useEffect(() => {
    // Refresh session when app comes back to foreground (important for mobile)
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && pathname !== "/login") {
        supabaseBrowser.auth.refreshSession().then(({ error }) => {
          if (error) {
            console.log("Session refresh on visibility failed:", error.message);
            router.push("/login");
          }
        });
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [pathname, router]);

  return <>{children}</>;
}
