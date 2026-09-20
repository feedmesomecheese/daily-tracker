# Agent access

Read and write access to Daily Tracker for AI assistants, over two transports
backed by one tool layer.

```
src/lib/agent/registry.ts          ← every tool, read and write
  ├── /api/ai/*        REST + OpenAPI  → ChatGPT Actions, curl, anything HTTP
  └── /api/mcp         MCP over HTTP   → Claude connectors, Claude Code, ChatGPT dev mode
```

Adding a tool to `registry.ts` exposes it on both surfaces at once. Neither
transport contains business logic — they translate a request into a call to
`executeTool()` and translate the result back.

## Layout

| Path | Purpose |
| --- | --- |
| `src/lib/agent/registry.ts` | The tool list. Start here. |
| `src/lib/agent/tools/*.ts` | Tool definitions: schema + handler, one file per data module. |
| `src/lib/agent/execute.ts` | Scope check → rate limit → validate → handler → audit. One path for both transports. |
| `src/lib/agent/auth.ts` | Resolves a bearer token to an owner and scopes. |
| `src/lib/agent/validate.ts` | Coerces and validates tool input against its schema. |
| `src/lib/agent/oauth.ts` | PKCE, scope parsing, redirect-URI policy. |
| `src/lib/agent/rest.ts` | REST transport. |
| `src/lib/domain/*.ts` | Write paths shared with the web UI (`saveLogEntries`, `createWorkout`). |
| `src/app/api/mcp/route.ts` | MCP transport (JSON-RPC over Streamable HTTP). |
| `src/app/api/oauth/*` | Authorization server. |
| `src/app/oauth/authorize` | Consent screen. |

## Tools

| Tool | Access | What it does |
| --- | --- | --- |
| `getDailyLog` | read | Daily metric values over a date range |
| `listMetrics` | read | Metric definitions — call before writing metrics |
| `logMetrics` | write | Record metric values for a date |
| `getWorkouts` | read | Workout history with sets and tonnage |
| `logWorkout` | write | Create a workout with exercises and sets |
| `getFoodLog` | read | Daily and per-meal macro breakdowns |
| `logFood` | write | Add items to a meal, creating day and meal as needed |
| `getBodyMeasurements` | read | Weight and body fat history |
| `logBodyMeasurement` | write | Record weight and/or body fat |
| `getBooks` | read | Reading list with year and genre stats |
| `addBook` | write | Add a book, detecting re-reads |
| `updateBook` | write | Change status, rating or notes by title |
| `getLabResults` | read | Lab panel with ranges, trend and status |
| `logLabVisit` | write | Record a lab visit and its results |

`logMetrics` and `logBodyMeasurement` overwrite the value for a given date.
Every other write appends a new record. Nothing in this layer deletes a record —
`logMetrics` can clear a single metric value for a date, and that is the extent
of it.

## Authentication

Three credentials resolve to an owner and a scope set:

1. **OAuth access token** (`dta_…`) — issued by this app's authorization server.
   Used by claude.ai and Claude Desktop, which perform OAuth with dynamic client
   registration on connect and have no static-token fallback.
2. **API key** (`dt_…`) — generated in Settings → AI Assistant, stored as a
   SHA-256 hash. Used by ChatGPT and Claude Code.
3. **`AI_API_KEY` env var** — the pre-existing single-user setup. Still works,
   deliberately read-only.

Scopes are `read` and `write`. A read tool needs `read`; everything else needs
`write`. Keys are read-only unless write is ticked at generation time, and the
OAuth consent screen asks about write access separately from connecting.

### OAuth flow

```
Claude → GET  /.well-known/oauth-protected-resource   (from the 401 challenge)
       → GET  /.well-known/oauth-authorization-server
       → POST /api/oauth/register                     (dynamic client registration)
       → GET  /oauth/authorize                        (user signs in and approves)
       → POST /api/oauth/token                        (PKCE code exchange)
```

Access tokens last 1 hour; refresh tokens last 1 year and rotate on use, so a
connection in regular use never expires. A replayed authorization code revokes
every token already issued to that client for that user. Only `S256` PKCE is accepted.

The `.well-known` paths are rewrites in `next.config.ts` — the App Router will
not serve routes from a dotted directory.

## Safety

- **Scopes** — a key pasted into a custom GPT need not be able to write.
- **Bounded writes** — per-call caps (100 metric entries, 40 exercises, 60 food
  items, 120 lab results) so one call cannot rewrite a year of history.
- **Rate limits** — 120 calls/minute, of which 30 may be writes, per user.
- **Audit log** — every call lands in `agent_audit_log` with its tool, input,
  status and transport. Surfaced in Settings → AI Assistant, writes highlighted.
- **No deletes** — the surface has no tool that removes a record.
- **Calculated metrics refuse writes** — they are derived from formulas, so a
  direct write would be overwritten by the next recalculation.

Everything runs through the service-role Supabase client, which bypasses RLS.
Every query in this layer must therefore filter on `ctx.ownerId`; that is the
only thing keeping one user's agent out of another user's data.

## Setup

1. Run `../supabase/migrations/20260914_agent_access.sql`.
2. Confirm `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set.
   No new environment variables are needed.
3. Generate a key at Settings → AI Assistant, or connect Claude and approve.

The migration drops the one-key-per-user constraint, adds `name`, `scopes` and
`revoked_at` to `user_ai_keys`, and creates `oauth_clients`, `oauth_auth_codes`,
`oauth_tokens` and `agent_audit_log`. Existing keys keep working and default to
read-only, so a deploy cannot silently hand an existing assistant write access.

## Tests

```bash
npm run test:agent
```

Covers input coercion, PKCE against the RFC 7636 vector, redirect-URI policy and
registry integrity — the pure logic where a mistake would be hardest to spot in
production. Tool handlers need a database and are not covered.

## Adding a tool

Add an `AgentTool` to the relevant file in `src/lib/agent/tools/`, export it in
that file's array, and — if it needs a new REST path — add a route shim:

```ts
import { agentPOST, handleAgentOptions } from "@/lib/agent/rest";

export async function OPTIONS() { return handleAgentOptions(); }
export const POST = agentPOST("/api/ai/your-path");
```

The OpenAPI document and the MCP tool list both pick it up with no further work.
Write the schema descriptions for a model that has never seen the app — they are
the entire interface.
