import type { SupabaseClient } from "@supabase/supabase-js";

export type Scope = "read" | "write";

/**
 * Who is calling, resolved from either an API key or an OAuth access token.
 * Every tool handler runs against exactly one owner.
 */
export type AgentContext = {
  supabase: SupabaseClient;
  ownerId: string;
  scopes: Scope[];
  authMethod: "api_key" | "oauth";
  /** user_ai_keys.id or oauth_tokens.id — recorded in the audit log. */
  keyId: string | null;
};

/**
 * A minimal JSON Schema subset. It is the single source of truth for a tool's
 * input: the OpenAPI spec, the MCP tool listing, and runtime validation are all
 * generated from the same object, so the two transports can never drift.
 */
export type JsonSchema = {
  type: "object";
  properties: Record<string, JsonSchemaProp>;
  required?: string[];
  additionalProperties?: boolean;
};

export type JsonSchemaProp = {
  type: "string" | "number" | "integer" | "boolean" | "array" | "object";
  description: string;
  format?: string;
  enum?: string[];
  default?: unknown;
  items?: JsonSchemaProp | JsonSchema;
  properties?: Record<string, JsonSchemaProp>;
  required?: string[];
  minimum?: number;
  maximum?: number;
};

export type AgentTool = {
  /** operationId for OpenAPI, tool name for MCP. */
  name: string;
  /** REST path, e.g. "/api/ai/log". */
  path: string;
  method: "GET" | "POST";
  /**
   * Read tools are annotated readOnlyHint in MCP and need only the "read"
   * scope. Everything else requires "write".
   */
  readOnly: boolean;
  summary: string;
  description: string;
  inputSchema: JsonSchema;
  responseDescription?: string;
  handler: (ctx: AgentContext, input: Record<string, unknown>) => Promise<unknown>;
};

/** Thrown by tool handlers for input the caller could fix. Maps to HTTP 400. */
export class AgentInputError extends Error {
  readonly status = 400;
  constructor(message: string) {
    super(message);
    this.name = "AgentInputError";
  }
}

/** Thrown when the underlying data store fails. Maps to HTTP 500. */
export class AgentDataError extends Error {
  readonly status = 500;
  constructor(message: string) {
    super(message);
    this.name = "AgentDataError";
  }
}
