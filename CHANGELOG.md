# Changelog

All notable changes to Fuchine are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html). While
the version is `0.x`, a minor release may contain breaking changes; they are
always called out under **Upgrade notes**.

## [Unreleased]

### Added

- **Per-user API tokens for imports (T2.11).** Settings → Extension & API
  creates named tokens (`fch_…`, shown once with a copy button), lists them
  with prefix, creation and last-use dates, and revokes them; up to 10 active
  per user, creation rate-limited. `POST /api/import` accepts
  `Authorization: Bearer fch_…` (scope `import`); every other route stays
  session-only. Tokens are stored as SHA-256 hashes (migration `0023`, table
  `api_tokens`) and removed with the account.
- **Fuchine Importer 0.2.0.** The popup has an optional **API token** field;
  with it, imports carry the bearer token and no cookies, and a revoked token
  shows "Token invalid or revoked".

### Security

- The cross-site exemption on `POST /api/import` is narrowed: requests with a
  bearer token, or with the session cookie from a browser-extension origin
  (deprecated path for extension < 0.2.0), pass; a cross-site web page is now
  blocked like on every other route.

### Deprecated

- Cookie-authenticated imports from the extension. They keep working for
  extension < 0.2.0 and will be removed once 0.2.0 is the oldest supported
  version; see `docs/EXTENSION.md#deprecations`.

## [0.1.0] - Unreleased

First tagged release. Everything below is new relative to an untagged checkout
of `main`; self-hosters who ran from source should read the upgrade notes.

### Upgrade notes

> **Sign-up is invite-only by default in production.** When `REGISTRATION` is
> unset and `NODE_ENV=production` (the Docker images), only existing users,
> the `AUTH_ALLOWED_EMAILS` / `AUTH_ALLOWED_DOMAINS` allowlists and e-mails
> with an active invite can create an account. To keep an open instance, set
> `REGISTRATION=open` explicitly — but every new account can spend the house
> LLM key. Put your own address in `AUTH_ALLOWED_EMAILS` before your first
> sign-in, and invite others with
> `docker compose run --rm worker pnpm --filter @fuchine/worker invite add <email>`.

- **Published images.** `ghcr.io/fuchine/fuchine-web` and
  `ghcr.io/fuchine/fuchine-worker` (linux/amd64 + linux/arm64). Run them with
  `docker compose -f docker-compose.yml -f docker-compose.release.yml up -d`
  and pin `FUCHINE_VERSION=v0.1.0` (or a digest) in `.env`. Building from
  source with `docker compose up -d --build` still works.
- **The worker container runs as the unprivileged `node` user** and only
  contains the worker's slice of the workspace. Run one-off CLIs through
  `docker compose run --rm worker pnpm --filter @fuchine/worker <script>` as
  before.
- **Run the migrations** (`0000`–`0017`); the `migrate` service does this on
  `docker compose up`. Re-run the JMdict `seed` and then
  `pnpm --filter @fuchine/worker backfill:level` to populate frequency ranks
  and video level estimates on older databases.
- New boot checks fail fast on a missing `DATABASE_URL`, `AUTH_SECRET` or
  `FUCHINE_ENCRYPTION_KEY`, or an invalid `REGISTRATION` /
  `HOUSE_DAILY_TOKEN_BUDGET` value.
- Caddy now rejects request bodies over 2 MB and no longer receives the app's
  secrets (no `env_file`).

### Added

#### Study loop (MVP)

- Import a YouTube video through the browser extension (popup on YouTube, or
  the in-app `/import` bridge): it captures the captions the official player
  already downloads. No video or audio is ever stored — clips play through the
  YouTube IFrame player with start/end timestamps.
- Import pipeline (BullMQ worker): kuromoji tokenization, JMdict dictionary
  lookups with readings and frequency, per-video level estimate, retries with
  backoff and recovery of imports stuck in `processing`.
- Player with dual subtitles, pop-up dictionary per word, lazy batch
  translation (dedicated MT provider such as DeepL, falling back to the LLM)
  and on-demand per-line AI explanations, cached and shared per
  (line, kind, language, prompt version).
- One-click sentence mining and FSRS review (`ts-fsrs`) of the original clip;
  mining and reviewing are transactional (a rescheduled card always has its
  review log).
- Bring your own key (MiniMax or OpenAI) encrypted with AES-256-GCM, with a
  key-rotation CLI (`rotate:key`).

#### Library and progress

- Library with server-side search, filters, sorting and cursor pagination,
  per-user flags (saved / hidden / not interested), comprehension per video
  and a shared catalog.
- Albums, a phrases list with status counts, dictionary browsing and search
  with saved words and examples, stats (hours, words, streaks), daily goals
  and a dashboard with today's reviews and "Continue watching".
- Activity tracking from the player (watch time, lines seen, word views and
  clicks) feeding streaks and comprehension.
- Anki export (TSV, text only, clip as a YouTube deep link) and account
  deletion.
- Background pre-warming of explanations for the first lines on import and the
  rest of the video on first open.
- New-card default of 10 per day, review caps and a time budget, and a
  "tomorrow" projection.
- Primed listening mode in the player: hide Japanese and/or translation, and
  color words by status (new / learning / known).
- Review modes on the exact clip: Listen first, Cloze and Shadow (recording
  stays in memory only).
- Explanation evaluation harness (`pnpm --filter @fuchine/llm eval:explain`),
  a prompt-version lock that forces a `PROMPT_VERSION` bump when prompts
  change, and an "AI-generated · prompt vN" label on explanations.

#### Operations

- Docker Compose stack: Postgres, Redis (AOF + password), one-shot migrations,
  web, worker, Caddy with automatic TLS, and opt-in nightly `pg_dump` backups
  with a rehearsed restore script.
- `GET /api/health` (database, Redis, worker heartbeat, house budget).
- LLM usage metering in `llm_usage` (never keys or content) and a `usage` CLI.
- House-key daily token ceiling (`HOUSE_DAILY_TOKEN_BUDGET`) and
  `HOUSE_EXPLAIN_FALLBACK=false` to require BYOK for new explanations.
- Controlled registration (`REGISTRATION=open|invite|closed`, e-mail and
  domain allowlists, e-mail-bound invites with an `invite` CLI); denials do not
  reveal whether an account exists.
- Release pipeline: multi-arch images on GHCR with SBOM and provenance
  attestations, a Trivy gate before publishing, a weekly image scan, CodeQL,
  and all GitHub Actions pinned by commit SHA.

### Security

- Per-user / per-IP rate limits in Redis (explain, translate, import,
  dictionary search, magic link, activity beacons); the magic-link limiter
  fails closed.
- Security headers and CSP, `frame-ancestors 'none'` / `X-Frame-Options`, and a
  `Permissions-Policy` that only allows the microphone on the app's own origin.
- Cross-site mutation guard in `middleware.ts`, UUID validation on every route
  that takes an id, and a test requiring 401 without a session on every API
  route.
- HTML escaping in the magic-link e-mail and the Anki export; input size caps;
  card deletion (`DELETE /api/cards/:id`).
- CI runs `pnpm audit --prod`, ESLint, typecheck, unit and end-to-end tests;
  Dependabot covers npm, GitHub Actions and Docker base images; commits require
  a DCO sign-off.
- Worker container runs as non-root.

[Unreleased]: https://github.com/Fuchine/web/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/Fuchine/web/releases/tag/v0.1.0
