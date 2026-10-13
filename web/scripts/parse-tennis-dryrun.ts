/**
 * Tennis note parse — DRY RUN. Reads nothing from and writes nothing to the
 * database. Reads a local JSON extract of candidate tennis notes, parses a
 * stratified sample through the Anthropic API, and writes the results plus the
 * original note text to a file for human review.
 *
 *   npx tsx scripts/parse-tennis-dryrun.ts [--all] [--limit N]
 *
 * Default is a 12-note stratified sample (4 per era, biased toward mixed
 * lift+tennis notes, which are the hard case).
 */
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import {
  TennisNote,
  EXTRACTION_RULES,
  PROMPT_VERSION,
} from "@/lib/tennis/parse-contract";

dotenv.config({ path: path.join(__dirname, "..", ".env") });

const SCRATCH = path.join(
  "C:/Users/merri/AppData/Local/Temp/claude",
  "C--Users-merri-Daily-Tracker-code-daily-tracker-web",
  "47cec5a2-8d7d-44c4-9c49-9b31297c5b21/scratchpad",
);
const INPUT = path.join(SCRATCH, "tennis_backfill_set.json");
const MODEL = "claude-opus-5-5";
const CONCURRENCY = 3;

// $/1M tokens for claude-opus-5-5
const PRICE_IN = 4.0;
const PRICE_OUT = 20.0;

type Note = { date: string; notes: string | null; ex: string[]; rating: number | null };

function buildUser(n: Note): string {
  const ctx = [
    `Date: ${n.date}`,
    n.ex.length ? `Exercises logged on this workout: ${n.ex.join(", ")}` : "Exercises logged: none",
    n.rating != null ? `Session rating (1-5): ${n.rating}` : null,
  ]
    .filter(Boolean)
    .join("\n");
  return `${ctx}\n\nNote:\n"""\n${n.notes ?? ""}\n"""`;
}

const LIFT =
  /squat|bench|deadlift|rack pull|\bcurl|\brow\b|\bdip|chinup|chin-up|kb swing|\bsets? of\b|\blbs\b|\breps\b/i;

function era(date: string): "2017-2020" | "2021-2023" | "2024-2026" {
  const y = Number(date.slice(0, 4));
  return y <= 2020 ? "2017-2020" : y <= 2023 ? "2021-2023" : "2024-2026";
}

/** Deterministic stratified pick: per era, take up to 2 mixed notes (the hard
 *  case) then fill to `per` with evenly spaced pure-tennis notes. */
function sample(notes: Note[], per: number): Note[] {
  const out: Note[] = [];
  for (const e of ["2017-2020", "2021-2023", "2024-2026"] as const) {
    const inEra = notes.filter((n) => era(n.date) === e);
    const mixed = inEra.filter((n) => LIFT.test(n.notes ?? ""));
    const pure = inEra.filter((n) => !LIFT.test(n.notes ?? ""));
    const picked: Note[] = [];
    const wantMixed = Math.min(2, mixed.length);
    for (let i = 0; i < wantMixed; i++) {
      picked.push(mixed[Math.floor((i * mixed.length) / wantMixed)]);
    }
    const need = Math.min(per - picked.length, pure.length);
    for (let i = 0; i < need; i++) {
      picked.push(pure[Math.floor((i * pure.length) / need)]);
    }
    out.push(...picked);
  }
  return out;
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T, i: number) => Promise<R>) {
  const results: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      for (;;) {
        const i = next++;
        if (i >= items.length) return;
        results[i] = await fn(items[i], i);
      }
    }),
  );
  return results;
}

type Row = {
  date: string;
  era?: string;
  raw: string | null;
  exercises?: string[];
  parsed?: z.infer<typeof TennisNote> | null;
  error?: string;
};

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY is not set (expected in web/.env)");
    process.exit(1);
  }
  if (!fs.existsSync(INPUT)) {
    console.error(`Input not found: ${INPUT}`);
    process.exit(1);
  }

  const all: Note[] = JSON.parse(fs.readFileSync(INPUT, "utf8"));
  const args = process.argv.slice(2);
  const limitArg = args.indexOf("--limit");
  const perEra = limitArg >= 0 ? Math.ceil(Number(args[limitArg + 1]) / 3) : 4;
  const chosen = args.includes("--all") ? all : sample(all, perEra);

  console.log("DRY RUN — no database writes.");
  console.log(`corpus: ${all.length} notes | parsing: ${chosen.length} | model: ${MODEL}`);
  console.log(
    `eras: ${(["2017-2020", "2021-2023", "2024-2026"] as const)
      .map((e) => `${e}=${chosen.filter((n) => era(n.date) === e).length}`)
      .join(" ")}\n`,
  );

  const client = new Anthropic();
  let inTok = 0;
  let outTok = 0;

  const rows: Row[] = await mapLimit(chosen, CONCURRENCY, async (n, i) => {
    const tag = `  ${i + 1}/${chosen.length} ${n.date}`;
    try {
      const msg = await client.messages.parse({
        model: MODEL,
        max_tokens: 16000,
        system: EXTRACTION_RULES,
        output_config: {
          effort: "medium",
          format: zodOutputFormat(TennisNote),
        },
        messages: [{ role: "user", content: buildUser(n) }],
      });
      inTok += msg.usage.input_tokens;
      outTok += msg.usage.output_tokens;
      if (msg.stop_reason === "refusal") {
        console.log(`${tag}  REFUSED`);
        return { date: n.date, raw: n.notes, error: "refusal" };
      }
      const p = msg.parsed_output;
      const filled = p ? Object.values(p.sections).filter((v) => v != null).length : 0;
      console.log(
        `${tag}  tennis=${p?.is_tennis_session} conf=${p?.confidence} mixed=${p?.mixed_note} sections=${filled}/11`,
      );
      return { date: n.date, era: era(n.date), raw: n.notes, exercises: n.ex, parsed: p };
    } catch (err) {
      const m =
        err instanceof Anthropic.RateLimitError
          ? "rate limited"
          : err instanceof Anthropic.APIError
            ? `API ${err.status}: ${err.message}`
            : err instanceof Error
              ? err.message
              : String(err);
      console.log(`${tag}  ERROR ${m}`);
      return { date: n.date, raw: n.notes, error: m };
    }
  });

  const cost = (inTok / 1e6) * PRICE_IN + (outTok / 1e6) * PRICE_OUT;
  const jsonOut = path.join(SCRATCH, "tennis_dryrun.json");
  const txtOut = path.join(SCRATCH, "tennis_dryrun_review.txt");
  fs.writeFileSync(
    jsonOut,
    JSON.stringify(
      { model: MODEL, prompt_version: PROMPT_VERSION, usage: { inTok, outTok, cost }, rows },
      null,
      1,
    ),
  );

  // Side-by-side review file: original note, then what was extracted.
  const lines: string[] = [];
  for (const r of rows) {
    lines.push("=".repeat(78));
    lines.push(`${r.date}   [${r.era ?? "?"}]   exercises: ${r.exercises?.join(", ") || "none"}`);
    lines.push("-".repeat(78));
    lines.push("ORIGINAL:");
    lines.push(String(r.raw ?? "").trim());
    lines.push("");
    if (r.error) {
      lines.push(`ERROR: ${r.error}`);
      lines.push("");
      continue;
    }
    const p = r.parsed;
    if (!p) {
      lines.push("PARSED: (no parsed_output returned)");
      lines.push("");
      continue;
    }
    lines.push(
      `PARSED: tennis=${p.is_tennis_session} conf=${p.confidence} mixed=${p.mixed_note} result=${p.result} score=${p.score ?? "-"} format=${p.format} league=${p.league ?? "-"} surface=${p.surface}`,
    );
    lines.push(`  partner=${p.partner ?? "-"}  opponent=${p.opponent ?? "-"}`);
    if (p.mixed_note) lines.push(`  tennis span: ${JSON.stringify(p.source_excerpt)}`);
    for (const [k, v] of Object.entries(p.sections)) {
      if (v != null) lines.push(`  ${k.padEnd(11)}: ${v}`);
    }
    const nulls = Object.entries(p.sections)
      .filter(([, v]) => v == null)
      .map(([k]) => k);
    if (nulls.length) lines.push(`  (null: ${nulls.join(", ")})`);
    lines.push("");
  }
  fs.writeFileSync(txtOut, lines.join("\n"));

  const ok = rows.filter((r) => !r.error).length;
  console.log(`\nparsed ${ok}/${rows.length} | tokens: ${inTok} in / ${outTok} out`);
  console.log(
    `actual cost: $${cost.toFixed(4)}  →  full ${all.length}-note backfill ≈ $${((cost / Math.max(ok, 1)) * all.length).toFixed(2)}`,
  );
  console.log(`\nreview file: ${txtOut}`);
  console.log(`json:        ${jsonOut}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
