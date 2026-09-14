"use client";

import { useEffect, useMemo, useState } from "react";
import { getAuthHeaders } from "@/lib/authHeaders";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Provider = "openai" | "anthropic" | "gemini" | "other";
type Tone = "blunt" | "balanced" | "encouraging";
type Scope = "read" | "write";

type AiSettings = {
  provider: Provider;
  tone: Tone;
};

type ApiKey = {
  id: string;
  name: string;
  key_prefix: string;
  scopes: Scope[];
  created_at: string;
  last_used_at: string | null;
};

type Connection = {
  id: string;
  client_name: string;
  scopes: Scope[];
  created_at: string;
  last_used_at: string | null;
};

type ActivityRow = {
  id: number;
  tool: string;
  transport: string;
  read_only: boolean;
  status: string;
  error: string | null;
  created_at: string;
};

const DEFAULT_AI_SETTINGS: AiSettings = { provider: "openai", tone: "blunt" };

const PROVIDERS: { value: Provider; label: string }[] = [
  { value: "openai", label: "ChatGPT (OpenAI)" },
  { value: "anthropic", label: "Claude (Anthropic)" },
  { value: "gemini", label: "Gemini (Google)" },
  { value: "other", label: "Other" },
];

const TONES: { value: Tone; label: string; description: string }[] = [
  { value: "blunt", label: "Blunt & Clinical", description: "Direct, data-driven, no fluff. Like a clinician reviewing your chart." },
  { value: "balanced", label: "Balanced", description: "Clear and factual. Explains trends, flags issues, no unnecessary padding." },
  { value: "encouraging", label: "Encouraging", description: "Positive framing, accessible explanations, celebrates progress." },
];

function generateInstructions(provider: Provider, tone: Tone): string {
  const fetchLine: Record<Provider, string> = {
    openai: "Always call the relevant data tools before answering. Do not respond from memory — fetch fresh data every time.",
    anthropic: "Always retrieve current data from the Daily Tracker tools before answering. Do not respond from memory.",
    gemini: "Always retrieve current data from the Daily Tracker API before answering. Authenticate with the bearer token provided.",
    other: "Always fetch fresh data from the Daily Tracker API before answering. Do not respond from memory.",
  };

  const toneBlock: Record<Tone, string> = {
    blunt: `Be direct. Challenge weak assumptions. Prioritize trends over single data points. Always quantify when possible. Respond like a doctor or clinician reviewing data — not a supportive buddy. No encouragement, no fluff.`,
    balanced: `Be clear, factual, and objective. Explain what the data shows, highlight meaningful trends, and flag areas that warrant attention. Quantify when possible. Be honest about data limitations without being alarmist.`,
    encouraging: `Be positive and constructive. Acknowledge progress, explain trends in accessible terms, and offer actionable suggestions. Be honest about areas that need improvement, but frame feedback constructively.`,
  };

  const writeRules = `Writing data:
- You can log metrics, workouts, food, body measurements, lab results and books.
- Call listMetrics before logging metrics, so you use exact metric names and the right value format.
- Never invent a value. If I have not told you a number, ask for it rather than estimating one into my records.
- Logging a metric or body measurement overwrites whatever was recorded for that date. Logging a workout, meal, lab visit or book adds a new record.
- Tell me plainly what you wrote after you write it.`;

  const dataNotes = `Data notes:
- Food logs only appear on days explicitly logged. If a day is missing, assume intake was similar to the most recently logged day — do not assume I didn't eat.
- Lab results include both standard reference ranges and optimal (functional medicine) ranges. When both are available, prioritize the optimal range for assessment.
- New data modules may appear over time — treat any unfamiliar fields in the response as additional health context.`;

  return `You are a personal health analyst with read and write access to my fitness and health tracker.

${fetchLine[provider]}

${toneBlock[tone]}

${writeRules}

${dataNotes}`;
}

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <button
      onClick={handleCopy}
      className="px-3 py-1.5 text-sm rounded-md border bg-background hover:bg-muted transition-colors font-medium shrink-0"
    >
      {copied ? "Copied!" : label}
    </button>
  );
}

function UrlRow({ label, url, hint }: { label: string; url: string; hint?: string }) {
  if (!url) return null;
  return (
    <div className="space-y-1">
      <p className="text-sm font-medium">{label}</p>
      <div className="flex items-center gap-2">
        <code className="text-xs bg-muted px-2 py-1 rounded flex-1 break-all">{url}</code>
        <CopyButton text={url} label="Copy" />
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="shrink-0 w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-bold">
        {n}
      </span>
      <div className="min-w-0">{children}</div>
    </li>
  );
}

function SetupGuide({
  provider,
  mcpUrl,
  hasWriteKey,
}: {
  provider: Provider;
  mcpUrl: string;
  hasWriteKey: boolean;
}) {
  if (provider === "openai") {
    return (
      <div className="space-y-5 text-sm">
        <div>
          <p className="font-medium mb-2">Custom GPT (Actions)</p>
          <ol className="space-y-3">
            <Step n={1}>
              Go to <strong>chatgpt.com</strong> → your profile → <strong>My GPTs</strong> → create or edit
              your Daily Tracker GPT.
            </Step>
            <Step n={2}>
              Paste the generated instructions above into the <strong>Instructions</strong> field.
            </Step>
            <Step n={3}>
              <p>
                Under <strong>Actions</strong>, click <strong>Add action</strong> →{" "}
                <strong>Import from URL</strong> and enter the schema URL above. It stays current as
                new tools are added.
              </p>
            </Step>
            <Step n={4}>
              Set <strong>Authentication</strong> to <strong>API Key</strong>, type{" "}
              <strong>Bearer</strong>, and paste a key from above.
              {!hasWriteKey && (
                <span className="text-amber-700 dark:text-amber-500">
                  {" "}
                  Generate a key with write access if you want the GPT to log data.
                </span>
              )}
            </Step>
            <Step n={5}>Save. Writes go through without a per-call confirmation prompt.</Step>
          </ol>
        </div>

        <div className="border-t pt-4">
          <p className="font-medium mb-2">Developer mode (MCP)</p>
          <p className="text-muted-foreground text-xs mb-2">
            Newer alternative — same tools, no custom GPT needed. Requires developer mode enabled in
            ChatGPT settings.
          </p>
          <ol className="space-y-3">
            <Step n={1}>
              <strong>Settings</strong> → <strong>Connectors</strong> → <strong>Advanced</strong> →
              enable <strong>Developer mode</strong>.
            </Step>
            <Step n={2}>
              Create a connector pointing at the MCP URL above, authenticating with a bearer key.
            </Step>
          </ol>
        </div>
      </div>
    );
  }

  if (provider === "anthropic") {
    return (
      <div className="space-y-5 text-sm">
        <div>
          <p className="font-medium mb-2">Claude web and desktop (Connectors)</p>
          <p className="text-muted-foreground text-xs mb-2">
            No API key needed — you sign in and approve access, and Claude gets its own token.
          </p>
          <ol className="space-y-3">
            <Step n={1}>
              In Claude, go to <strong>Settings</strong> → <strong>Connectors</strong> →{" "}
              <strong>Add custom connector</strong>.
            </Step>
            <Step n={2}>Paste the MCP server URL above and continue.</Step>
            <Step n={3}>
              Claude opens a Daily Tracker approval page. Sign in if asked, tick{" "}
              <strong>Add and change your data</strong> if you want Claude to log things, then allow.
            </Step>
            <Step n={4}>
              The connector appears in Claude&apos;s tool list. Paste the generated instructions into a
              Project&apos;s custom instructions for the tone and rules above.
            </Step>
          </ol>
        </div>

        <div className="border-t pt-4">
          <p className="font-medium mb-2">Claude Code</p>
          <p className="text-muted-foreground text-xs mb-2">
            The CLI accepts a static key, so no browser step is needed.
          </p>
          <div className="flex items-center gap-2">
            <code className="text-xs bg-muted px-2 py-1 rounded flex-1 break-all">
              {`claude mcp add --transport http daily-tracker ${mcpUrl || "<mcp url>"} --header "Authorization: Bearer <your key>"`}
            </code>
            <CopyButton
              text={`claude mcp add --transport http daily-tracker ${mcpUrl} --header "Authorization: Bearer <your key>"`}
              label="Copy"
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="text-sm text-muted-foreground space-y-2">
      <p>
        Paste the generated instructions into your assistant&apos;s system prompt, then connect it
        using whichever your tool supports:
      </p>
      <ul className="list-disc pl-5 space-y-1 text-xs">
        <li>
          <strong>MCP</strong> — point it at the MCP server URL above with a bearer key, or let it
          run the OAuth flow.
        </li>
        <li>
          <strong>OpenAPI</strong> — import the schema URL above and authenticate with a bearer key.
        </li>
      </ul>
    </div>
  );
}

export default function AiAssistantPage() {
  const [settings, setSettings] = useState<AiSettings>(DEFAULT_AI_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  const [specUrl, setSpecUrl] = useState("");
  const [mcpUrl, setMcpUrl] = useState("");
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [activity, setActivity] = useState<ActivityRow[]>([]);

  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyWrite, setNewKeyWrite] = useState(true);
  const [newlyGeneratedKey, setNewlyGeneratedKey] = useState<string | null>(null);
  const [keyLoading, setKeyLoading] = useState(false);
  const [keyError, setKeyError] = useState<string | null>(null);
  const [confirmingRevoke, setConfirmingRevoke] = useState<string | null>(null);

  const refreshConfig = async () => {
    const headers = await getAuthHeaders();
    const res = await fetch("/api/settings/ai-config", { headers });
    if (res.ok) {
      const json = await res.json();
      setSpecUrl(json.spec_url ?? "");
      setMcpUrl(json.mcp_url ?? "");
      setKeys(json.keys ?? []);
      setConnections(json.connections ?? []);
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const headers = await getAuthHeaders();
        const [settingsRes] = await Promise.all([
          fetch("/api/settings", { headers }),
          refreshConfig(),
        ]);
        if (settingsRes.ok) {
          const json = await settingsRes.json();
          if (json.ai_assistant) {
            setSettings({ ...DEFAULT_AI_SETTINGS, ...json.ai_assistant });
          }
        }

        const activityRes = await fetch("/api/settings/ai-activity?limit=15", { headers });
        if (activityRes.ok) {
          const json = await activityRes.json();
          setActivity(json.activity ?? []);
        }
      } catch {
        /* ignore */
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const generateKey = async () => {
    setKeyLoading(true);
    setNewlyGeneratedKey(null);
    setKeyError(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/settings/ai-key", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newKeyName.trim() || "Default",
          scopes: newKeyWrite ? ["read", "write"] : ["read"],
        }),
      });
      const json = await res.json();
      if (res.ok) {
        setNewlyGeneratedKey(json.key);
        setNewKeyName("");
        await refreshConfig();
      } else {
        setKeyError(json.error ?? "Failed to generate key");
      }
    } catch {
      setKeyError("Request failed");
    } finally {
      setKeyLoading(false);
    }
  };

  const revokeKey = async (id: string) => {
    setKeyLoading(true);
    setKeyError(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/settings/ai-key?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers,
      });
      if (res.ok) {
        setConfirmingRevoke(null);
        setNewlyGeneratedKey(null);
        await refreshConfig();
      } else {
        const json = await res.json();
        setKeyError(json.error ?? "Failed to revoke key");
      }
    } catch {
      setKeyError("Request failed");
    } finally {
      setKeyLoading(false);
    }
  };

  const revokeConnection = async (id: string) => {
    const headers = await getAuthHeaders();
    await fetch(`/api/settings/ai-connections?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers,
    });
    await refreshConfig();
  };

  const save = async (next: AiSettings) => {
    setSaving(true);
    setSaveStatus(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ ai_assistant: next }),
      });
      if (res.ok) {
        setSaveStatus("Saved");
        setTimeout(() => setSaveStatus(null), 2000);
      }
    } catch {
      /* ignore */
    } finally {
      setSaving(false);
    }
  };

  const update = (patch: Partial<AiSettings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    save(next);
  };

  const instructions = useMemo(
    () => generateInstructions(settings.provider, settings.tone),
    [settings.provider, settings.tone]
  );

  const hasWriteKey = keys.some((k) => k.scopes?.includes("write"));

  if (loading) {
    return (
      <main className="p-6 max-w-2xl mx-auto">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </main>
    );
  }

  return (
    <main className="p-6 max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">AI Assistant</h1>
        {saving && <span className="text-sm text-muted-foreground">Saving...</span>}
        {saveStatus && <span className="text-sm text-green-600">{saveStatus}</span>}
      </div>

      {/* Connection URLs */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Connection</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <UrlRow
            label="MCP server URL"
            url={mcpUrl}
            hint="For Claude connectors, Claude Code, and ChatGPT developer mode."
          />
          <UrlRow
            label="OpenAPI schema URL"
            url={specUrl}
            hint="For ChatGPT custom GPT Actions. Auto-updates as tools are added."
          />
        </CardContent>
      </Card>

      {/* API keys */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">API Keys</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Keys are for tools that hold a static token — ChatGPT and Claude Code. Claude&apos;s web
            and desktop connectors use sign-in instead and appear under Connected apps below.
          </p>

          {keys.length > 0 ? (
            <div className="space-y-2">
              {keys.map((key) => (
                <div
                  key={key.id}
                  className="flex items-center justify-between gap-3 rounded-md border p-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">{key.name}</span>
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                          key.scopes?.includes("write")
                            ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-400"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {key.scopes?.includes("write") ? "read + write" : "read only"}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      <code className="bg-muted px-1 rounded">{key.key_prefix}…</code>
                      {key.last_used_at
                        ? ` · last used ${new Date(key.last_used_at).toLocaleDateString()}`
                        : " · never used"}
                    </p>
                  </div>
                  <div className="shrink-0">
                    {confirmingRevoke === key.id ? (
                      <div className="flex gap-2">
                        <button
                          onClick={() => revokeKey(key.id)}
                          disabled={keyLoading}
                          className="text-xs text-red-600 font-semibold hover:underline"
                        >
                          Confirm
                        </button>
                        <button
                          onClick={() => setConfirmingRevoke(null)}
                          className="text-xs text-muted-foreground hover:underline"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmingRevoke(key.id)}
                        className="text-xs text-red-600 hover:underline"
                      >
                        Revoke
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No keys yet.</p>
          )}

          {newlyGeneratedKey && (
            <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 p-3 space-y-2">
              <p className="text-xs font-semibold text-amber-800 dark:text-amber-400">
                Copy this key now — it won&apos;t be shown again.
              </p>
              <div className="flex items-center gap-2">
                <code className="text-xs bg-white dark:bg-black/30 border rounded px-2 py-1 flex-1 break-all">
                  {newlyGeneratedKey}
                </code>
                <CopyButton text={newlyGeneratedKey} label="Copy" />
              </div>
            </div>
          )}

          {keyError && <p className="text-sm text-red-600">{keyError}</p>}

          <div className="border-t pt-4 space-y-3">
            <p className="text-sm font-medium">New key</p>
            <input
              type="text"
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              placeholder="What is this key for? e.g. ChatGPT"
              className="border rounded-md w-full p-2 text-sm bg-background"
            />
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={newKeyWrite}
                onChange={(e) => setNewKeyWrite(e.target.checked)}
                className="mt-0.5 shrink-0"
              />
              <div>
                <div className="text-sm font-medium">Allow writing data</div>
                <div className="text-xs text-muted-foreground">
                  Lets the assistant log metrics, workouts, meals, measurements, labs and books.
                  Leave off for a key that can only read.
                </div>
              </div>
            </label>
            <button
              onClick={generateKey}
              disabled={keyLoading}
              className="px-3 py-1.5 text-sm rounded-md border bg-background hover:bg-muted transition-colors font-medium"
            >
              {keyLoading ? "Generating…" : "Generate key"}
            </button>
          </div>
        </CardContent>
      </Card>

      {/* OAuth connections */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Connected Apps</CardTitle>
        </CardHeader>
        <CardContent>
          {connections.length > 0 ? (
            <div className="space-y-2">
              {connections.map((conn) => (
                <div
                  key={conn.id}
                  className="flex items-center justify-between gap-3 rounded-md border p-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">{conn.client_name}</span>
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                          conn.scopes?.includes("write")
                            ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-400"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {conn.scopes?.includes("write") ? "read + write" : "read only"}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Connected {new Date(conn.created_at).toLocaleDateString()}
                      {conn.last_used_at
                        ? ` · last used ${new Date(conn.last_used_at).toLocaleDateString()}`
                        : ""}
                    </p>
                  </div>
                  <button
                    onClick={() => revokeConnection(conn.id)}
                    className="text-xs text-red-600 hover:underline shrink-0"
                  >
                    Disconnect
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Nothing connected yet. Apps that sign in through Daily Tracker — like Claude&apos;s
              custom connectors — show up here.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Provider */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">AI Provider</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {PROVIDERS.map((p) => (
              <button
                key={p.value}
                onClick={() => update({ provider: p.value })}
                className={`px-3 py-1.5 rounded-md border text-sm transition-colors ${
                  settings.provider === p.value
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background hover:bg-muted"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Tone */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Response Style</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {TONES.map((t) => (
            <label
              key={t.value}
              className="flex items-start gap-3 cursor-pointer p-2 rounded-md hover:bg-muted/50 transition-colors"
            >
              <input
                type="radio"
                name="tone"
                value={t.value}
                checked={settings.tone === t.value}
                onChange={() => update({ tone: t.value })}
                className="mt-0.5 shrink-0"
              />
              <div>
                <div className="text-sm font-medium">{t.label}</div>
                <div className="text-xs text-muted-foreground">{t.description}</div>
              </div>
            </label>
          ))}
        </CardContent>
      </Card>

      {/* Generated instructions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center justify-between gap-2">
            <span>Generated Instructions</span>
            <CopyButton text={instructions} label="Copy Instructions" />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-2">
            Paste this into your AI tool&apos;s system prompt or project instructions. Edit as you see
            fit — changing the tone above regenerates it.
          </p>
          <textarea
            readOnly
            value={instructions}
            rows={14}
            className="w-full text-xs font-mono bg-muted/50 border rounded-md p-3 resize-none focus:outline-none"
          />
        </CardContent>
      </Card>

      {/* Setup guide */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Setup Guide</CardTitle>
        </CardHeader>
        <CardContent>
          <SetupGuide provider={settings.provider} mcpUrl={mcpUrl} hasWriteKey={hasWriteKey} />
        </CardContent>
      </Card>

      {/* Activity */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          {activity.length > 0 ? (
            <div className="space-y-1.5">
              {activity.map((row) => (
                <div key={row.id} className="flex items-center gap-2 text-xs">
                  <span
                    className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                      row.status === "ok"
                        ? row.read_only
                          ? "bg-muted-foreground"
                          : "bg-amber-500"
                        : "bg-red-500"
                    }`}
                  />
                  <code className="font-medium">{row.tool}</code>
                  <span className="text-muted-foreground">{row.transport}</span>
                  <span className="text-muted-foreground ml-auto shrink-0">
                    {new Date(row.created_at).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No agent activity yet. Calls from your assistants show up here, writes highlighted.
            </p>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground/70">
        Settings are saved automatically when changed.
      </p>
    </main>
  );
}
