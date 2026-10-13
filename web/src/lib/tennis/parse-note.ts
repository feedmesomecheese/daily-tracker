/**
 * One note in, one parse out — the production side of the parse contract.
 *
 * The prompt, the schema and the rules all live in ./parse-contract; this
 * module is only the call and the mapping onto the workout_activity_notes
 * columns. Keeping the mapping here means the cron route never decides what a
 * parse means, it just stores what comes back.
 */
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import {
  TennisNote,
  EXTRACTION_RULES,
  PROMPT_VERSION,
  type TennisNoteParse,
} from "./parse-contract";

export const PARSE_MODEL = "claude-opus-5-5";

/** Recorded in workout_activity_notes.parser, so a bad batch can be found by
 *  which model produced it rather than by guessing from dates. */
export const PARSER_ID = `cron:${PARSE_MODEL}`;

export type NoteContext = {
  date: string;
  notes: string | null;
  /** Exercise names logged on the same workout. Context only: rule 5 says the
   *  note text alone decides mixed_note, not what else was logged that day. */
  exercises: string[];
  rating: number | null;
};

function buildUser(n: NoteContext): string {
  const ctx = [
    `Date: ${n.date}`,
    n.exercises.length
      ? `Exercises logged on this workout: ${n.exercises.join(", ")}`
      : "Exercises logged: none",
    n.rating != null ? `Session rating (1-5): ${n.rating}` : null,
  ]
    .filter(Boolean)
    .join("\n");
  return `${ctx}\n\nNote:\n"""\n${n.notes ?? ""}\n"""`;
}

/** Throws on API failure or refusal; the caller records that as a failed parse. */
export async function parseTennisNote(
  client: Anthropic,
  note: NoteContext,
): Promise<TennisNoteParse> {
  const msg = await client.messages.parse({
    model: PARSE_MODEL,
    max_tokens: 16000,
    system: EXTRACTION_RULES,
    output_config: {
      effort: "medium",
      format: zodOutputFormat(TennisNote),
    },
    messages: [{ role: "user", content: buildUser(note) }],
  });

  if (msg.stop_reason === "refusal") throw new Error("model refused to parse the note");
  if (!msg.parsed_output) throw new Error("no parsed output returned");
  return msg.parsed_output;
}

/**
 * The parse as workout_activity_notes columns.
 *
 * Null sections are stripped rather than stored: the parse always carries all
 * 11 keys, and keeping the nulls would make `sections ? 'serves'` true for
 * every row, which is the one query the GIN index exists to answer.
 *
 * A note that only mentions tennis in passing is 'skipped', not 'parsed' — it
 * is a real answer, not a failure, and it stops the row being retried forever.
 */
export function parseToRow(parse: TennisNoteParse, rawNoteHash: string) {
  const isSession = parse.is_tennis_session;
  const sections = Object.fromEntries(
    Object.entries(parse.sections).filter(([, v]) => v !== null && v !== ""),
  );

  return {
    status: isSession ? "parsed" : "skipped",
    parse_error: null,
    parsed_at: new Date().toISOString(),
    raw_note_hash: rawNoteHash,
    prompt_version: PROMPT_VERSION,
    parser: PARSER_ID,
    source_excerpt: isSession ? parse.source_excerpt : null,
    mixed_note: isSession ? parse.mixed_note : false,
    is_activity_session: isSession,
    confidence: isSession ? parse.confidence : null,
    result: isSession ? parse.result : null,
    score: isSession ? parse.score : null,
    format: isSession ? parse.format : null,
    league: isSession ? parse.league : null,
    surface: isSession ? parse.surface : null,
    partner: isSession ? parse.partner : null,
    opponent: isSession ? parse.opponent : null,
    sections: isSession ? sections : {},
    updated_at: new Date().toISOString(),
  };
}
