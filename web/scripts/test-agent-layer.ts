/**
 * Checks for the agent tool layer: input coercion, PKCE, redirect-URI policy,
 * and registry integrity. No database needed — these are the pure pieces where
 * a silent mistake would be hardest to notice in production.
 *
 *   npm run test:agent
 */
import { coerceInput } from "@/lib/agent/validate";
import { verifyPkce, parseScopes, isAcceptableRedirectUri } from "@/lib/agent/oauth";
import { AGENT_TOOLS, findToolByName } from "@/lib/agent/registry";

let pass = 0, fail = 0;
function check(name: string, fn: () => void) {
  try { fn(); pass++; console.log("  ok   " + name); }
  catch (e) { fail++; console.log("  FAIL " + name + " -> " + (e as Error).message); }
}
function eq(a: unknown, b: unknown, msg = "") {
  const as = JSON.stringify(a), bs = JSON.stringify(b);
  if (as !== bs) throw new Error(`${msg} expected ${bs}, got ${as}`);
}
/** Reach into a coerced array-of-objects result without reaching for `any`. */
type Row = Record<string, unknown> & { sets?: unknown[] };
function row(value: unknown, index: number): Row {
  return (value as Row[])[index];
}

function throws(fn: () => void, match: string) {
  try { fn(); } catch (e) {
    if (!(e as Error).message.includes(match)) throw new Error(`wrong error: ${(e as Error).message}`);
    return;
  }
  throw new Error("expected a throw, got none");
}

console.log("\n-- input coercion (query strings arrive as strings) --");
const getDailyLog = findToolByName("getDailyLog")!;
check("days string -> number", () => {
  eq(coerceInput(getDailyLog.inputSchema, { days: "90" }).days, 90);
});
check("missing optional falls back to default", () => {
  eq(coerceInput(getDailyLog.inputSchema, {}).days, 30);
});
check("empty string is treated as absent", () => {
  eq(coerceInput(getDailyLog.inputSchema, { start: "", days: "7" }).start, undefined);
});
check("bad date format rejected", () => {
  throws(() => coerceInput(getDailyLog.inputSchema, { start: "03/14/2026" }), "YYYY-MM-DD");
});
check("out-of-range days rejected", () => {
  throws(() => coerceInput(getDailyLog.inputSchema, { days: "99999" }), "at most 3650");
});

console.log("\n-- nested array of objects (logMetrics) --");
const logMetrics = findToolByName("logMetrics")!;
check("nested metric rows coerce", () => {
  const out = coerceInput(logMetrics.inputSchema, {
    date: "2026-09-14",
    metrics: [{ metric: "Weight", value: 178.4 }, { metric: "Mood", value: "7" }],
  });
  eq(row(out.metrics, 1).value, 7);
});
check("checkbox true coerces to 1", () => {
  const out = coerceInput(logMetrics.inputSchema, {
    date: "2026-09-14",
    metrics: [{ metric: "Meditated", value: true }],
  });
  eq(row(out.metrics, 0).value, 1);
});
check("missing required date rejected", () => {
  throws(() => coerceInput(logMetrics.inputSchema, { metrics: [] }), "Missing required field: date");
});
check("unknown top-level field rejected with hint", () => {
  throws(() => coerceInput(logMetrics.inputSchema, { date: "2026-09-14", metrics: [], notes: "x" }), "Unknown field(s): notes");
});
check("required field inside array item enforced", () => {
  throws(() => coerceInput(logMetrics.inputSchema, {
    date: "2026-09-14", metrics: [{ value: 5 }],
  }), "Missing required field: metric");
});

console.log("\n-- enum + deep nesting (logWorkout sets) --");
const logWorkout = findToolByName("logWorkout")!;
check("exercise sets nest two levels deep", () => {
  const out = coerceInput(logWorkout.inputSchema, {
    date: "2026-09-14",
    exercises: [{ name: "Bench Press", sets: [{ reps: "8", weight: "185" }] }],
  });
  eq(row(out.exercises, 0).sets![0], { reps: 8, weight: 185 });
});
const addBook = findToolByName("addBook")!;
check("bad enum value rejected", () => {
  throws(() => coerceInput(addBook.inputSchema, { title: "A", author: "B", status: "finished" }), "must be one of");
});

console.log("\n-- PKCE (RFC 7636 test vector) --");
async function pkceTests() {
  const v = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
  const c = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";
  const ok = await verifyPkce(v, c, "S256");
  const bad = await verifyPkce("wrong-verifier", c, "S256");
  const plain = await verifyPkce(v, c, "plain");
  check("RFC 7636 vector verifies", () => eq(ok, true));
  check("wrong verifier rejected", () => eq(bad, false));
  check("plain method refused (OAuth 2.1)", () => eq(plain, false));
}

console.log("\n-- scopes + redirect URIs --");
check("unknown scopes dropped", () => eq(parseScopes("read write admin"), ["read", "write"]));
check("empty scope string -> none", () => eq(parseScopes(""), []));
check("https redirect allowed", () => eq(isAcceptableRedirectUri("https://claude.ai/api/mcp/auth_callback"), true));
check("loopback allowed", () => eq(isAcceptableRedirectUri("http://127.0.0.1:6274/cb"), true));
check("private scheme allowed", () => eq(isAcceptableRedirectUri("claude://oauth/callback"), true));
check("plain http host refused", () => eq(isAcceptableRedirectUri("http://evil.example.com/cb"), false));
check("garbage refused", () => eq(isAcceptableRedirectUri("not a url"), false));

console.log("\n-- registry integrity --");
check("tool names unique", () => {
  const names = AGENT_TOOLS.map(t => t.name);
  eq(new Set(names).size, names.length);
});
check("every route+method pair unique", () => {
  const keys = AGENT_TOOLS.map(t => `${t.method} ${t.path}`);
  eq(new Set(keys).size, keys.length);
});
check("every write tool declares required fields", () => {
  for (const t of AGENT_TOOLS.filter(t => !t.readOnly)) {
    if (!t.inputSchema.required?.length) throw new Error(`${t.name} has no required fields`);
  }
});

pkceTests().then(() => {
  console.log(`\n${pass} passed, ${fail} failed\n`);
  process.exit(fail > 0 ? 1 : 0);
});
