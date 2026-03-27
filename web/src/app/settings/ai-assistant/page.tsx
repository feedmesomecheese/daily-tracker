"use client";

import { useEffect, useState, useMemo } from "react";
import { getAuthHeaders } from "@/lib/authHeaders";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Provider = "openai" | "anthropic" | "gemini" | "other";
type Tone = "blunt" | "balanced" | "encouraging";

type AiSettings = {
  provider: Provider;
  tone: Tone;
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
    openai: "Always call all relevant data tools (getDailyLog, getWorkouts, getFoodLog, getLabResults, getBodyMeasurements, getBooks) before answering. Do not respond from memory — fetch fresh data every time.",
    anthropic: "Always retrieve current data from the Daily Tracker API before answering. Use the bearer token in these instructions to authenticate GET requests to each relevant endpoint.",
    gemini: "Always retrieve current data from the Daily Tracker API before answering. Authenticate with the bearer token provided.",
    other: "Always fetch fresh data from the Daily Tracker API before answering. Do not respond from memory.",
  };

  const toneBlock: Record<Tone, string> = {
    blunt: `Be direct. Challenge weak assumptions. Prioritize trends over single data points. Always quantify when possible. Respond like a doctor or clinician reviewing data — not a supportive buddy. No encouragement, no fluff.`,
    balanced: `Be clear, factual, and objective. Explain what the data shows, highlight meaningful trends, and flag areas that warrant attention. Quantify when possible. Be honest about data limitations without being alarmist.`,
    encouraging: `Be positive and constructive. Acknowledge progress, explain trends in accessible terms, and offer actionable suggestions. Be honest about areas that need improvement, but frame feedback constructively.`,
  };

  const dataNotes = `Data notes:
- Food logs only appear on days explicitly logged. If a day is missing, assume intake was similar to the most recently logged day — do not assume the user didn't eat.
- Lab results include both standard reference ranges and optimal (functional medicine) ranges. When both are available, prioritize the optimal range for assessment.
- New data modules may appear over time — treat any unfamiliar fields in the API response as additional health context.`;

  return `You are a personal health analyst with access to my fitness and health tracker data.

${fetchLine[provider]}

${toneBlock[tone]}

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
      className="px-3 py-1.5 text-sm rounded-md border bg-background hover:bg-muted transition-colors font-medium"
    >
      {copied ? "Copied!" : label}
    </button>
  );
}

function SetupGuide({ provider, specUrl, keyPrefix }: { provider: Provider; specUrl: string; keyPrefix: string | null }) {
  if (provider === "openai") {
    return (
      <ol className="space-y-3 text-sm">
        <li className="flex gap-3">
          <span className="shrink-0 w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-bold">1</span>
          <span>Go to <strong>chatgpt.com</strong> → your profile → <strong>My GPTs</strong> → create or edit your Daily Tracker GPT.</span>
        </li>
        <li className="flex gap-3">
          <span className="shrink-0 w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-bold">2</span>
          <span>In the <strong>Instructions</strong> field, paste the generated instructions above.</span>
        </li>
        <li className="flex gap-3">
          <span className="shrink-0 w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-bold">3</span>
          <div>
            <p>Under <strong>Actions</strong>, click <strong>Add action</strong> → <strong>Import from URL</strong> and enter:</p>
            <div className="mt-1.5 flex items-center gap-2">
              <code className="text-xs bg-muted px-2 py-1 rounded flex-1 break-all">{specUrl}</code>
              <CopyButton text={specUrl} label="Copy URL" />
            </div>
            <p className="text-muted-foreground text-xs mt-1">The spec auto-updates when new data modules are added — you never need to re-paste it.</p>
          </div>
        </li>
        <li className="flex gap-3">
          <span className="shrink-0 w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-bold">4</span>
          <span>
            Set <strong>Authentication</strong> to <strong>API Key</strong>, type <strong>Bearer</strong>.
            Enter your API key{keyPrefix ? <> (starts with <code className="bg-muted px-1 rounded">{keyPrefix}…</code>)</> : " — generate one above first"}.
          </span>
        </li>
        <li className="flex gap-3">
          <span className="shrink-0 w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-bold">5</span>
          <span>Click <strong>Save</strong>. Done — your GPT will now fetch live data on every query.</span>
        </li>
      </ol>
    );
  }

  if (provider === "anthropic") {
    return (
      <div className="space-y-3 text-sm">
        <p className="text-muted-foreground">Claude Projects doesn&apos;t support custom API actions yet. The best approach is to include your API key in the project instructions so Claude can reference the endpoints manually.</p>
        <ol className="space-y-3">
          <li className="flex gap-3">
            <span className="shrink-0 w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-bold">1</span>
            <span>Go to <strong>claude.ai</strong> → <strong>Projects</strong> → create or open your Daily Tracker project.</span>
          </li>
          <li className="flex gap-3">
            <span className="shrink-0 w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-bold">2</span>
            <span>In <strong>Project Instructions</strong>, paste the generated instructions and append your API key and base URL so Claude knows how to reference data.</span>
          </li>
        </ol>
      </div>
    );
  }

  return (
    <div className="text-sm text-muted-foreground space-y-2">
      <p>Paste the generated instructions into your AI assistant&apos;s system prompt or project instructions.</p>
      <p>Your API spec URL: <code className="bg-muted px-1 rounded text-xs">{specUrl}</code></p>
    </div>
  );
}

export default function AiAssistantPage() {
  const [settings, setSettings] = useState<AiSettings>(DEFAULT_AI_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  const [specUrl, setSpecUrl] = useState("");
  const [keyPrefix, setKeyPrefix] = useState<string | null>(null);
  const [keyLastUsed, setKeyLastUsed] = useState<string | null>(null);
  const [newlyGeneratedKey, setNewlyGeneratedKey] = useState<string | null>(null);
  const [keyLoading, setKeyLoading] = useState(false);
  const [revokeConfirm, setRevokeConfirm] = useState(false);
  const [keyError, setKeyError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const headers = await getAuthHeaders();
        const [settingsRes, configRes] = await Promise.all([
          fetch("/api/settings", { headers }),
          fetch("/api/settings/ai-config", { headers }),
        ]);
        if (settingsRes.ok) {
          const json = await settingsRes.json();
          if (json.ai_assistant) {
            setSettings({ ...DEFAULT_AI_SETTINGS, ...json.ai_assistant });
          }
        }
        if (configRes.ok) {
          const json = await configRes.json();
          setSpecUrl(json.spec_url ?? "");
          setKeyPrefix(json.key_prefix ?? null);
          setKeyLastUsed(json.key_last_used_at ?? null);
        }
      } catch { /* ignore */ }
      finally { setLoading(false); }
    })();
  }, []);

  const generateKey = async () => {
    setKeyLoading(true);
    setNewlyGeneratedKey(null);
    setKeyError(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/settings/ai-key", { method: "POST", headers });
      const json = await res.json();
      if (res.ok) {
        setNewlyGeneratedKey(json.key);
        setKeyPrefix(json.key_prefix);
        setKeyLastUsed(null);
        setRevokeConfirm(false);
      } else {
        setKeyError(json.error ?? "Failed to generate key");
      }
    } catch { setKeyError("Request failed"); }
    finally { setKeyLoading(false); }
  };

  const revokeKey = async () => {
    setKeyLoading(true);
    setKeyError(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/settings/ai-key", { method: "DELETE", headers });
      if (res.ok) {
        setKeyPrefix(null);
        setKeyLastUsed(null);
        setNewlyGeneratedKey(null);
        setRevokeConfirm(false);
      } else {
        const json = await res.json();
        setKeyError(json.error ?? "Failed to revoke key");
      }
    } catch { setKeyError("Request failed"); }
    finally { setKeyLoading(false); }
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
    } catch { /* ignore */ }
    finally { setSaving(false); }
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

  if (loading) return <main className="p-6 max-w-2xl mx-auto"><p className="text-sm text-muted-foreground">Loading...</p></main>;

  return (
    <main className="p-6 max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">AI Assistant</h1>
        {saving && <span className="text-sm text-muted-foreground">Saving...</span>}
        {saveStatus && <span className="text-sm text-green-600">{saveStatus}</span>}
      </div>

      {/* API Key */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">API Key</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Key status */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm">
              <span className={`w-2 h-2 rounded-full shrink-0 ${keyPrefix ? "bg-green-500" : "bg-muted-foreground"}`} />
              {keyPrefix
                ? <span>Key active — starts with <code className="bg-muted px-1 rounded">{keyPrefix}…</code>{keyLastUsed && <span className="text-muted-foreground ml-1">(last used {new Date(keyLastUsed).toLocaleDateString()})</span>}</span>
                : <span className="text-muted-foreground">No key generated yet</span>
              }
            </div>
            <div className="flex gap-2 shrink-0">
              {keyPrefix && !revokeConfirm && (
                <button onClick={() => setRevokeConfirm(true)} className="text-xs text-red-600 hover:underline">
                  Revoke
                </button>
              )}
              {revokeConfirm && (
                <>
                  <button onClick={revokeKey} disabled={keyLoading} className="text-xs text-red-600 font-semibold hover:underline">
                    Confirm revoke
                  </button>
                  <button onClick={() => setRevokeConfirm(false)} className="text-xs text-muted-foreground hover:underline">
                    Cancel
                  </button>
                </>
              )}
              <button
                onClick={generateKey}
                disabled={keyLoading}
                className="px-3 py-1.5 text-sm rounded-md border bg-background hover:bg-muted transition-colors font-medium"
              >
                {keyLoading ? "Generating…" : keyPrefix ? "Regenerate" : "Generate Key"}
              </button>
            </div>
          </div>

          {keyError && (
            <p className="text-sm text-red-600">{keyError}</p>
          )}

          {/* Newly generated key — shown once */}
          {newlyGeneratedKey && (
            <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 p-3 space-y-2">
              <p className="text-xs font-semibold text-amber-800 dark:text-amber-400">Copy this key now — it won&apos;t be shown again.</p>
              <div className="flex items-center gap-2">
                <code className="text-xs bg-white dark:bg-black/30 border rounded px-2 py-1 flex-1 break-all">{newlyGeneratedKey}</code>
                <CopyButton text={newlyGeneratedKey} label="Copy" />
              </div>
            </div>
          )}

          {/* Schema URL */}
          {specUrl && (
            <div className="space-y-1">
              <p className="text-sm font-medium">Schema URL</p>
              <div className="flex items-center gap-2">
                <code className="text-xs bg-muted px-2 py-1 rounded flex-1 break-all">{specUrl}</code>
                <CopyButton text={specUrl} label="Copy" />
              </div>
              <p className="text-xs text-muted-foreground">Auto-updates as new data modules are added — configure once, never update again.</p>
            </div>
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
            <label key={t.value} className="flex items-start gap-3 cursor-pointer p-2 rounded-md hover:bg-muted/50 transition-colors">
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
          <CardTitle className="text-lg flex items-center justify-between">
            <span>Generated Instructions</span>
            <CopyButton text={instructions} label="Copy Instructions" />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-2">Paste this into your AI tool&apos;s system prompt or project instructions. Edit as you see fit — changing the tone above regenerates it.</p>
          <textarea
            readOnly
            value={instructions}
            rows={10}
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
          <SetupGuide provider={settings.provider} specUrl={specUrl} keyPrefix={keyPrefix} />
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground/70">Settings are saved automatically when changed.</p>
    </main>
  );
}
