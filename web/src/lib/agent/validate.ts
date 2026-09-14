import { AgentInputError, type JsonSchema, type JsonSchemaProp } from "./types";

/**
 * Coerce and validate tool input against the tool's schema.
 *
 * REST GET params arrive as strings, REST POST bodies and MCP arguments arrive
 * already typed. Coercing both through the same function means a tool handler
 * sees identical input no matter which transport delivered it.
 */
export function coerceInput(
  schema: JsonSchema,
  raw: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = {};

  for (const [key, prop] of Object.entries(schema.properties)) {
    const value = raw[key];

    if (value === undefined || value === null || value === "") {
      if (prop.default !== undefined) out[key] = prop.default;
      continue;
    }

    out[key] = coerceValue(key, prop, value);
  }

  for (const key of schema.required ?? []) {
    if (out[key] === undefined) {
      throw new AgentInputError(`Missing required field: ${key}`);
    }
  }

  // Surface typos rather than silently dropping them — an agent that sends
  // "calories_total" instead of "calories" should be told, not ignored.
  if (schema.additionalProperties === false) {
    const unknown = Object.keys(raw).filter((k) => !(k in schema.properties));
    if (unknown.length > 0) {
      throw new AgentInputError(
        `Unknown field(s): ${unknown.join(", ")}. Allowed: ${Object.keys(schema.properties).join(", ")}`
      );
    }
  }

  return out;
}

function coerceValue(path: string, prop: JsonSchemaProp, value: unknown): unknown {
  switch (prop.type) {
    case "string": {
      const s = typeof value === "string" ? value : String(value);
      if (prop.enum && !prop.enum.includes(s)) {
        throw new AgentInputError(
          `${path} must be one of: ${prop.enum.join(", ")} (got "${s}")`
        );
      }
      if (prop.format === "date" && !/^\d{4}-\d{2}-\d{2}$/.test(s)) {
        throw new AgentInputError(`${path} must be a date in YYYY-MM-DD format (got "${s}")`);
      }
      return s;
    }

    case "number":
    case "integer": {
      const n = typeof value === "number" ? value : Number(value);
      if (!Number.isFinite(n)) {
        throw new AgentInputError(`${path} must be a number (got "${String(value)}")`);
      }
      if (prop.type === "integer" && !Number.isInteger(n)) {
        throw new AgentInputError(`${path} must be a whole number (got ${n})`);
      }
      if (prop.minimum !== undefined && n < prop.minimum) {
        throw new AgentInputError(`${path} must be at least ${prop.minimum} (got ${n})`);
      }
      if (prop.maximum !== undefined && n > prop.maximum) {
        throw new AgentInputError(`${path} must be at most ${prop.maximum} (got ${n})`);
      }
      return n;
    }

    case "boolean": {
      if (typeof value === "boolean") return value;
      const s = String(value).toLowerCase();
      if (s === "true" || s === "1") return true;
      if (s === "false" || s === "0") return false;
      throw new AgentInputError(`${path} must be true or false (got "${String(value)}")`);
    }

    case "array": {
      let arr: unknown[];
      if (Array.isArray(value)) {
        arr = value;
      } else if (typeof value === "string") {
        // A GET query param carrying a list arrives comma-separated.
        arr = value.split(",").map((s) => s.trim()).filter(Boolean);
      } else {
        throw new AgentInputError(`${path} must be an array`);
      }

      const items = prop.items;
      if (!items) return arr;

      return arr.map((item, i) => {
        const itemPath = `${path}[${i}]`;
        if (isObjectSchema(items)) {
          if (typeof item !== "object" || item === null || Array.isArray(item)) {
            throw new AgentInputError(`${itemPath} must be an object`);
          }
          return coerceInput(items, item as Record<string, unknown>);
        }
        return coerceValue(itemPath, items, item);
      });
    }

    case "object": {
      if (typeof value !== "object" || value === null || Array.isArray(value)) {
        throw new AgentInputError(`${path} must be an object`);
      }
      if (!prop.properties) return value;
      return coerceInput(
        {
          type: "object",
          properties: prop.properties,
          required: prop.required,
        },
        value as Record<string, unknown>
      );
    }

    default:
      return value;
  }
}

function isObjectSchema(s: JsonSchemaProp | JsonSchema): s is JsonSchema {
  return s.type === "object" && "properties" in s && s.properties !== undefined;
}
