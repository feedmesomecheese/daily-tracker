"use client";

import { useState, useEffect } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import Link from "next/link";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState<
    "waiting" | "ready" | "loading" | "success" | "error"
  >("waiting");
  const [message, setMessage] = useState<string | null>(null);

  const passwordTooShort = password.length > 0 && password.length < 8;
  const passwordsMismatch =
    confirmPassword.length > 0 && password !== confirmPassword;
  const canSubmit =
    status === "ready" &&
    password.length >= 8 &&
    password === confirmPassword;

  useEffect(() => {
    const {
      data: { subscription },
    } = supabaseBrowser.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setStatus("ready");
      }
    });

    // Also check if we already have a session (e.g., from the recovery link)
    supabaseBrowser.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setStatus("ready");
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setStatus("loading");
    setMessage(null);
    try {
      const { error } = await supabaseBrowser.auth.updateUser({
        password,
      });
      if (error) {
        setStatus("ready");
        setMessage(error.message || "Failed to update password");
        return;
      }
      setStatus("success");
      setTimeout(() => {
        window.location.href = "/";
      }, 1500);
    } catch (err: unknown) {
      setStatus("ready");
      setMessage(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-muted px-4">
      <div className="bg-card border rounded-xl p-6 w-full max-w-sm space-y-4 shadow-sm">
        <h1 className="text-xl font-semibold text-center">
          Set New Password
        </h1>

        {status === "waiting" && (
          <div className="text-center space-y-3">
            <p className="text-sm text-muted-foreground">
              Verifying your reset link...
            </p>
            <Link
              href="/forgot-password"
              className="text-xs text-muted-foreground hover:text-foreground underline"
            >
              Request a new reset link
            </Link>
          </div>
        )}

        {status === "success" && (
          <div className="text-center space-y-2">
            <p className="text-sm font-medium text-green-700">
              Password updated successfully!
            </p>
            <p className="text-xs text-muted-foreground">
              Redirecting to app...
            </p>
          </div>
        )}

        {(status === "ready" || status === "loading") && (
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="block text-xs mb-1">New Password</label>
              <input
                type="password"
                required
                minLength={8}
                className={`border rounded w-full p-2 text-sm ${
                  passwordTooShort ? "border-red-500" : ""
                }`}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              {passwordTooShort && (
                <p className="text-xs text-red-600 mt-1">
                  Password must be at least 8 characters
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs mb-1">
                Confirm New Password
              </label>
              <input
                type="password"
                required
                className={`border rounded w-full p-2 text-sm ${
                  passwordsMismatch ? "border-red-500" : ""
                }`}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
              {passwordsMismatch && (
                <p className="text-xs text-red-600 mt-1">
                  Passwords do not match
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={!canSubmit}
              className="w-full py-2 rounded bg-black text-white text-sm disabled:opacity-50"
            >
              {status === "loading" ? "Updating..." : "Update Password"}
            </button>

            {message && (
              <div className="text-xs text-center text-red-600">{message}</div>
            )}
          </form>
        )}

        {status !== "success" && (
          <div className="text-center">
            <Link
              href="/login"
              className="text-xs text-muted-foreground hover:text-foreground underline"
            >
              Back to login
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
