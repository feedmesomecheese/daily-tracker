"use client";

import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setMessage(null);
    try {
      const { data, error } = await supabaseBrowser.auth.signInWithPassword({
        email,
        password,
      });
      console.log("login result:", { data, error });

      if (error) {
        setStatus("error");
        setMessage(error.message || "Login failed");
        return;
      }

      // success: go to home
      setStatus("idle");
      window.location.href = "/";
    } catch (err: any) {
      console.error("login exception:", err);
      setStatus("error");
      setMessage(String(err?.message || err));
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white border rounded-xl p-6 w-full max-w-sm space-y-4 shadow-sm">
        <h1 className="text-xl font-semibold text-center">Daily Tracker Login</h1>

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

          <div>
            <label className="block text-xs mb-1">Password</label>
            <input
              type="password"
              required
              className="border rounded w-full p-2 text-sm"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <button
            type="submit"
            disabled={status === "loading"}
            className="w-full py-2 rounded bg-black text-white text-sm disabled:opacity-50"
          >
            {status === "loading" ? "Signing in..." : "Sign in"}
          </button>
        </form>

        {message && (
          <div
            className={
              "text-xs text-center mt-2 " +
              (status === "error" ? "text-red-600" : "text-green-700")
            }
          >
            {message}
          </div>
        )}
      </div>
    </main>
  );
}
