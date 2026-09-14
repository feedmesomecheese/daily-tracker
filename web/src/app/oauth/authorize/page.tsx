"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { getAuthHeaders } from "@/lib/authHeaders";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * OAuth consent screen.
 *
 * This is where a person decides what an AI client may do with their data. The
 * client proposes scopes; the person decides — write access is a separate,
 * unticked-by-default choice rather than something bundled into "connect".
 */

type ClientInfo = { client_id: string; client_name: string };

const SCOPE_COPY: Record<string, { label: string; detail: string }> = {
  read: {
    label: "Read your data",
    detail: "Daily metrics, workouts, food logs, body measurements, lab results and reading list.",
  },
  write: {
    label: "Add and change your data",
    detail:
      "Log metrics, workouts, meals, measurements, lab results and books. Logging a metric or measurement replaces the existing value for that date.",
  },
};

function AuthorizeContent() {
  const params = useSearchParams();

  const clientId = params.get("client_id") ?? "";
  const redirectUri = params.get("redirect_uri") ?? "";
  const responseType = params.get("response_type") ?? "code";
  const state = params.get("state");
  const codeChallenge = params.get("code_challenge") ?? "";
  const codeChallengeMethod = params.get("code_challenge_method") ?? "S256";
  const resource = params.get("resource");

  const requestedScopes = useMemo(() => {
    const raw = params.get("scope") ?? "read";
    const requested = raw.split(/[\s+]+/).filter(Boolean);
    const known = ["read", "write"].filter((s) => requested.includes(s));
    return known.length > 0 ? known : ["read"];
  }, [params]);

  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [client, setClient] = useState<ClientInfo | null>(null);
  const [grantWrite, setGrantWrite] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabaseBrowser.auth.getSession();
      setSessionEmail(data.session?.user?.email ?? null);
      setCheckingSession(false);
    })();
  }, []);

  useEffect(() => {
    if (!clientId) return;
    (async () => {
      try {
        const res = await fetch(`/api/oauth/client-info?client_id=${encodeURIComponent(clientId)}`);
        if (res.ok) setClient(await res.json());
        else setError("This application is not registered. Try connecting again from the app.");
      } catch {
        setError("Could not look up the requesting application.");
      }
    })();
  }, [clientId]);

  const validRequest =
    clientId && redirectUri && responseType === "code" && codeChallenge && codeChallengeMethod === "S256";

  const approve = async () => {
    setSubmitting(true);
    setError(null);

    const scopes = ["read", ...(grantWrite && requestedScopes.includes("write") ? ["write"] : [])];

    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/oauth/authorize/approve", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: clientId,
          redirect_uri: redirectUri,
          code_challenge: codeChallenge,
          code_challenge_method: codeChallengeMethod,
          scope: scopes.join(" "),
          state,
          resource,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Could not approve this request.");
        setSubmitting(false);
        return;
      }

      window.location.href = json.redirect_to;
    } catch {
      setError("Request failed. Check your connection and try again.");
      setSubmitting(false);
    }
  };

  const deny = () => {
    if (!redirectUri) return;
    const url = new URL(redirectUri);
    url.searchParams.set("error", "access_denied");
    url.searchParams.set("error_description", "The user declined the request");
    if (state) url.searchParams.set("state", state);
    window.location.href = url.toString();
  };

  if (checkingSession) {
    return <p className="text-sm text-muted-foreground">Checking your session…</p>;
  }

  if (!validRequest) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Invalid request</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>
            This authorization link is missing required parameters, so it cannot be approved safely.
          </p>
          <p>Start the connection again from the application you are trying to connect.</p>
        </CardContent>
      </Card>
    );
  }

  if (!sessionEmail) {
    const returnTo = typeof window !== "undefined" ? window.location.pathname + window.location.search : "/";
    return (
      <Card>
        <CardHeader>
          <CardTitle>Sign in to continue</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {client?.client_name ?? "An application"} wants access to your Daily Tracker data. Sign in
            to review the request.
          </p>
          <a
            href={`/login?next=${encodeURIComponent(returnTo)}`}
            className="inline-block px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium"
          >
            Sign in
          </a>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          Connect {client?.client_name ?? "application"}?
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="text-sm text-muted-foreground">
          <strong className="text-foreground">{client?.client_name ?? "This application"}</strong> is
          asking to connect to your Daily Tracker account ({sessionEmail}).
        </p>

        <div className="space-y-3">
          <div className="rounded-md border p-3">
            <div className="flex items-start gap-3">
              <input type="checkbox" checked disabled className="mt-1" />
              <div>
                <p className="text-sm font-medium">{SCOPE_COPY.read.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{SCOPE_COPY.read.detail}</p>
              </div>
            </div>
          </div>

          {requestedScopes.includes("write") && (
            <label className="rounded-md border p-3 block cursor-pointer">
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={grantWrite}
                  onChange={(e) => setGrantWrite(e.target.checked)}
                  className="mt-1"
                />
                <div>
                  <p className="text-sm font-medium">{SCOPE_COPY.write.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{SCOPE_COPY.write.detail}</p>
                </div>
              </div>
            </label>
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          You can revoke this connection at any time from Settings → AI Assistant. Access expires
          after 30 days of no use.
        </p>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex gap-2">
          <button
            onClick={approve}
            disabled={submitting}
            className="flex-1 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
          >
            {submitting ? "Connecting…" : grantWrite ? "Allow read and write" : "Allow read only"}
          </button>
          <button
            onClick={deny}
            disabled={submitting}
            className="px-4 py-2 rounded-md border text-sm font-medium disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AuthorizePage() {
  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
          <AuthorizeContent />
        </Suspense>
      </div>
    </main>
  );
}
