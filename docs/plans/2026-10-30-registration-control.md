# Registration Control (T2.3) — Implementation Plan

> Steps use checkbox (`- [ ]`) syntax for tracking. One task ≈ one commit.

**Goal:** Only people the operator named can create an account; production
defaults to invite-only.

**Architecture:** A pure policy (`decideRegistration`) decides; `callbacks.signIn`
gathers its inputs (mode, e-mail, verified flag, existing user, active invite,
env allowlists) and denies before any account exists; a wrapped
`adapter.createUser` consumes the invite and creates the user in one transaction.
Invites are e-mail-bound rows managed by a worker CLI.

**Tech stack:** Next.js 15 App Router, Auth.js 5 (`@auth/core` 0.41.3), Drizzle +
Postgres, vitest, tsx E2E scripts.

**Spec:** `docs/plans/2026-10-30-registration-control-spec.md`

---

## File structure

| File | Responsibility |
|---|---|
| `apps/web/lib/registration.ts` (new) | Pure: env parsing, e-mail normalization, `decideRegistration`. |
| `apps/web/lib/registration.test.ts` (new) | Decision table + normalization tests. |
| `packages/db/src/schema.ts` (modify) | `invites` table + relation + types. |
| `packages/db/drizzle/0016_*.sql` (generated) | Migration. |
| `packages/db/src/invites.ts` (new) | `findActiveInvite`, `consumeInvite(tx)`, `addInvite`, `listInvites`, `revokeInvite`. Exported from `@fuchine/db` so web and worker share it. |
| `apps/web/lib/auth-registration.ts` (new) | `registrationSignIn(db, params)` callback body + `withInviteCreateUser(adapter, db)` wrapper. Testable without NextAuth. |
| `apps/web/auth.ts` (modify) | Wire callback, wrapped adapter, `pages.error`; drop `events.createUser`. |
| `apps/web/app/login/page.tsx` → server wrapper + `login-view.tsx` (client) | Denial message, invite-only note. |
| `apps/worker/src/scripts/invite.ts` (new) + `package.json` script `invite` | Operator CLI. |
| `apps/web/instrumentation.ts` (modify) | Boot checks. |
| `apps/web/scripts/e2e-registration.ts` (new) | Real-Postgres E2E. |
| `.env.example`, `README.md`, `docs/DEPLOY_CHECKLIST.md`, `CLAUDE.md`, `docs/ROADMAP_ENGENHARIA.md` | Docs. |

---

## Task 1: Pure policy (TDD)

**Files:** `apps/web/lib/registration.ts`, `apps/web/lib/registration.test.ts`

- [ ] **Step 1: write the failing tests** for:
  - `normalizeEmail`: trims, lowercases, NFKC (`a＠b.com` → `a@b.com`), returns `null` for no `@` or more than one.
  - `parseRegistrationEnv(env, nodeEnv)`: unset → `open` in dev, `invite` in production; invalid value → `{ ok: false }`; lists split on commas, trimmed, lowercased, empties dropped; domains stripped of a leading `@`.
  - `decideRegistration(input)` with input
    `{ mode, email, emailVerified, isExistingUser, hasActiveInvite, allowEmails, allowDomains }`
    returning `{ allow: true, via: "open"|"existing"|"env-email"|"env-domain"|"invite" }`
    or `{ allow: false, reason: "closed"|"not-invited"|"unverified"|"bad-email" }`.
    Table to cover (each a test row):

    | mode | existing | env email | env domain | invite | verified | expected |
    |---|---|---|---|---|---|---|
    | open | – | – | – | – | any | allow open |
    | invite | yes | – | – | – | any | allow existing |
    | invite | no | yes | – | – | true | allow env-email |
    | invite | no | – | yes | – | true | allow env-domain |
    | invite | no | – | yes | – | false | deny unverified |
    | invite | no | – | – | yes | true | allow invite |
    | invite | no | – | – | yes | false | deny unverified |
    | invite | no | – | – | – | true | deny not-invited |
    | closed | yes | – | – | – | any | allow existing |
    | closed | no | yes | – | – | true | allow env-email |
    | closed | no | – | – | yes | true | deny closed |
    | any | – | – | – | – | – | `email` null → deny bad-email |

    Plus domain matching: `example.com` allows `a@example.com`, denies `a@sub.example.com` and `a@evilexample.com`.
    Existing users pass even when unverified (they proved ownership when the account was created).
- [ ] **Step 2:** run `pnpm --filter @fuchine/web test registration` → fails.
- [ ] **Step 3: implement** the three functions; no imports beyond types.
- [ ] **Step 4:** tests pass. Commit `feat(auth): registration policy (pure)`.

## Task 2: `invites` table and data layer

**Files:** `packages/db/src/schema.ts`, `packages/db/src/invites.ts`, `packages/db/src/index.ts`, generated migration.

- [ ] **Step 1:** add the table per the spec (columns, FK `used_by` → `users.id` on delete set null, partial unique index `invites_active_email_uq on (email) where used_at is null`). Export `Invite` type.
- [ ] **Step 2:** `pnpm db:generate` → expect `0016_*.sql` with the CREATE TABLE, the FK and the partial index; read it and confirm nothing else changed.
- [ ] **Step 3:** `invites.ts`:
  - `findActiveInvite(db, email)` → row or null (`used_at is null and expires_at > now()`).
  - `consumeInvite(tx, email, userId)` → `UPDATE … SET used_at = now(), used_by = $userId WHERE email = $email AND used_at IS NULL AND expires_at > now() RETURNING id`; returns boolean.
  - `addInvite(db, { email, days, note, createdBy })` → upsert on the partial index: refresh `expires_at`/`note` if an active one exists. Drizzle `onConflictDoUpdate` with `targetWhere: sql\`used_at is null\``.
  - `listInvites(db, { all })`, `revokeInvite(db, email)` (deletes the unused one, returns count).
- [ ] **Step 4:** `pnpm typecheck`. Commit `feat(db): invites table`.

## Task 3: Auth glue (testable)

**Files:** `apps/web/lib/auth-registration.ts`

- [ ] **Step 1:** `registrationSignIn(db, { user, account, profile, email }, opts)`:
  - `addr = normalizeEmail(user.email)`.
  - `isExistingUser`: `select id from users where email = addr` (do **not** trust `user.id`; for e-mail sign-in Auth.js passes a random uuid for unknown users).
  - `emailVerified`: `account?.provider === "google" ? profile?.email_verified === true : true`.
  - `hasActiveInvite`: `!!(await findActiveInvite(db, addr))`, only queried when needed.
  - Call `decideRegistration`. On allow → `true`.
  - On deny: log `[auth] registration denied: <reason> <sha256(addr).slice(0,12)>`; if `email?.verificationRequest` → return `opts.verifyRequestUrl` (the same URL Auth.js would redirect to: `${AUTH_URL}/api/auth/verify-request?provider=nodemailer&type=email`); else → `false`.
- [ ] **Step 2:** `withInviteCreateUser(adapter, db, getPolicyEnv)` returns `{ ...adapter, createUser }` where `createUser(data)` runs `db.transaction`:
  1. recompute the decision with `isExistingUser = false`; if it allows only `via: "invite"`, `consumeInvite(tx, addr, newId)` must return true or throw `new Error("invite no longer valid")`;
  2. insert into `users` (id `crypto.randomUUID()`, email `addr`, name, image, emailVerified) returning the row;
  3. `ensureUserSettings(tx, id)` (widen its type to `DbOrTx`);
  4. return the row in the `AdapterUser` shape the Drizzle adapter returns.
  Any other `via` skips step 1. Throwing aborts sign-in with Auth.js' error page → our `/login?error=…`.
- [ ] **Step 3:** typecheck. Commit `feat(auth): registration callback and invite-consuming createUser`.

## Task 4: Wire `auth.ts`

- [ ] `const policyEnv = () => parseRegistrationEnv(process.env, process.env.NODE_ENV)` (evaluated per request, so a restart is not needed in dev).
- [ ] `adapter: withInviteCreateUser(DrizzleAdapter(db, {...}), db, policyEnv)`.
- [ ] `callbacks: { signIn: (p) => registrationSignIn(db, p, { env: policyEnv(), verifyRequestUrl }) }`.
- [ ] `pages: { error: "/login" }`.
- [ ] Remove `events.createUser` (provisioning moved into `createUser`).
- [ ] Manual check in dev with the console magic link: `REGISTRATION=invite`, unknown e-mail → "check your e-mail" screen, **no** link printed in the terminal; `AUTH_ALLOWED_EMAILS=<you>` → link printed, sign-in works, `user_settings` row exists.
- [ ] Commit `feat(auth): enforce registration mode`.

## Task 5: Login UI

**Files:** `apps/web/app/login/page.tsx` (server), `apps/web/app/login/login-view.tsx` (client, current content).

- [ ] `page.tsx` reads `searchParams.error` and `parseRegistrationEnv(...).mode`; renders `<LoginView error={...} inviteOnly={mode !== "open"} />`.
- [ ] Map `error === "AccessDenied"` to the fixed message from the spec; any other `error` → "Sign-in failed. Please try again."
- [ ] `inviteOnly` → one-line note under the form (pass through a new optional `footnote` prop on `Login` in `@fuchine/ui`, with a Storybook story).
- [ ] Commit `feat(web): invite-only login states`.

## Task 6: Operator CLI

**Files:** `apps/worker/src/scripts/invite.ts`, `apps/worker/package.json` (`"invite": "tsx src/scripts/invite.ts"`).

- [ ] Parse `add <email> [--days N] [--note s]`, `list [--all]`, `revoke <email>` with `node:util` `parseArgs`; normalize with the same `normalizeEmail` (move it to `@fuchine/db` `invites.ts` if importing from `apps/web` is awkward — the worker must not depend on the web app).
- [ ] Output: one line per invite `email · expires 2026-11-13 · active|used by <id>|expired`.
- [ ] Exit codes: 0 ok, 1 usage error, 2 not found (revoke).
- [ ] Commit `feat(worker): invite CLI`.

## Task 7: Boot checks

- [ ] In `instrumentation.ts` production block: invalid mode → push to `missing` (exits); empty allowlists with mode ≠ `open` → `console.warn` per spec; mode `open` → `console.warn` about house-key spend.
- [ ] Commit `feat(web): registration boot checks`.

## Task 8: E2E

**File:** `apps/web/scripts/e2e-registration.ts` (pattern of `e2e-account.ts`; auto-discovered).

- [ ] Fixtures: clean `users`/`invites` rows for `e2e-reg-*@example.test`.
- [ ] Cases (each a `check`):
  1. `invite` mode, unknown e-mail, Google verified → `registrationSignIn` returns `false`; `users` count unchanged.
  2. Same, e-mail flow with `verificationRequest` → returns the verify-request URL.
  3. `addInvite` → `registrationSignIn` true → wrapped `createUser` creates user + `user_settings`, invite `used_at` set and `used_by` = user.
  4. Second `createUser` for another session of the same invite → throws; still one user.
  5. Two concurrent `createUser` with one invite (`Promise.allSettled`) → exactly one fulfilled.
  6. Expired invite (`expires_at` in the past) → deny. Revoked → deny.
  7. `closed` mode: existing user → allow; invited new e-mail → deny.
  8. `AUTH_ALLOWED_DOMAINS=example.test`, Google unverified → deny; verified → allow.
- [ ] `pnpm --filter @fuchine/web e2e` green locally. Commit `test(e2e): registration control`.

## Task 9: Docs and roadmap

- [ ] `.env.example`: `REGISTRATION`, `AUTH_ALLOWED_EMAILS`, `AUTH_ALLOWED_DOMAINS` with comments (production default `invite`).
- [ ] README "Production": add the allowlist to the minimum `.env` and the `invite add` command.
- [ ] `DEPLOY_CHECKLIST.md` §2/§3: set `REGISTRATION` and allowlist; §6 smoke test: a non-invited Google account is refused.
- [ ] `CLAUDE.md` "Estado atual": one sentence on registration modes and the CLI.
- [ ] `ROADMAP_ENGENHARIA.md`: mark T2.3 ✅ with the commit range.
- [ ] Commit `docs: registration control`.

## Verification before push

```
pnpm typecheck
pnpm test
pnpm --filter @fuchine/web e2e
pnpm build
```

Re-read the diff for: the e-mail ever logged in clear (must not be), `events.createUser` left behind (double provisioning), `REGISTRATION` read once at import time (must be per request), and the migration touching anything besides `invites`.
