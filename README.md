# Fuchine

**Learn Japanese by immersion in video.** Import a YouTube video, study it with
intelligent dual subtitles (tokenization, pop-up dictionary, per-line AI
explanations), mine sentences in one click, and review them with an FSRS-based
SRS that replays the exact clip from the original video.

The name comes from 淵 (*fuchi*), "the depths" — diving into the language.

> **Status:** F1 (usable MVP). The full study loop works end to end — import →
> watch with smart subtitles → mine → review. Launch polish is in progress.

## Demo

![Fuchine study loop](docs/assets/demo.gif)

> paste a URL → watch with smart subtitles → mine sentences → review in the SRS → back to the video

## Why Fuchine

- **Open core, self-hostable.** The open repository is the whole product. BYOK
  (bring your own LLM key) and you pay only your own AI bill.
- **Structurally cheap AI**, via layered processing (local → cheap → expensive
  on demand) and a shared, versioned cache.
- **One app for the whole loop** — watch, mine, and review without exporting to
  another tool; reviews replay the original video clip.
- **Modern SRS (FSRS)** instead of classic SM-2.
- **Multilingual by design** — Japanese is the first language, not the only one.

## How it compares

A best-effort comparison of *structural* properties (not a feature-by-feature
benchmark — competitor features evolve, so corrections are welcome). "~" means
partial or via an add-on/integration.

| | Fuchine | Language Reactor | Migaku | asbplayer | Anki (manual) |
|---|:---:|:---:|:---:|:---:|:---:|
| Open source | ✓ (AGPL-3.0) | ✗ | ✗ | ✓ | ✓ |
| Self-hostable | ✓ | ✗ | ✗ | ~ | ✓ |
| No subscription / BYOK | ✓ | ✗ (Pro) | ✗ (sub) | ✓ | ✓ |
| Dual subtitles + tokenization | ✓ | ✓ | ✓ | ~ | ✗ |
| Pop-up dictionary | ✓ | ✓ | ✓ | ~ (Yomitan) | ✗ |
| Per-line AI explanation | ✓ | ~ (word-level) | ~ (word-level) | ✗ | ✗ |
| Mine → SRS in the same app | ✓ | ✓ (Pro) | ✓ | ~ (Anki) | ✗ |
| Reviews replay the source clip | ✓ (live, unstored) | ~ (saved audio) | ~ (saved audio) | ~ (Anki) | ✗ |
| FSRS scheduling | ✓ | ✗ | ✗ (own SRS) | ~ (Anki) | ✓ |
| Multilingual by design | ✓ | ✓ | ✓ | ✓ | ✓ |

## The loop

> paste a URL → watch with smart subtitles → mine sentences → review in the SRS → back to the video

## Quick start (development)

```bash
cp .env.example .env          # fill in secrets + your AI provider (BYOK)
docker compose up -d postgres redis   # just the infra
pnpm install
pnpm db:migrate               # apply the schema
pnpm --filter @fuchine/db seed:jmdict   # load the JMdict dictionary (~298k entries)
pnpm dev                      # web + worker with hot reload
```

Requires Node 22+ and pnpm 10+.

## Production (self-host)

The full stack runs from compose — Caddy (automatic HTTPS) in front of the web
and worker containers, over Postgres + Redis. No Node toolchain needed on the
host, just Docker.

```bash
cp .env.example .env
# Edit .env — at minimum:
#   AUTH_SECRET, FUCHINE_ENCRYPTION_KEY   (openssl rand -base64 32 each)
#   a sign-in method: AUTH_GOOGLE_ID/SECRET or EMAIL_SERVER
#   SITE_ADDRESS=your.domain.com          (Caddy gets a Let's Encrypt cert)
#   change the Postgres password in docker-compose.yml for a real deploy

docker compose up -d --build            # migrate → web + worker → caddy
docker compose run --rm migrate pnpm --filter @fuchine/db seed:jmdict   # one-time
```

The `migrate` service applies pending migrations automatically before web/worker
boot. `web` publishes no host port — Caddy is the only ingress. Health:
`https://your.domain.com/api/health` reports Postgres, Redis, and worker
liveness.

> **The web app fails fast** on a broken production config (missing
> `DATABASE_URL`/`AUTH_SECRET`/`FUCHINE_ENCRYPTION_KEY`, or no sign-in method),
> so a misconfigured instance won't boot "healthy" and break later.

### Backups & restore

User progress (`sentence_cards`, `review_logs`, `user_*_stats` — the FSRS
history) is the only data that can't be re-derived. **`docker compose down -v`
deletes the `postgres_data` volume — there is no undo.**

Enable nightly `pg_dump` (custom format, keeps the last 7):

```bash
docker compose --profile backup up -d db-backup   # dumps to the pg_backups volume
```

Restore into a fresh database, then reconcile the schema:

```bash
pg_restore -d "$DATABASE_URL" --clean --if-exists /backups/fuchine-<ts>.dump
docker compose run --rm migrate pnpm --filter @fuchine/db migrate
```

Back up `FUCHINE_ENCRYPTION_KEY` **with** the database: without it, saved BYOK
keys can't be decrypted. Redis is intentionally not backed up — the queue is
re-populable by re-import.

**AI is BYOK.** Layer-1 translation runs from the `LLM_*` env vars (see
`.env.example` for MiniMax / OpenAI-compatible / DeepL options); per-user layer-2
explanations use the key each user sets in **Settings**. Without a key the app
still works — videos stay studiable with tokenization and the local dictionary,
AI just degrades gracefully.

## Monorepo layout

| Path | What |
|---|---|
| `apps/web` | Next.js — UI + API routes |
| `apps/worker` | BullMQ consumers — the import pipeline |
| `packages/core` | Domain: entities, services, FSRS |
| `packages/db` | Drizzle schema + migrations + seeds |
| `packages/nlp` | `Tokenizer` / `DictionaryProvider` interfaces + `ja` adapter |
| `packages/llm` | LLM providers + key resolution + AI cache |
| `docs/` | Architecture, AI contract, screen inventory — the source of truth |

## Documentation

- [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md) — vision, open-core model, locked
  decisions (D1–D8), system architecture, roadmap.
- [`docs/CONTRATO_IA.md`](docs/CONTRATO_IA.md) — input/output contract for the AI
  functions and the cache.
- [`docs/INVENTARIO_TELAS.md`](docs/INVENTARIO_TELAS.md) /
  [`docs/PROMPT_PACK_TELAS.md`](docs/PROMPT_PACK_TELAS.md) — product screens.

## License

[AGPL-3.0-only](LICENSE). Third-party attributions (JMdict/EDRDG, etc.) are in
[`NOTICE`](NOTICE). Contributions under the
[DCO](https://developercertificate.org/).
