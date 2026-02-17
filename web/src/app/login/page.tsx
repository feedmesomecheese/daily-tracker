"use client";

import { useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

type Tab = "login" | "signup";

export default function LoginPage() {
  const [tab, setTab] = useState<Tab>("login");

  return (
    <main className="min-h-screen flex items-center justify-center bg-muted px-4">
      <div className="w-full max-w-sm space-y-6">
        {/* Pitch */}
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold">Daily Tracker</h1>
          <p className="text-sm text-muted-foreground">
            Track your daily habits, workouts, reading, and more.
          </p>
          <ul className="text-xs text-muted-foreground space-y-0.5 text-left mx-auto max-w-[260px]">
            <li>&#8226; Daily metrics & habit tracking</li>
            <li>&#8226; Workout logging with exercise library</li>
            <li>&#8226; Book reading log & stats</li>
            <li>&#8226; Trends, insights, and streaks</li>
          </ul>
        </div>

        {/* Card */}
        <div className="bg-card border rounded-xl p-6 shadow-sm space-y-4">
          {/* Tabs */}
          <div className="flex rounded-lg bg-muted p-0.5">
            <button
              onClick={() => setTab("login")}
              className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-colors ${
                tab === "login"
                  ? "bg-card shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Log In
            </button>
            <button
              onClick={() => setTab("signup")}
              className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-colors ${
                tab === "signup"
                  ? "bg-card shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Sign Up
            </button>
          </div>

          {tab === "login" ? <LoginForm /> : <SignUpForm />}
        </div>

        {/* Request Access */}
        <RequestAccessSection />
      </div>
    </main>
  );
}

/* ---------- Login Form ---------- */
function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setMessage(null);
    try {
      const { error } = await supabaseBrowser.auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        setStatus("error");
        setMessage(error.message || "Login failed");
        return;
      }
      setStatus("idle");
      window.location.href = "/";
    } catch (err: unknown) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <>
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
        <div className="text-xs text-center text-red-600">{message}</div>
      )}

      <div className="text-center">
        <Link
          href="/forgot-password"
          className="text-xs text-muted-foreground hover:text-foreground underline"
        >
          Forgot password?
        </Link>
      </div>
    </>
  );
}

/* ---------- Sign Up Form ---------- */
function SignUpForm() {
  const [inviteCode, setInviteCode] = useState("");
  const [codeStatus, setCodeStatus] = useState<
    "idle" | "checking" | "valid" | "invalid"
  >("idle");
  const [codeError, setCodeError] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">(
    "idle"
  );
  const [message, setMessage] = useState<string | null>(null);

  const passwordTooShort = password.length > 0 && password.length < 8;
  const passwordsMismatch =
    confirmPassword.length > 0 && password !== confirmPassword;
  const canSubmit =
    codeStatus === "valid" &&
    email &&
    password.length >= 8 &&
    password === confirmPassword &&
    status !== "loading";

  async function validateCode() {
    const code = inviteCode.trim();
    if (!code) return;
    setCodeStatus("checking");
    setCodeError(null);
    try {
      const res = await fetch("/api/auth/validate-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (data.valid) {
        setCodeStatus("valid");
      } else {
        setCodeStatus("invalid");
        setCodeError(data.error || "Invalid invite code");
      }
    } catch {
      setCodeStatus("invalid");
      setCodeError("Failed to validate code");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setStatus("loading");
    setMessage(null);
    try {
      const { data, error } = await supabaseBrowser.auth.signUp({
        email,
        password,
      });
      if (error) {
        setStatus("error");
        setMessage(error.message || "Sign up failed");
        return;
      }
      // Claim the invite code
      if (data.user) {
        await fetch("/api/auth/claim-invite", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            code: inviteCode.trim(),
            userId: data.user.id,
          }),
        });
      }
      setStatus("success");
      setMessage("Check your email to confirm your account.");
    } catch (err: unknown) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : String(err));
    }
  }

  if (status === "success") {
    return (
      <div className="text-center space-y-2 py-4">
        <p className="text-sm font-medium text-green-700">{message}</p>
        <p className="text-xs text-muted-foreground">
          Once confirmed, you can log in with your credentials.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {/* Invite Code */}
      <div>
        <label className="block text-xs mb-1">Invite Code</label>
        <div className="flex gap-2">
          <input
            type="text"
            required
            placeholder="ABC123"
            className={`border rounded flex-1 p-2 text-sm uppercase ${
              codeStatus === "valid"
                ? "border-green-500"
                : codeStatus === "invalid"
                ? "border-red-500"
                : ""
            }`}
            value={inviteCode}
            onChange={(e) => {
              setInviteCode(e.target.value.toUpperCase());
              if (codeStatus !== "idle") {
                setCodeStatus("idle");
                setCodeError(null);
              }
            }}
            onBlur={validateCode}
          />
          {codeStatus === "checking" && (
            <span className="self-center text-xs text-muted-foreground">
              Checking...
            </span>
          )}
          {codeStatus === "valid" && (
            <span className="self-center text-xs text-green-600">Valid</span>
          )}
        </div>
        {codeError && (
          <p className="text-xs text-red-600 mt-1">{codeError}</p>
        )}
      </div>

      {/* Email */}
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

      {/* Password */}
      <div>
        <label className="block text-xs mb-1">Password</label>
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

      {/* Confirm Password */}
      <div>
        <label className="block text-xs mb-1">Confirm Password</label>
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
          <p className="text-xs text-red-600 mt-1">Passwords do not match</p>
        )}
      </div>

      <button
        type="submit"
        disabled={!canSubmit}
        className="w-full py-2 rounded bg-black text-white text-sm disabled:opacity-50"
      >
        {status === "loading" ? "Creating account..." : "Create Account"}
      </button>

      {status === "error" && message && (
        <div className="text-xs text-center text-red-600">{message}</div>
      )}
    </form>
  );
}

/* ---------- Request Access ---------- */
function RequestAccessSection() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "sent">("idle");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    try {
      await fetch("/api/auth/request-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, name, message }),
      });
      setStatus("sent");
    } catch {
      setStatus("sent"); // show sent anyway to prevent enumeration
    }
  }

  if (status === "sent") {
    return (
      <div className="text-center text-sm text-muted-foreground">
        Request sent! We&apos;ll be in touch.
      </div>
    );
  }

  return (
    <div className="text-center space-y-2">
      <div className="flex items-center gap-3 text-muted-foreground text-xs">
        <div className="flex-1 h-px bg-border" />
        <span>or</span>
        <div className="flex-1 h-px bg-border" />
      </div>

      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="text-sm text-muted-foreground hover:text-foreground underline"
        >
          Don&apos;t have an invite code? Request Access
        </button>
      ) : (
        <form
          onSubmit={handleSubmit}
          className="bg-card border rounded-xl p-4 space-y-3 text-left shadow-sm"
        >
          <p className="text-sm font-medium">Request Access</p>
          <div>
            <label className="block text-xs mb-1">Name</label>
            <input
              type="text"
              className="border rounded w-full p-2 text-sm"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs mb-1">
              Email <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              required
              className="border rounded w-full p-2 text-sm"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs mb-1">Message (optional)</label>
            <textarea
              rows={2}
              className="border rounded w-full p-2 text-sm resize-none"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </div>
          <button
            type="submit"
            disabled={status === "loading"}
            className="w-full py-2 rounded bg-black text-white text-sm disabled:opacity-50"
          >
            {status === "loading" ? "Sending..." : "Send Request"}
          </button>
        </form>
      )}
    </div>
  );
}
