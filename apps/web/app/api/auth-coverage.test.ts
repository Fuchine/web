// Auth coverage guard (T2.6): every API route handler must answer 401 when there
// is no session. This globs app/api/**/route.ts, so a NEW route that forgets
// `auth()` fails CI without anyone remembering to write a test for it.
//
// The session is mocked away (`auth()` → null) and the database is replaced by
// a proxy that throws on any use: a handler must reject before touching data.
// Public routes are an explicit, reviewed allowlist.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect, vi } from "vitest";

vi.mock("@/auth", () => ({
  auth: vi.fn(async () => null),
  handlers: { GET: vi.fn(), POST: vi.fn() },
  signIn: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: new Proxy(
    {},
    {
      get(_t, prop) {
        throw new Error(`db.${String(prop)} used before the auth check`);
      },
    },
  ),
}));

/** Routes that are intentionally reachable without a session. Keep this short. */
const PUBLIC_ROUTES = new Set([
  "/api/health", // liveness probe for the orchestrator / external monitor
  "/api/auth/[...nextauth]", // Auth.js itself (sign-in, callbacks, CSRF)
]);

/**
 * Routes that also accept a per-user API token (T2.11, `authenticateRequest`).
 * Every other route must ignore `Authorization: Bearer` and stay session-only.
 */
const TOKEN_ROUTES = new Set(["/api/import"]);

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
// Well-formed but unknown: a route that consults the token would hit the
// throwing db proxy; a session-only route must answer 401 without looking.
const BEARER = `Bearer fch_${"A".repeat(43)}`;
const API_DIR = fileURLToPath(new URL(".", import.meta.url));
const ID = "00000000-0000-4000-8000-000000000000";

function findRoutes(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return findRoutes(p);
    return name === "route.ts" ? [p] : [];
  });
}

function routePath(file: string): string {
  const rel = relative(API_DIR, file).split(sep).slice(0, -1).join("/");
  return `/api/${rel}`;
}

const routes = findRoutes(API_DIR).map((file) => ({ file, path: routePath(file) }));
const guarded = routes.filter((r) => !PUBLIC_ROUTES.has(r.path));

describe("API auth coverage", () => {
  it("finds the route tree, and every allowlisted public route still exists", () => {
    expect(guarded.length).toBeGreaterThan(20);
    for (const p of PUBLIC_ROUTES) expect(routes.map((r) => r.path)).toContain(p);
    for (const p of TOKEN_ROUTES) expect(routes.map((r) => r.path)).toContain(p);
  });

  it("only the TOKEN_ROUTES allowlist uses token authentication", () => {
    const usesTokens = routes
      .filter((r) => /authenticateRequest|verifyApiToken/.test(readFileSync(r.file, "utf8")))
      .map((r) => r.path)
      .sort();
    expect(usesTokens).toEqual([...TOKEN_ROUTES].sort());
  });

  async function call(file: string, path: string, headers: Record<string, string> = {}) {
    const mod = (await import(/* @vite-ignore */ file)) as Record<string, unknown>;
    const handlers = METHODS.filter((m) => typeof mod[m] === "function");
    expect(handlers.length, `${path} exports no HTTP handler`).toBeGreaterThan(0);
    const statuses: [string, number][] = [];
    for (const method of handlers) {
      const url = `http://fuchine.test${path.replace(/\[[^\]]+\]/g, ID)}?id=${ID}&q=x&videoId=${ID}`;
      const req = new Request(url, {
        method,
        headers: { "content-type": "application/json", ...headers },
        body: method === "GET" ? undefined : JSON.stringify({}),
      });
      const ctx = { params: Promise.resolve({ id: ID, cardId: ID }) };
      const handler = mod[method] as (r: Request, c: typeof ctx) => Promise<Response>;
      statuses.push([`${method} ${path}`, (await handler(req, ctx)).status]);
    }
    return statuses;
  }

  describe.each(guarded)("$path", ({ file, path }) => {
    it("answers 401 on every method without a session", async () => {
      for (const [label, status] of await call(file, path)) expect(status, label).toBe(401);
    });

    it.skipIf(TOKEN_ROUTES.has(path))("rejects a Bearer API token (session-only route)", async () => {
      for (const [label, status] of await call(file, path, { authorization: BEARER })) {
        expect(status, label).toBe(401);
      }
    });
  });
});
