import { NextResponse } from "next/server";
import { AGENT_TOOLS } from "@/lib/agent/registry";
import { baseUrlFrom } from "@/lib/agent/auth";
import { AGENT_CORS_HEADERS, handleAgentOptions } from "@/lib/agent/rest";
import type { AgentTool, JsonSchemaProp } from "@/lib/agent/types";

export async function OPTIONS() { return handleAgentOptions(); }

/**
 * GET /api/ai/openapi
 *
 * OpenAPI document generated from the shared tool registry. Point a ChatGPT
 * custom Action at this URL — it stays current as tools are added, because the
 * same registry backs the MCP server at /api/mcp.
 */

/** Our JsonSchemaProp is already valid JSON Schema; this just drops undefined. */
function toSchema(prop: JsonSchemaProp): Record<string, unknown> {
  const out: Record<string, unknown> = { type: prop.type, description: prop.description };
  if (prop.format) out.format = prop.format;
  if (prop.enum) out.enum = prop.enum;
  if (prop.default !== undefined) out.default = prop.default;
  if (prop.minimum !== undefined) out.minimum = prop.minimum;
  if (prop.maximum !== undefined) out.maximum = prop.maximum;
  if (prop.items) out.items = toSchema(prop.items as JsonSchemaProp);
  if (prop.properties) {
    out.properties = Object.fromEntries(
      Object.entries(prop.properties).map(([k, v]) => [k, toSchema(v)])
    );
    if (prop.required) out.required = prop.required;
  }
  return out;
}

function operationFor(tool: AgentTool): Record<string, unknown> {
  const op: Record<string, unknown> = {
    operationId: tool.name,
    summary: tool.summary,
    description: tool.description,
    responses: {
      [tool.method === "POST" ? "201" : "200"]: {
        description: tool.responseDescription ?? "Success",
        content: {
          "application/json": {
            schema: { type: "object", properties: {}, additionalProperties: true },
          },
        },
      },
      "400": { description: "Invalid input — the message says what to fix" },
      "401": { description: "Missing or invalid credentials" },
      "403": { description: "The key lacks the scope this operation needs" },
      "429": { description: "Rate limited — retry after the interval given" },
    },
  };

  if (tool.method === "GET") {
    op.parameters = Object.entries(tool.inputSchema.properties).map(([name, prop]) => ({
      name,
      in: "query",
      description: prop.description,
      required: tool.inputSchema.required?.includes(name) ?? false,
      schema: toSchema(prop),
    }));
  } else {
    op.requestBody = {
      required: true,
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: Object.fromEntries(
              Object.entries(tool.inputSchema.properties).map(([k, v]) => [k, toSchema(v)])
            ),
            ...(tool.inputSchema.required ? { required: tool.inputSchema.required } : {}),
          },
        },
      },
    };
    // Writes go through without a per-call confirmation prompt in ChatGPT.
    // Flip this to true to make ChatGPT ask before every write.
    op["x-openai-isConsequential"] = false;
  }

  return op;
}

export async function GET(req: Request) {
  const baseUrl = baseUrlFrom(req);

  const paths: Record<string, Record<string, unknown>> = {};
  for (const tool of AGENT_TOOLS) {
    if (!paths[tool.path]) paths[tool.path] = {};
    paths[tool.path][tool.method.toLowerCase()] = operationFor(tool);
  }

  const spec = {
    openapi: "3.1.0",
    info: {
      title: "Daily Tracker API",
      description:
        "Read and write personal health, workout, food, labs, and reading data in Daily Tracker. Reads need a key with the read scope; writes need a key with the write scope.",
      version: "2.0.0",
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

  return NextResponse.json(spec, { headers: AGENT_CORS_HEADERS });
}
