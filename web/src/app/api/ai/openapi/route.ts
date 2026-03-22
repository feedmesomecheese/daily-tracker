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
              name: "days",
              in: "query",
              description: "Number of days to return (default 30, max 365)",
              schema: { type: "integer", default: 30 },
            },
            {
              name: "end",
              in: "query",
              description: "End date in YYYY-MM-DD format (default: today)",
              schema: { type: "string", format: "date" },
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
            "Returns workouts with type, duration, rating, notes, and list of exercises performed.",
          parameters: [
            {
              name: "days",
              in: "query",
              description: "Number of days to look back (default 60, max 365)",
              schema: { type: "integer", default: 60 },
            },
            {
              name: "end",
              in: "query",
              description: "End date in YYYY-MM-DD format (default: today)",
              schema: { type: "string", format: "date" },
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
          summary: "Get reading list",
          description:
            "Returns books with status, ratings, dates, and notes. Filter by status to see completed, currently reading, or to-read books.",
          parameters: [
            {
              name: "status",
              in: "query",
              description: "Filter by status: to_read, reading, completed, dnf",
              schema: {
                type: "string",
                enum: ["to_read", "reading", "completed", "dnf"],
              },
            },
          ],
          responses: {
            "200": {
              description: "Book list",
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
                            status: { type: "string" },
                            rating: { type: "number" },
                            notes: { type: "string" },
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
    },
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
        },
      },
    },
    security: [{ bearerAuth: [] }],
  };

  return NextResponse.json(spec);
}
