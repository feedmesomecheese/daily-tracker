/**
 * The contract for turning a free-text tennis note into structured sections.
 *
 * This is the single source of truth for the shape, the extraction rules, and
 * the audit heuristics. Everything that produces or checks a parse imports it:
 * the dry-run script, the validator, and (later) the cron route. Bumping
 * PROMPT_VERSION marks every stored parse as stale so it can be re-run.
 */
import { z } from "zod";

export const PROMPT_VERSION = 2;

/** Nullable, never optional: the producer must emit an explicit null so
 *  "the note didn't mention it" is distinguishable from "the parser forgot". */
const Section = z.string().nullable();

export const TennisNote = z.object({
  is_tennis_session: z
    .boolean()
    .describe(
      "True only if this note describes the author actually playing tennis. False for passing references like 'legs sore from tennis'.",
    ),
  confidence: z.enum(["high", "medium", "low"]),
  mixed_note: z
    .boolean()
    .describe(
      "True only if the NOTE TEXT also covers a non-tennis workout. Not about what exercises were logged that day.",
    ),
  source_excerpt: Section.describe(
    "Verbatim span of the note text that covers tennis. The whole note when the note is tennis-only. Never paraphrased.",
  ),
  result: z.enum(["win", "loss", "split", "practice", "unknown"]),
  score: Section.describe("Sets separated by spaces, e.g. '6-4 2-6 10-6'. Null if absent."),
  format: z.enum(["singles", "doubles", "unknown"]),
  league: Section.describe("e.g. '3.5 #1 singles', '4.0 #3 doubles', '7.5 combo'. Null if absent."),
  surface: z.enum(["hard", "clay", "unknown"]),
  partner: Section,
  opponent: Section,
  sections: z.object({
    general: Section,
    serves: Section,
    forehand: Section,
    backhand: Section,
    net: Section,
    overheads: Section,
    lobs: Section,
    equipment: Section,
    mental: Section,
    body: Section,
    conditions: Section,
  }),
});

export type TennisNoteParse = z.infer<typeof TennisNote>;

/** Re-exported so producers keep a single import. The list itself lives in
 *  ./sections, which the read UI imports without pulling zod into the bundle. */
export { SECTION_KEYS, type SectionKey } from "./sections";

/**
 * Audit heuristic, not a parsing rule: if one of these appears in the tennis
 * span but the matching section came back null, the parse probably dropped
 * content. Deliberately loose — it produces warnings for a human to judge,
 * which is how the 2025-11-24 "Groundstrokes" drop would have been caught.
 */
export const SECTION_KEYWORDS: Record<string, RegExp> = {
  serves: /\bserv|\bace[sd]?\b|double fault|\btoss|\bfault/i,
  forehand: /forehand|four-hand|groundstroke|ground stroke|gun stroke|gunstroke/i,
  backhand: /backhand|back stroke|backstroke/i,
  net: /net play|at the net|volley|putaway|put away|put aways|poach|coach(?:ed|ing)? him|drop shot|dropshot/i,
  overheads: /overhead|\bslam/i,
  lobs: /\blob/i,
  // Deliberately narrower than the words that mean equipment. Bare "grip" and
  // bare "racquet" show up constantly in technique sentences ("volley grip",
  // "racquet head speed", "hold the racquet"), which produced false warnings on
  // a third of the sample. Real equipment notes in this corpus name strings,
  // tension, a swap, a damper or shoes, so match those instead.
  equipment:
    /\bstring|tension|overgrip|grip tape|regrip|restrung|\bshoes|damper|new rac(?:quet|ket)|rac(?:quet|ket) (?:felt|was dead|died)|switched rac(?:quet|ket)/i,
  // "wind" must not match "got winded", which is a body observation.
  conditions: /\bclay\b|\bwind\b|\bwindy\b|humid|lighting|\bcold\b|\bhot\b|hard court/i,
  body: /cramp|\bsore|tired|exhaust|injur|hamstring|\bknee|winded|drench/i,
  // Not bare "focus": "focused on my backhand" is technique intent, not a
  // mental-state observation. Only the state sense should flag a missing section.
  mental:
    /lost focus|losing focus|lose focus|couldn't focus|focus and concentration|nerves|nervous|confiden|tighten|overthink|\bmental|own head|distract|rattled/i,
};

/**
 * The extraction rules, kept next to the schema so a parse produced by hand in
 * a session and a parse produced by an API call follow the same contract.
 * v2 changes are marked; each came from a defect found auditing v1 output.
 */
export const EXTRACTION_RULES = `You extract structured tennis match notes from a personal workout log spanning 2017-2026.

The notes are written by one player about his own recreational and league tennis. Many are dictated by voice, so expect transcription errors. Known recurring errors in this corpus - interpret them correctly:
- "gun strokes", "gunstrokes", "ground stroke" -> groundstrokes
- "back strokes" -> backhands
- "logs" -> lobs
- "coach", "coaching", "coach him" -> poach / poaching
- "four-hand" -> forehand
- "Servers" -> serves
- "false" (in a serving context) -> faults
- "combos", "7.5 combos" -> 7.5 combo league
- "inside-in" is a real shot name, not an error

Rules:
1. Extract only what the note says. If the note does not address a section, return null. Never infer, never generalize, never write "not mentioned".
2. Use the author's own words. Do not add analysis or coaching advice.
3. [v2] The author uses "groundstrokes" to mean his forehand side. Groundstroke content belongs in the "forehand" section. Never drop it because the field is named differently than the word he used.
4. Many notes cover BOTH a lifting workout and tennis in one block of text. Put ONLY tennis text in source_excerpt and the sections. Never pull squat/bench/deadlift content into a tennis section.
5. [v2] mixed_note describes the NOTE TEXT only. If the note talks solely about tennis, mixed_note is false even when other exercises were logged that day, and source_excerpt is the whole note.
6. Some notes mention tennis only in passing ("legs sore from tennis", "skipped squats because I had tennis"). Those are not tennis sessions: is_tennis_session=false, all sections null.
7. [v2] Never infer "format" from absence of evidence. Set it only by these three cases, in order:
   (a) The note names the format ("3.5 #2 doubles", "Lost 3.5 singles #2") - use it, and read "w/ X" as a partner when the note says doubles, as an opponent when it says singles.
   (b) Otherwise, if the note refers to exactly one other player (named, or only as "he"/"him") AND reports results in the first person singular ("I won 62 64"), set format="singles" with that player as opponent, and confidence no higher than "medium".
   (c) Otherwise "unknown". A bare "we"/"us" with no named partner is NOT evidence of doubles, and "w/ X" on its own is ambiguous in this corpus - it means a doubles partner in some notes and a singles opponent in others. When ambiguous leave format "unknown", leave partner and opponent null, and mention the name in general instead.
8. [v2] "conditions" is court surface and weather only - clay, wind, humidity, cold, court lighting. Time of day is NOT a condition. If the note only says "in the evening", conditions is null.
9. [v2] "body" needs an actual physical observation about the author - fatigue, cramping, soreness, injury, conditioning. Session intensity ("not very intense") is not a body observation. "mental" needs an actual observation about focus, nerves, confidence, tightening or tilt. Winning or relief at the result is not a mental observation. When in doubt, null.
10. "net" covers volleys, putaways, poaching, approaches and drop shots. "overheads" covers overheads and slams hit off a lob - keep these separate.
11. "equipment" covers racquet, strings, tension, grip, shoes, dampers.
12. Scores: the author often writes them without separators ("64 16", "36 46", "57") meaning 6-4 1-6, 3-6 4-6, 5-7. Normalize to "6-4 1-6". Tiebreak scores like "(5-10)" or "10-7" are a third set - include them. A set tiebreak is written "7-6(7-2)".
13. A practice, hitting or lesson session with no score is result="practice".`;
