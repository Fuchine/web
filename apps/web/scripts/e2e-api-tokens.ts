/**
 * End-to-end test for per-user API tokens (T2.11) against a live Postgres.
 * Drives the REAL libs the routes use — createApiToken / listApiTokens /
 * revokeApiToken (Settings → /api/tokens), authenticateRequest with the real
 * DB token check (POST /api/import), createImport — with an in-memory queue.
 * The session is injected (null = a request with no cookie), which is how the
 * route sees an extension call that carries only `Authorization: Bearer`.
 * The "Bearer is refused on every other route" half lives in
 * app/api/auth-coverage.test.ts (it runs every real handler).
 *
 *   DATABASE_URL=postgres://... pnpm --filter @fuchine/web exec tsx scripts/e2e-api-tokens.ts
 */
import { eq, inArray } from "drizzle-orm";
import { createDb, apiTokens, users, videos, type Database } from "@fuchine/db";
import {
  MAX_ACTIVE_TOKENS,
  createApiToken,
  hashApiToken,
  listApiTokens,
  revokeApiToken,
  verifyApiToken,
} from "../lib/api-tokens";
import { authenticateRequest, type RequestAuthDeps } from "../lib/request-auth";
import { createImport, type ImportEnqueuer } from "../lib/import";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}
const db = createDb(url) as Database;

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}`, detail !== undefined ? JSON.stringify(detail) : ""); }
}

class MemoryQueue implements ImportEnqueuer {
  jobs: { videoId: string }[] = [];
  async add(_name: string, data: { videoId: string }) { this.jobs.push(data); }
}

/** No session cookie: only the bearer token can authenticate. */
const tokenOnly: RequestAuthDeps = {
  session: async () => null,
  verifyToken: (token, scope) => verifyApiToken(db, token, scope),
};
const withSession = (userId: string): RequestAuthDeps => ({ ...tokenOnly, session: async () => ({ user: { id: userId } }) });

const importReq = (token?: string) =>
  new Request("http://fuchine.test/api/import", {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
  });

/** The route, minus Next: authenticate, then register the import. */
async function postImport(deps: RequestAuthDeps, token: string | undefined, sourceId: string, queue: MemoryQueue) {
  const who = await authenticateRequest(importReq(token), "import", deps);
  if (!who.ok) return { status: 401, who };
  const r = await createImport(db, queue, {
    url: `https://www.youtube.com/watch?v=${sourceId}`,
    title: "E2E api token",
    captions: [{ startMs: 0, endMs: 1000, text: "テスト" }],
  });
  return { status: r.status, who, body: r.body };
}

async function main() {
  console.log("\n=== E2E: API tokens (T2.11) ===\n");
  const stamp = Date.now();
  const [alice] = await db.insert(users).values({ email: `e2e-tok-a-${stamp}@example.com` }).returning();
  const [bob] = await db.insert(users).values({ email: `e2e-tok-b-${stamp}@example.com` }).returning();
  const queue = new MemoryQueue();
  // 11-char YouTube-shaped ids, unique per run.
  const sid = (n: number) => `t${String(stamp).slice(-8)}${n}`.slice(0, 11).padEnd(11, "x");
  const createdVideoIds: string[] = [];

  // --- 1. Create ---
  console.log("1. Create");
  check("blank name => 400", (await createApiToken(db, alice!.id, { name: "  " })).status === 400);
  const created = await createApiToken(db, alice!.id, { name: "Laptop Chrome" });
  check("create => 201", created.status === 201, created);
  const token = created.body.token as string;
  check("raw token returned once, fch_ format", /^fch_[0-9A-Za-z]{43}$/.test(token));
  const [row] = await db.select().from(apiTokens).where(eq(apiTokens.userId, alice!.id));
  check("only the SHA-256 hash is stored", row?.tokenHash === hashApiToken(token) && row?.tokenHash !== token);
  check("no column holds the secret", !JSON.stringify(row).includes(token.slice(12)));
  check("display prefix = first 12 chars", row?.prefix === token.slice(0, 12), row?.prefix);
  check("default scope is import", JSON.stringify(row?.scopes) === JSON.stringify(["import"]), row?.scopes);
  check("last_used_at starts null", row?.lastUsedAt === null);
  const listed = await listApiTokens(db, alice!.id);
  check("list shows it, without hash or secret",
    listed.length === 1 && !("tokenHash" in listed[0]!) && !JSON.stringify(listed).includes(token.slice(4)), listed);

  // --- 2. Import with the bearer token (no cookie) ---
  console.log("2. Import with Bearer");
  const imp = await postImport(tokenOnly, token, sid(1), queue);
  check("import with bearer => 201", imp.status === 201, imp);
  check("authenticated as alice via token", imp.who.ok && imp.who.userId === alice!.id && imp.who.via === "token", imp.who);
  if (imp.body?.videoId) createdVideoIds.push(imp.body.videoId as string);
  const again = await postImport(tokenOnly, token, sid(1), queue);
  check("re-import with bearer => 200 (shared cache)", again.status === 200, again);
  const [afterUse] = await db.select().from(apiTokens).where(eq(apiTokens.id, row!.id));
  check("last_used_at set on use", afterUse?.lastUsedAt instanceof Date, afterUse?.lastUsedAt);
  // Within the 1-minute resolution, a second use doesn't write again.
  const firstStamp = afterUse!.lastUsedAt!.getTime();
  await verifyApiToken(db, token, "import");
  const [afterSecond] = await db.select().from(apiTokens).where(eq(apiTokens.id, row!.id));
  check("last_used_at not rewritten within a minute", afterSecond!.lastUsedAt!.getTime() === firstStamp);
  // Older than a minute → bumped again.
  await db.update(apiTokens).set({ lastUsedAt: new Date(Date.now() - 5 * 60_000) }).where(eq(apiTokens.id, row!.id));
  await verifyApiToken(db, token, "import");
  const [afterStale] = await db.select().from(apiTokens).where(eq(apiTokens.id, row!.id));
  check("stale last_used_at bumped", Date.now() - afterStale!.lastUsedAt!.getTime() < 30_000);

  // --- 3. Bad tokens ---
  console.log("3. Bad tokens");
  check("no token, no session => 401", (await postImport(tokenOnly, undefined, sid(2), queue)).status === 401);
  check("cookie (session) path still works", (await postImport(withSession(alice!.id), undefined, sid(1), queue)).status === 200);
  check("malformed token => 401", (await postImport(tokenOnly, "fch_short", sid(2), queue)).status === 401);
  const unknown = `fch_${"Z".repeat(43)}`;
  check("unknown well-formed token => 401", (await postImport(tokenOnly, unknown, sid(2), queue)).status === 401);
  const tamper = token.slice(0, -1) + (token.endsWith("a") ? "b" : "a");
  check("one-char-off token => 401", (await postImport(tokenOnly, tamper, sid(2), queue)).status === 401);

  // A token without the requested scope is refused (scopes are enforced, not decorative).
  const scoped = await createApiToken(db, alice!.id, { name: "No scopes" });
  const scopedToken = scoped.body.token as string;
  await db.update(apiTokens).set({ scopes: [] }).where(eq(apiTokens.tokenHash, hashApiToken(scopedToken)));
  const sv = await verifyApiToken(db, scopedToken, "import");
  check("token lacking the scope => refused (scope)", !sv.ok && sv.reason === "scope", sv);
  check("token lacking the scope => import 401", (await postImport(tokenOnly, scopedToken, sid(2), queue)).status === 401);

  // --- 4. Isolation between users ---
  console.log("4. Isolation");
  const bobTok = await createApiToken(db, bob!.id, { name: "Bob's" });
  const bobToken = bobTok.body.token as string;
  const bobId = (bobTok.body.apiToken as { id: string }).id;
  const bobImp = await postImport(tokenOnly, bobToken, sid(3), queue);
  check("bob's token authenticates as bob, never alice", bobImp.who.ok && bobImp.who.userId === bob!.id, bobImp.who);
  if (bobImp.body?.videoId) createdVideoIds.push(bobImp.body.videoId as string);
  check("alice can't revoke bob's token (404)", (await revokeApiToken(db, alice!.id, bobId)).status === 404);
  check("alice's list doesn't show bob's token", !(await listApiTokens(db, alice!.id)).some((t) => t.id === bobId));
  check("bob's token still works after alice's attempt", (await verifyApiToken(db, bobToken, "import")).ok);
  check("a session for alice + bob's bearer => bob (the token decides)",
    (await authenticateRequest(importReq(bobToken), "import", withSession(alice!.id))).ok &&
    ((await authenticateRequest(importReq(bobToken), "import", withSession(alice!.id))) as { userId: string }).userId === bob!.id);
  check("non-uuid id => 404", (await revokeApiToken(db, alice!.id, "nope")).status === 404);

  // --- 5. Revoke ---
  console.log("5. Revoke");
  const rv = await revokeApiToken(db, alice!.id, row!.id);
  check("revoke => 200", rv.status === 200, rv);
  check("revoked token => import 401", (await postImport(tokenOnly, token, sid(4), queue)).status === 401);
  const rvv = await verifyApiToken(db, token, "import");
  check("verdict says revoked", !rvv.ok && rvv.reason === "revoked", rvv);
  check("revoked token + valid session => still 401 (no cookie fallback)",
    (await postImport(withSession(alice!.id), token, sid(4), queue)).status === 401);
  const rv2 = await revokeApiToken(db, alice!.id, row!.id);
  check("revoke is idempotent, keeps the first revoked_at",
    rv2.status === 200 && (rv2.body.apiToken as { revokedAt: string }).revokedAt === (rv.body.apiToken as { revokedAt: string }).revokedAt);
  check("revoked tokens stay listed (audit)", (await listApiTokens(db, alice!.id)).some((t) => t.id === row!.id && t.revokedAt));

  // --- 6. Cap of active tokens ---
  console.log("6. Cap");
  // alice has 1 active (the scope-less one); fill to the cap, concurrently.
  const fill = await Promise.all(
    Array.from({ length: MAX_ACTIVE_TOKENS + 2 }, (_, i) => createApiToken(db, alice!.id, { name: `T${i}` })),
  );
  const ok = fill.filter((r) => r.status === 201).length;
  check(`concurrent creates stop at ${MAX_ACTIVE_TOKENS} active`, ok === MAX_ACTIVE_TOKENS - 1, fill.map((r) => r.status));
  check("over the cap => 409", fill.some((r) => r.status === 409));
  const activeNow = (await listApiTokens(db, alice!.id)).filter((t) => !t.revokedAt).length;
  check("exactly MAX active", activeNow === MAX_ACTIVE_TOKENS, activeNow);

  // --- 7. Cascade on user delete ---
  console.log("7. Cascade");
  await db.delete(users).where(eq(users.id, alice!.id));
  check("alice's tokens removed with her account",
    (await db.select().from(apiTokens).where(eq(apiTokens.userId, alice!.id))).length === 0);
  check("bob's token untouched", (await db.select().from(apiTokens).where(eq(apiTokens.userId, bob!.id))).length === 1);
  await db.delete(users).where(eq(users.id, bob!.id));
  const bobAfter = await verifyApiToken(db, bobToken, "import");
  check("deleted user's token => unknown", !bobAfter.ok && bobAfter.reason === "unknown", bobAfter);

  // Cleanup shared rows created by the imports.
  if (createdVideoIds.length) await db.delete(videos).where(inArray(videos.id, createdVideoIds));

  console.log(`\n=== ${passed} passed, ${failed} failed ===\n`);
  await closeDb();
  process.exit(failed === 0 ? 0 : 1);
}

async function closeDb() {
  const anyDb = db as unknown as { $client?: { end?: () => Promise<void> } };
  await anyDb.$client?.end?.();
}

main().catch(async (err) => {
  console.error("E2E crashed:", err);
  await closeDb();
  process.exit(1);
});
