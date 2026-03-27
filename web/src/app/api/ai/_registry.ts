// AI path registry — add one entry here when creating a new /api/ai/* endpoint.
// The OpenAPI spec at /api/ai/openapi auto-generates from this list.
// Response schemas are intentionally kept vague (type: "object") so the spec
// never needs updating when data shapes change — GPT interprets the JSON naturally.

export type PathParam = {
  name: string;
  in: "query" | "path";
  description: string;
  required?: boolean;
  schema: { type: string; format?: string; default?: unknown; enum?: string[] };
};

export type AiPathDef = {
  path: string;
  operationId: string;
  summary: string;
  description: string;
  parameters?: PathParam[];
  responseDescription?: string;
};

export const AI_PATHS: AiPathDef[] = [
  {
    path: "/api/ai/log",
    operationId: "getDailyLog",
    summary: "Get daily log entries",
    description:
      "Returns daily tracked metrics (health, habits, mood, etc.) for a given period. Each entry is a date with a map of metric names to values.",
    parameters: [
      { name: "start", in: "query", description: "Start date in YYYY-MM-DD format. Use with end to query a specific range.", schema: { type: "string", format: "date" } },
      { name: "end", in: "query", description: "End date in YYYY-MM-DD format (default: today)", schema: { type: "string", format: "date" } },
      { name: "days", in: "query", description: "Number of days to return counting back from end (default 30, max 3650). Ignored if start is provided.", schema: { type: "integer", default: 30 } },
    ],
    responseDescription: "Daily log entries with metric values per date",
  },
  {
    path: "/api/ai/workouts",
    operationId: "getWorkouts",
    summary: "Get workout history",
    description:
      "Returns workouts with type, duration, rating, notes, per-exercise sets (reps and weight), exercise tonnage, and total workout tonnage.",
    parameters: [
      { name: "start", in: "query", description: "Start date in YYYY-MM-DD format.", schema: { type: "string", format: "date" } },
      { name: "end", in: "query", description: "End date in YYYY-MM-DD format (default: today)", schema: { type: "string", format: "date" } },
      { name: "days", in: "query", description: "Number of days to look back from end (default 60, max 3650). Ignored if start is provided.", schema: { type: "integer", default: 60 } },
    ],
    responseDescription: "Workout history with exercises, sets, and tonnage",
  },
  {
    path: "/api/ai/food",
    operationId: "getFoodLog",
    summary: "Get food/nutrition log",
    description:
      "Returns daily food logs with per-meal macro breakdowns (calories, protein, fat, carbs, fiber). Only days with logged food are included — gaps do not mean the user didn't eat.",
    parameters: [
      { name: "start", in: "query", description: "Start date in YYYY-MM-DD format.", schema: { type: "string", format: "date" } },
      { name: "end", in: "query", description: "End date in YYYY-MM-DD format (default: today)", schema: { type: "string", format: "date" } },
      { name: "days", in: "query", description: "Number of days to look back from end (default 30, max 3650). Ignored if start is provided.", schema: { type: "integer", default: 30 } },
    ],
    responseDescription: "Food log with daily and meal-level macro breakdowns",
  },
  {
    path: "/api/ai/labs",
    operationId: "getLabResults",
    summary: "Get medical lab results panel",
    description:
      "Returns a full lab panel with one entry per canonical test name. Each entry includes the latest value, reference range, optimal range, trend, status, and last 10 historical readings. Use ?test= to find a specific test, ?abnormal=true for out-of-range tests, ?category= to filter by panel type, ?since= to limit by latest draw date.",
    parameters: [
      { name: "test", in: "query", description: "Filter by test name (partial match, e.g. 'cholesterol', 'TSH', 'HbA1c')", schema: { type: "string" } },
      { name: "category", in: "query", description: "Filter by category: CBC, Metabolic, Lipid, Thyroid, Hormone, Vitamin, Urinalysis, Other", schema: { type: "string" } },
      { name: "since", in: "query", description: "Only include tests with a draw on or after this date (YYYY-MM-DD)", schema: { type: "string", format: "date" } },
      { name: "abnormal", in: "query", description: "Set to true to return only out-of-range tests", schema: { type: "string", enum: ["true", "false"] } },
    ],
    responseDescription: "Lab visit summaries and full panel with trends, optimal ranges, and status",
  },
  {
    path: "/api/ai/body",
    operationId: "getBodyMeasurements",
    summary: "Get weight and body fat history",
    description:
      "Returns all historical weight and body fat percentage entries. Optionally filter by date range.",
    parameters: [
      { name: "start", in: "query", description: "Start date in YYYY-MM-DD format (default: all history)", schema: { type: "string", format: "date" } },
      { name: "end", in: "query", description: "End date in YYYY-MM-DD format (default: today)", schema: { type: "string", format: "date" } },
    ],
    responseDescription: "Weight and body fat percentage history",
  },
  {
    path: "/api/ai/books",
    operationId: "getBooks",
    summary: "Get reading list with stats",
    description:
      "Returns stats: counts (all statuses), year_stats (books/pages/avg rating per year), genre_stats (count/avg rating per genre). Books array is empty unless filtered — always use ?status= or ?year= to retrieve books. Ratings are 0–10.",
    parameters: [
      { name: "status", in: "query", description: "Filter books by status: to_read, reading, completed, dnf", schema: { type: "string", enum: ["to_read", "reading", "completed", "dnf"] } },
      { name: "year", in: "query", description: "Filter books by the year they were finished. Only applies to the books array — counts and stats always cover all time.", schema: { type: "string" } },
      { name: "limit", in: "query", description: "Max books to return (default 50, max 200). Use with status/year filters.", schema: { type: "integer", default: 50 } },
    ],
    responseDescription: "Book list with reading stats by year and genre",
  },
];
