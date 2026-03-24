import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const host = req.headers.get("host") || "localhost:3000";
  const protocol = host.startsWith("localhost") ? "http" : "https";
  const baseUrl = `${protocol}://${host}`;

  const spec = {
    openapi: "3.1.0",
    info: {
      title: "Daily Tracker API",
      description: "Access personal health, workout, and reading data from Daily Tracker.",
      version: "1.0.0",
    },
    servers: [{ url: baseUrl }],
    paths: {
      "/api/ai/log": {
        get: {
          operationId: "getDailyLog",
          summary: "Get daily log entries",
          description:
            "Returns daily tracked metrics (health, habits, etc.) for a given period. Each entry is a date with a map of metric names to values.",
          parameters: [
            {
              name: "start",
              in: "query",
              description: "Start date in YYYY-MM-DD format. Use this with end to query a specific range (e.g. a full year).",
              schema: { type: "string", format: "date" },
            },
            {
              name: "end",
              in: "query",
              description: "End date in YYYY-MM-DD format (default: today)",
              schema: { type: "string", format: "date" },
            },
            {
              name: "days",
              in: "query",
              description: "Number of days to return counting back from end (default 30, max 3650). Ignored if start is provided.",
              schema: { type: "integer", default: 30 },
            },
          ],
          responses: {
            "200": {
              description: "Daily log entries",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      period: {
                        type: "object",
                        properties: {
                          start: { type: "string" },
                          end: { type: "string" },
                          days: { type: "integer" },
                        },
                      },
                      entries: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            date: { type: "string" },
                            metrics: { type: "object", additionalProperties: true },
                          },
                        },
                      },
                      metrics: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            id: { type: "string" },
                            name: { type: "string" },
                            type: { type: "string" },
                            group: { type: "string" },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/api/ai/workouts": {
        get: {
          operationId: "getWorkouts",
          summary: "Get workout history",
          description:
            "Returns workouts with type, duration, rating, notes, per-exercise sets (reps and weight), exercise tonnage, and total workout tonnage.",
          parameters: [
            {
              name: "start",
              in: "query",
              description: "Start date in YYYY-MM-DD format. Use this with end to query a specific range.",
              schema: { type: "string", format: "date" },
            },
            {
              name: "end",
              in: "query",
              description: "End date in YYYY-MM-DD format (default: today)",
              schema: { type: "string", format: "date" },
            },
            {
              name: "days",
              in: "query",
              description: "Number of days to look back from end (default 60, max 3650). Ignored if start is provided.",
              schema: { type: "integer", default: 60 },
            },
          ],
          responses: {
            "200": {
              description: "Workout history",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      period: { type: "object" },
                      workouts: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            date: { type: "string" },
                            type: { type: "string" },
                            duration_minutes: { type: "integer" },
                            rating: { type: "number" },
                            notes: { type: "string" },
                            body_weight: { type: "number" },
                            body_fat_pct: { type: "number" },
                            exercises: { type: "array", items: { type: "string" } },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/api/ai/books": {
        get: {
          operationId: "getBooks",
          summary: "Get reading list with stats",
          description:
            "Returns stats: counts (all statuses), year_stats (books/pages/avg rating per year), genre_stats (count/avg rating per genre). Books array is empty unless filtered — always use ?status= or ?year= to retrieve books. Ratings are 0–10.",
          parameters: [
            {
              name: "status",
              in: "query",
              description: "Filter books by status: to_read, reading, completed, dnf",
              schema: {
                type: "string",
                enum: ["to_read", "reading", "completed", "dnf"],
              },
            },
            {
              name: "year",
              in: "query",
              description: "Filter books by the year they were finished (e.g. 2025). Only applies to the books array — counts and stats always cover all time.",
              schema: { type: "string" },
            },
            {
              name: "limit",
              in: "query",
              description: "Max books to return (default 50, max 200). Use with status/year filters.",
              schema: { type: "integer", default: 50 },
            },
          ],
          responses: {
            "200": {
              description: "Book list with reading stats",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      counts: {
                        type: "object",
                        properties: {
                          total: { type: "integer" },
                          completed: { type: "integer" },
                          reading: { type: "integer" },
                          to_read: { type: "integer" },
                          dnf: { type: "integer" },
                        },
                      },
                      year_stats: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            year: { type: "string" },
                            books_read: { type: "integer" },
                            pages_read: { type: "integer" },
                            avg_rating: { type: "number" },
                            top_genres: { type: "array", items: { type: "object" } },
                          },
                        },
                      },
                      genre_stats: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            genre: { type: "string" },
                            count: { type: "integer" },
                            avg_rating: { type: "number" },
                          },
                        },
                      },
                      books: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            title: { type: "string" },
                            author: { type: "string" },
                            pages: { type: "integer" },
                            genre: { type: "string" },
                            format: { type: "string" },
                            source: { type: "string" },
                            status: { type: "string" },
                            rating: { type: "number" },
                            notes: { type: "string" },
                            added_at: { type: "string" },
                            started_at: { type: "string" },
                            finished_at: { type: "string" },
                            would_reread: { type: "boolean" },
                            reading_number: { type: "integer" },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/api/ai/body": {
        get: {
          operationId: "getBodyMeasurements",
          summary: "Get weight and body fat history",
          description: "Returns all historical weight and body fat percentage entries. Optionally filter by date range.",
          parameters: [
            {
              name: "start",
              in: "query",
              description: "Start date in YYYY-MM-DD format (default: all history)",
              schema: { type: "string", format: "date" },
            },
            {
              name: "end",
              in: "query",
              description: "End date in YYYY-MM-DD format (default: today)",
              schema: { type: "string", format: "date" },
            },
          ],
          responses: {
            "200": { description: "Weight and body fat history" },
          },
        },
      },
      "/api/ai/food": {
        get: {
          operationId: "getFoodLog",
          summary: "Get food/nutrition log",
          description:
            "Returns daily food logs with per-meal macro breakdowns (calories, protein, fat, carbs, fiber). Only days with logged food are included — gaps do not mean the user didn't eat.",
          parameters: [
            {
              name: "start",
              in: "query",
              description: "Start date in YYYY-MM-DD format.",
              schema: { type: "string", format: "date" },
            },
            {
              name: "end",
              in: "query",
              description: "End date in YYYY-MM-DD format (default: today)",
              schema: { type: "string", format: "date" },
            },
            {
              name: "days",
              in: "query",
              description: "Number of days to look back from end (default 30, max 3650). Ignored if start is provided.",
              schema: { type: "integer", default: 30 },
            },
          ],
          responses: {
            "200": {
              description: "Food log with meal-level macro breakdowns",
            },
          },
        },
      },
      "/api/ai/labs": {
        get: {
          operationId: "getLabResults",
          summary: "Get medical lab results",
          description: "Returns lab visit history and test results. Use ?test= to trend a specific test, ?abnormal=true for out-of-range results, ?category= to filter by panel type.",
          parameters: [
            {
              name: "test",
              in: "query",
              description: "Filter by test name (partial match, e.g. 'cholesterol', 'TSH', 'HbA1c')",
              schema: { type: "string" },
            },
            {
              name: "category",
              in: "query",
              description: "Filter by category: CBC, Metabolic, Lipid, Thyroid, Hormone, Vitamin, Urinalysis, Other",
              schema: { type: "string" },
            },
            {
              name: "since",
              in: "query",
              description: "Only return results on or after this date (YYYY-MM-DD)",
              schema: { type: "string", format: "date" },
            },
            {
              name: "abnormal",
              in: "query",
              description: "Set to true to return only out-of-range results",
              schema: { type: "boolean" },
            },
          ],
          responses: {
            "200": {
              description: "Lab visits, latest values per test, and full results list",
            },
          },
        },
      },
    },
    components: {
      schemas: {},
    },
  };

  return NextResponse.json(spec);
}
