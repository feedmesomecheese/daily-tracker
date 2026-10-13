/**
 * Validates a tennis-note parse file against the contract. No API calls, no
 * database access — pure checking, so it runs the same whether the parse was
 * produced by a script, by hand, or in a Claude session.
 *
 *   npx tsx scripts/validate-tennis-parse.ts <parse.json>
 *
 * Checks, per row:
 *   1. schema      — conforms to TennisNote (hard error)
 *   2. excerpt     — source_excerpt is a verbatim substring of the raw note
 *   3. keywords    — a section keyword appears in the tennis span but the
 *                    section is null (warning: likely dropped content)
 *   4. leakage     — lifting content appears in a tennis section (warning)
 *   5. coverage    — share of the tennis span's content words represented
 */
import * as fs from "fs";
import {
  TennisNote,
  SECTION_KEYS,
  SECTION_KEYWORDS,
  PROMPT_VERSION,
} from "@/lib/tennis/parse-contract";

type Row = {
  date: string;
  era?: string;
  raw: string | null;
  exercises?: string[];
  parsed?: unknown;
  error?: string;
};

const LIFT =
  /squat|bench press|deadlift|rack pull|\bcurl|chinup|chin-up|kb swing|ab wheel|\blbs\b|\breps\b|\bsets of\b/i;

const STOP = new Set(
  "a an the and or but i my me we us he him his she her it its to of in on at for with w b c be was were is are am had have has did do does got get that this then than so just really pretty much more most not no out up down off over all some few lot lots there their they them as if when while because about into from by".split(
    " ",
  ),
);

function contentWords(t: string | null): Set<string> {
  return new Set(
    (t ?? "")
      .toLowerCase()
      .match(/[a-z0-9']+/g)
      ?.filter((w) => w.length > 2 && !STOP.has(w)) ?? [],
  );
}

/** Whitespace-insensitive substring test — a verbatim excerpt may differ only
 *  in run-length of spaces after a round trip through JSON. */
function isVerbatim(excerpt: string, raw: string): boolean {
  const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
  return norm(raw).includes(norm(excerpt));
}

function main() {
  const file = process.argv[2];
  if (!file) {
    console.error("usage: npx tsx scripts/validate-tennis-parse.ts <parse.json>");
    process.exit(1);
  }
  const doc = JSON.parse(fs.readFileSync(file, "utf8")) as {
    prompt_version?: number;
    rows: Row[];
  };

  if (doc.prompt_version !== PROMPT_VERSION) {
    console.log(
      `note: file prompt_version=${doc.prompt_version}, contract is v${PROMPT_VERSION}\n`,
    );
  }

  let errors = 0;
  let warnings = 0;
  const coverages: number[] = [];
  let sessions = 0;

  for (const r of doc.rows) {
    const problems: string[] = [];
    const notes: string[] = [];

    if (r.error) {
      console.log(`${r.date}  SKIPPED (${r.error})`);
      continue;
    }

    const res = TennisNote.safeParse(r.parsed);
    if (!res.success) {
      console.log(`${r.date}  SCHEMA FAIL`);
      for (const issue of res.error.issues.slice(0, 6)) {
        console.log(`    ${issue.path.join(".") || "(root)"}: ${issue.message}`);
      }
      errors++;
      continue;
    }
    const p = res.data;
    const raw = r.raw ?? "";

    if (!p.is_tennis_session) {
      const filled = SECTION_KEYS.filter((k) => p.sections[k] != null);
      if (filled.length) problems.push(`not a session but ${filled.length} sections filled`);
      console.log(
        `${r.date}  not-a-session${problems.length ? "  ERROR: " + problems.join("; ") : "  ok"}`,
      );
      if (problems.length) errors++;
      continue;
    }
    sessions++;

    // 2. excerpt must be verbatim
    if (p.source_excerpt && !isVerbatim(p.source_excerpt, raw)) {
      problems.push("source_excerpt is not a verbatim substring of the note");
    }
    if (!p.mixed_note && p.source_excerpt && !isVerbatim(raw, p.source_excerpt)) {
      notes.push("mixed_note=false but excerpt is shorter than the note");
    }

    const span = p.mixed_note && p.source_excerpt ? p.source_excerpt : raw;

    // 3. keyword present in span but section null — unless some other section
    //    captured that text. "a lob to the deep backhand side" belongs in lobs,
    //    and the word surviving in lobs means nothing was dropped. A true drop
    //    leaves the keyword in no section at all.
    for (const [key, re] of Object.entries(SECTION_KEYWORDS)) {
      if (re.test(span) && p.sections[key as keyof typeof p.sections] == null) {
        const capturedElsewhere = SECTION_KEYS.some((k) => {
          const v = p.sections[k];
          return v != null && re.test(v);
        });
        if (!capturedElsewhere) notes.push(`${key} keyword in note but section null`);
      }
    }

    // 4. lifting content leaked into a tennis section
    for (const k of SECTION_KEYS) {
      const v = p.sections[k];
      if (v && LIFT.test(v)) notes.push(`lifting content in "${k}"`);
    }
    if (p.source_excerpt && LIFT.test(p.source_excerpt)) {
      notes.push("lifting content in source_excerpt");
    }

    // 5. coverage of the tennis span
    const ow = contentWords(span);
    const pw = contentWords(
      [
        ...SECTION_KEYS.map((k) => p.sections[k]),
        p.score,
        p.league,
        p.partner,
        p.opponent,
        p.result,
        p.format,
        p.surface,
      ]
        .filter(Boolean)
        .join(" "),
    );
    const dropped = [...ow].filter((w) => !pw.has(w));
    const cov = 1 - dropped.length / Math.max(ow.size, 1);
    coverages.push(cov);

    const filled = SECTION_KEYS.filter((k) => p.sections[k] != null).length;
    const flag = problems.length ? "ERROR" : notes.length ? "warn " : "ok   ";
    console.log(
      `${r.date}  ${flag} sections=${String(filled).padStart(2)}/11  coverage=${(cov * 100).toFixed(0).padStart(3)}%  result=${p.result} score=${p.score ?? "-"} format=${p.format}`,
    );
    for (const x of problems) console.log(`    ERROR: ${x}`);
    for (const x of notes) console.log(`    warn:  ${x}`);
    if (cov < 0.75) console.log(`    warn:  low coverage, dropped: ${dropped.slice(0, 12).join(", ")}`);
    errors += problems.length;
    warnings += notes.length;
  }

  const mean = coverages.length
    ? (100 * coverages.reduce((a, b) => a + b, 0)) / coverages.length
    : 0;
  console.log(
    `\n${doc.rows.length} rows | ${sessions} sessions | ${errors} errors | ${warnings} warnings | mean coverage ${mean.toFixed(0)}%`,
  );
  if (errors) process.exit(1);
}

main();
