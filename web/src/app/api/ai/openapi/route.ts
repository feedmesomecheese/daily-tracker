import { NextResponse } from "next/server";
import { AI_PATHS } from "../_registry";

// GET /api/ai/openapi
// Returns the OpenAPI spec auto-generated from the AI path registry.
// Point your ChatGPT custom Action schema to this URL — it stays up to date
// automatically as new endpoints are added to _registry.ts.
export async function GET(req: Request) {
  const host = req.headers.get("host") || "localhost:3000";
  const protocol = host.startsWith("localhost") ? "http" : "https";
  const baseUrl = `${protocol}://${host}`;

  const paths = Object.fromEntries(
    AI_PATHS.map((def) => [
      def.path,
      {
        get: {
          operationId: def.operationId,
          summary: def.summary,
          description: def.description,
          parameters: (def.parameters ?? []).map((p) => ({
            name: p.name,
            in: p.in,
            description: p.description,
            required: p.required ?? false,
            schema: p.schema,
          })),
          responses: {
            "200": {
              description: def.responseDescription ?? "Success",
              content: {
                "application/json": {
                  // Intentionally vague — GPT reads whatever JSON the endpoint returns.
                  // This means the spec never needs updating when data shapes evolve.
                  schema: { type: "object" },
                },
              },
            },
          },
        },
      },
    ])
  );

  const spec = {
    openapi: "3.1.0",
    info: {
      title: "Daily Tracker API",
      description: "Access personal health, workout, food, labs, and reading data from Daily Tracker.",
      version: "1.0.0",
    },
    servers: [{ url: baseUrl }],
    paths,
    components: {
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer" },
      },
      schemas: {},
    },
    security: [{ bearerAuth: [] }],
  };

  return NextResponse.json(spec);
}
