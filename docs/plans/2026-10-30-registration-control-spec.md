# Registration control (T2.3)

**Date:** 2026-10-30
**Roadmap:** T2.3 in `docs/ROADMAP_ENGENHARIA.md` (Fase 2, Bloco B — bloqueia qualquer IP público)
**Closes:** A1 in `backlog/ANALISE-SEGURANCA-LANCAMENTO-2026-10-29.md`; prerequisite for A2 (T2.4)
**Status:** Design ready for review
**Plan:** `docs/plans/2026-10-30-registration-control.md`

## Goal

An operator decides **who can create an account** on their instance. Today any
Google account (or any e-mail, when SMTP is on) becomes a user on first sign-in,
and every new user immediately spends the operator's house LLM key. After this
change a fresh production instance accepts only the people the operator named,
and an instance with registration closed accepts only its existing users.

## Non-goals

- Shareable invite **codes/links** (anyone holding the link can join). Invites in
  this version are bound to an e-mail. Codes can come later on top of the same
  table.
- An admin UI. Invites are managed by a CLI script now; the `/admin` screen is
  T2.13.
- Spend limits (T2.4), blocking or deleting users (T2.13), account linking
  between Google and e-mail for the same address (unchanged Auth.js behavior).

## Modes

`REGISTRATION=open | invite | closed`, read at request time.

| Mode | Who can sign in | Who can create a new account |
|---|---|---|
| `open` | everyone | everyone (today's behavior) |
| `invite` | existing users | `AUTH_ALLOWED_EMAILS`, `AUTH_ALLOWED_DOMAINS`, or an active invite for that e-mail |
| `closed` | existing users | `AUTH_ALLOWED_EMAILS` / `AUTH_ALLOWED_DOMAINS` only |

- **Default:** `open` in development, **`invite` in production** when the
  variable is unset. A production instance never ends up open by omission.
- `AUTH_ALLOWED_EMAILS`: comma-separated exact addresses. `AUTH_ALLOWED_DOMAINS`:
  comma-separated domains (`example.com` matches `a@example.com`, not
  `a@sub.example.com`). The env allowlist is the operator's own list and applies
  in every mode, so the first operator account never needs an invite.
- **Existing users always pass**, in every mode. Closing registration never locks
  out people who already have an account.
- An unknown value of `REGISTRATION` fails the production boot (same fail-fast as
  missing secrets).

## Identity rules

- E-mails are compared after `trim().toLowerCase()` and NFKC normalization (the
  same normalizer Auth.js applies to the magic-link identifier).
- **Google:** the domain allowlist and invites only count when the profile says
  `email_verified === true`. An unverified Google e-mail is treated as not
  allowlisted.
- **Magic link:** proving the e-mail is the login itself, so no extra check.

## Invites

New table `invites` (migration `0016`):

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `email` | text not null | normalized |
| `created_at` | timestamptz not null default now() | |
| `expires_at` | timestamptz not null | default 14 days from creation (CLI flag) |
| `used_at` | timestamptz null | set when consumed |
| `used_by` | uuid null → `users.id` on delete set null | |
| `created_by` | text not null | `"cli"` now; admin e-mail from T2.13 |
| `note` | text null | free text for the operator |

Index: unique partial on `(email) where used_at is null` — at most one active
invite per address. An invite is **active** when `used_at is null and expires_at > now()`.

Lifecycle: created by the CLI → checked in the `signIn` callback (not consumed)
→ **consumed atomically inside account creation** (see below) → kept as history.
Revoking deletes an unused invite. Deleting a user leaves the invite row with
`used_by = null`.

## Where the decision runs

Auth.js 5 (`@auth/core` 0.41.3) gives two hook points, both verified in the
installed source:

1. **`callbacks.signIn`** runs before any account is created, for OAuth at the
   callback and for e-mail at the *send* step (`email.verificationRequest === true`,
   `lib/actions/signin/send-token.js`) and again at the link callback. Returning
   `false` raises `AccessDenied`; returning a URL string redirects **without
   sending the e-mail**.
2. **`adapter.createUser`** runs only for a brand-new user. We wrap the Drizzle
   adapter's `createUser` so that, in one transaction, it re-checks the policy,
   consumes the invite (`UPDATE invites SET used_at = now(), used_by = $id WHERE
   email = $e AND used_at IS NULL AND expires_at > now() RETURNING id`), inserts
   the user and provisions `user_settings`. If the invite was consumed by a
   concurrent sign-up in between, the transaction throws and no user is
   created. This replaces the current `events.createUser` hook.

The policy itself is a **pure function** `decideRegistration(input) → { allow, reason }`
in `apps/web/lib/registration.ts`, fed by the callback with: mode, normalized
e-mail, `emailVerified`, `isExistingUser`, `hasActiveInvite`, allowlists. All
branching lives there and is unit-tested; `auth.ts` only gathers inputs.

## Denial without enumeration

A denied person must not learn whether an address has an account or an invite.

- **Magic link:** on deny, `signIn` returns the same `verify-request` URL a
  successful request would get. The screen says "check your e-mail"; no e-mail is
  sent. The existing per-e-mail/IP rate limit is unaffected (it runs inside the
  send, which is skipped).
- **Google:** the redirect is unavoidably different (the person is not signed in).
  `pages.error` points to `/login`, which shows one fixed message for
  `?error=AccessDenied`: *"This Fuchine instance is invite-only. Ask its operator
  for an invite."* The same text is used for every denial reason.
- The deny reason is logged server-side (`[auth] registration denied: <reason>`)
  with a hash of the e-mail, never the address itself.

## UI

- `/login` reads `?error=AccessDenied` and passes the message to the existing
  `error` prop of `Login`.
- When the mode is not `open`, `/login` shows a one-line note under the form:
  *"Invite-only instance. Existing members can sign in."* The mode is not a
  secret; the page becomes a server component wrapper that passes it down.
- No other screen changes.

## Operator tooling

`pnpm --filter @fuchine/worker invite <command>` (worker already has the DB
wiring and runs in the compose image):

```
invite add <email> [--days 14] [--note "..."]   # creates or refreshes the active invite
invite list [--all]                              # active by default; --all includes used/expired
invite revoke <email>                            # deletes the active invite
```

In compose: `docker compose run --rm worker pnpm --filter @fuchine/worker invite add friend@example.com`.

## Boot checks (`instrumentation.ts`, production only)

- Invalid `REGISTRATION` → exit 1 with the allowed values.
- Mode `invite`/`closed` with empty `AUTH_ALLOWED_EMAILS` and
  `AUTH_ALLOWED_DOMAINS` → loud warning: *"no one can create the first account;
  set AUTH_ALLOWED_EMAILS or run `invite add`"*. Warning, not exit: an instance
  that already has users is valid.
- Mode `open` → warning that any Google account can sign up and spend the house
  key.

## Testing

- **Unit** (`apps/web/lib/registration.test.ts`): the full decision table — 3
  modes × existing/new × env e-mail/domain/invite/none × Google verified/unverified,
  plus normalization (case, whitespace, fullwidth `＠`) and domain matching
  (exact domain only).
- **E2E** (`apps/web/scripts/e2e-registration.ts`, auto-discovered by
  `e2e-all.ts`, real Postgres): invite add → `signIn` callback allows → wrapped
  `createUser` consumes it → second `createUser` for the same e-mail fails; expired
  invite denied; revoked invite denied; existing user allowed under `closed`; a
  denied e-mail creates no `users` row; magic-link deny returns the
  `verify-request` URL and calls no `sendVerificationRequest`.

## Done when (roadmap T2.3, expanded)

- [ ] E-mail outside the lists gets the fixed denial and **no row in `users`**.
- [ ] An invite is single-use and expires; concurrent use creates one account.
- [ ] Production with `REGISTRATION` unset behaves as `invite`.
- [ ] Existing users sign in under `closed`.
- [ ] Magic-link denial is indistinguishable from success on screen and sends no mail.
- [ ] `.env.example`, README "Production", `DEPLOY_CHECKLIST.md` and `CLAUDE.md`
      document the modes and the `invite` CLI; ERD/`schema.ts` include `invites`.
- [ ] Typecheck, unit, E2E green.

## Rollout note

Existing self-hosters who upgrade without setting `REGISTRATION` switch from
open to `invite`. Their current users keep working; new sign-ups need the
allowlist or an invite. Call this out in the release notes (T2.9).
