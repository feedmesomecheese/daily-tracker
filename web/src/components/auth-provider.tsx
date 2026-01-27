"use client";

import { useEffect } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { useRouter } from "next/navigation";

/**
 * AuthProvider component that handles auth state changes.
 * Wraps the app to ensure sessions are properly maintained.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();

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

  return <>{children}</>;
}
