import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";
import { createClient } from "@supabase/supabase-js";

// ---------- helpers ----------
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function toBool(v: any): boolean {
  const s = String(v ?? "").trim().toLowerCase();
  return s === "true" || s === "1" || s === "yes" || s === "y";
}

// Accept common checkbox truthy values
function isTruthyCell(v: any): boolean {
  const s = String(v ?? "").trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "y" || s === "x" || s === "checked";
}

// HH:MM -> minutes (returns null if invalid)
function hhmmToMinutes(v: any): number | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const m = s.match(/^(\d{1,3}):([0-5]\d)$/);
  if (!m) return null;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(mm)) return null;
  return h * 60 + mm;
}

function toNumberOrNull(v: any): number | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function batch<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// ---------- main ----------
async function main() {
  const configPath = process.argv[2]; // optional
  const widePath = process.argv[3];   // required
  const ownerId = process.argv[4];    // required: your user UUID

  if (!widePath || !ownerId) {
    console.error(
      `Usage:
  npx tsx scripts/import.ts <config.csv|-> <log_wide.csv> <owner_id>

Examples:
  npx tsx scripts/import.ts data/config.csv data/log_wide.csv <OWNER_UUID>
  npx tsx scripts/import.ts - data/log_wide.csv <OWNER_UUID>
`
    );
    process.exit(1);
  }

  const SUPABASE_URL = process.env.SUPABASE_URL!;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing env SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // ---- 1) Optional: upsert config from config.csv ----
  if (configPath && configPath !== "-") {
    const raw = fs.readFileSync(configPath, "utf8");
    const records = parse(raw, { columns: true, skip_empty_lines: true });

    // Expect at least metric_id + type; everything else optional
    const cfgRows = records.map((r: any) => {
      const metric_id = String(r.metric_id ?? "").trim();
      if (!metric_id) throw new Error("config.csv missing metric_id on a row");

      const type = String(r.type ?? "").trim(); // checkbox|number|time|hhmm
      if (!type) throw new Error(`config.csv row for ${metric_id} missing type`);

      const required = toBool(r.required);
      const required_since =
        String(r.required_since ?? "").trim() || (required ? new Date().toISOString().slice(0, 10) : null);

      const start_date = String(r.start_date ?? "").trim() || null;

      return {
        owner_id: ownerId,
        metric_id,
        metric_name: String(r.metric_name ?? "").trim() || null,
        type,
        private: r.private === "" || r.private == null ? false : toBool(r.private),
        active: r.active === "" || r.active == null ? true : toBool(r.active),

        // ordering / grouping
        group: String(r.group ?? "").trim() || null,
        group_order: r.group_order === "" || r.group_order == null ? 0 : Number(r.group_order) || 0,
        metric_order: r.metric_order === "" || r.metric_order == null ? 0 : Number(r.metric_order) || 0,

        // rules
        required,
        required_since: required ? required_since : null,
        start_date,

        default_value: r.default_value === "" || r.default_value == null ? null : Number(r.default_value),
        min_value: r.min_value === "" || r.min_value == null ? null : Number(r.min_value),
        max_value: r.max_value === "" || r.max_value == null ? null : Number(r.max_value),
        disallowed_values: String(r.disallowed_values ?? "").trim() || null,

        preset_values_csv: String(r.preset_values_csv ?? "").trim() || null,

        show_ma: r.show_ma === "" || r.show_ma == null ? false : toBool(r.show_ma),
        ma_periods_csv: String(r.ma_periods_csv ?? "").trim() || null,

        is_calculated: r.is_calculated === "" || r.is_calculated == null ? false : toBool(r.is_calculated),
        calc_expr: String(r.calc_expr ?? "").trim() || null,
      };
    });

    // Upsert by (owner_id, metric_id)
    const { error } = await supabase
      .from("config")
      .upsert(cfgRows, { onConflict: "owner_id,metric_id" });

    if (error) throw new Error(`Config upsert failed: ${error.message}`);
    console.log(`✅ Upserted config rows: ${cfgRows.length}`);
  } else {
    console.log("ℹ️ Skipping config upsert (configPath = '-')");
  }

  // ---- 2) Read wide log CSV ----
  const wideRaw = fs.readFileSync(widePath, "utf8");
  const wideRecords: any[] = parse(wideRaw, { columns: true, skip_empty_lines: true });

  // Extract date range
  const dates = wideRecords.map((r) => String(r.date ?? "").trim()).filter(Boolean);
  if (dates.some((d) => !ISO_DATE_RE.test(d))) {
    throw new Error("log_wide.csv contains invalid date. Must be YYYY-MM-DD.");
  }
  const minDate = dates.reduce((a, b) => (a < b ? a : b));
  const maxDate = dates.reduce((a, b) => (a > b ? a : b));
  console.log(`ℹ️ Import date range: ${minDate} → ${maxDate}`);

  // Load config types so we can parse values correctly
  const { data: cfg, error: cfgErr } = await supabase
    .from("config")
    .select("metric_id, type")
    .eq("owner_id", ownerId);

  if (cfgErr) throw new Error(`Config read failed: ${cfgErr.message}`);

  const typeById = new Map<string, string>();
  for (const c of cfg ?? []) typeById.set(c.metric_id, c.type);

  // Wide headers => metric ids (everything except date)
  const headers = Object.keys(wideRecords[0] ?? {});
  const metricIds = headers.filter((h) => h !== "date");

  // ---- 3) OVERWRITE mode: delete existing log rows in that date range ----
  const { error: delErr } = await supabase
    .from("log")
    .delete()
    .eq("owner_id", ownerId)
    .gte("date", minDate)
    .lte("date", maxDate);

  if (delErr) throw new Error(`Log delete failed: ${delErr.message}`);
  console.log(`✅ Cleared existing log rows in range`);

  // ---- 4) Build insert rows (row/no-row semantics) ----
  const inserts: {
    owner_id: string;
    date: string;
    metric_id: string;
    value?: number;
    value_text?: string;
    }[] = [];

  for (const r of wideRecords) {
    const date = String(r.date ?? "").trim();
    if (!date) continue;

    for (const mid of metricIds) {
      const rawVal = r[mid];
      const t = typeById.get(mid); // can be undefined if config missing

      // Treat blanks as no-row
      if (rawVal == null || String(rawVal).trim() === "") continue;

      if (t === "checkbox") {
        if (isTruthyCell(rawVal)) {
          inserts.push({ owner_id: ownerId, date, metric_id: mid, value: 1 });
        }
        // unchecked -> no row
        continue;
      }

      if (t === "hhmm") {
        const mins = hhmmToMinutes(rawVal);
        if (mins != null) inserts.push({ owner_id: ownerId, date, metric_id: mid, value: mins });
        continue;
      }

      if (t === "text") {
        const s = String(rawVal ?? "");
        // treat whitespace-only as blank (no row)
        if (s.trim() !== "") {
            inserts.push({ owner_id: ownerId, date, metric_id: mid, value_text: s });
        }
        continue;
      }

      // number/time default: numeric
      const n = toNumberOrNull(rawVal);
      if (n != null) inserts.push({ owner_id: ownerId, date, metric_id: mid, value: n });
    }
  }

  console.log(`ℹ️ Rows to insert: ${inserts.length}`);

  // ---- 5) Insert in batches ----
  for (const chunk of batch(inserts, 1000)) {
    const { error } = await supabase
      .from("log")
      .insert(chunk);

    if (error) throw new Error(`Log insert failed: ${error.message}`);
    process.stdout.write(".");
  }
  process.stdout.write("\n");
  console.log("✅ Import complete");
}

main().catch((e) => {
  console.error("❌ Import failed:", e);
  process.exit(1);
});
