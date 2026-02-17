"use client";

import { useState } from "react";
import Link from "next/link";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "sent">("idle");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    try {
      await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
    } catch {
      // ignore — always show sent
    }
    setStatus("sent");
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-muted px-4">
      <div className="bg-card border rounded-xl p-6 w-full max-w-sm space-y-4 shadow-sm">
        <h1 className="text-xl font-semibold text-center">Reset Password</h1>

        {status === "sent" ? (
          <div className="space-y-3 text-center">
            <p className="text-sm text-muted-foreground">
              If an account exists with this email, you&apos;ll receive a reset
              link.
            </p>
            <Link
              href="/login"
              className="text-sm underline hover:text-foreground text-muted-foreground"
            >
              Back to login
            </Link>
          </div>
        ) : (
          <>
            <p className="text-xs text-muted-foreground text-center">
              Enter your email and we&apos;ll send you a link to reset your
              password.
            </p>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="block text-xs mb-1">Email</label>
                <input
                  type="email"
                  required
                  className="border rounded w-full p-2 text-sm"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <button
                type="submit"
                disabled={status === "loading"}
                className="w-full py-2 rounded bg-black text-white text-sm disabled:opacity-50"
              >
                {status === "loading" ? "Sending..." : "Send Reset Link"}
              </button>
            </form>
            <div className="text-center">
              <Link
                href="/login"
                className="text-xs text-muted-foreground hover:text-foreground underline"
              >
                Back to login
              </Link>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
