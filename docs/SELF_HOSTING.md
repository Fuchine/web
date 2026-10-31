# Self-hosting Fuchine

Run your own Fuchine instance with only Docker on the host: no Node, no pnpm.
Every command below runs from the root of a clone of this repository. The
Portuguese day-of-deploy runbook, with the full smoke test, is
[`DEPLOY_CHECKLIST.md`](DEPLOY_CHECKLIST.md).

> **Status.** There is no published release or image yet (roadmap T2.9), so
> you build the images from source with `docker compose up -d --build`. That is
> the only supported path today.

**Contents:** [Requirements](#1-requirements) ·
[Quick start](#2-quick-start-about-20-minutes) ·
[Configuration](#3-configuration-env) ·
[Local AI with Ollama](#4-local-ai-with-ollama) · [TLS](#5-tls-and-the-reverse-proxy) ·
[Backups](#6-backups-and-restore) · [Upgrading](#7-upgrading) ·
[Health](#8-health-endpoint) · [Operator CLIs](#9-operator-clis) ·
[Troubleshooting](#10-troubleshooting)

## 1. Requirements

- **Docker Engine with Compose v2** (`docker compose`, not `docker-compose`).
- A Linux host (a small VPS is fine) with ports **80 and 443** reachable from
  the internet, and a **domain name** whose A/AAAA record points at it. Caddy
  needs both to get a Let's Encrypt certificate.
- Outbound internet access: the dictionary seeds download JMdict and Kanjium
  (pitch accent) from GitHub, and the AI providers are remote (unless you run
  Ollama).
- **A sign-in method:** a Google OAuth client, or an SMTP account for e-mail
  magic links. Production refuses to boot without one.
- **AI (optional):** an API key for an OpenAI-compatible provider (MiniMax,
  OpenAI, or any compatible gateway), a local Ollama, and/or DeepL for
  translation. Without any, the app still works: videos stay studiable with
  tokenization and the local dictionary.

### Sizing

| Resource | Guidance |
|---|---|
| Worker RAM | **≥ 512 MB–1 GB.** kuromoji loads the whole IPADIC dictionary into memory on the first tokenize. Measure the real RSS with a test import (`docker stats`) before settling on a plan. |
| Host RAM | 2 GB is a workable minimum for web + worker + Postgres + Redis + Caddy; 4 GB is comfortable. The one-time JMdict seed parses the whole dictionary JSON in memory (Node heap allowed up to 4 GB), so add temporary swap on a 2 GB host if it gets killed. |
| Disk | The seeded JMdict is roughly 1–2 GB of database; each imported video adds ~2 MB (text only, never media). Leave room for 7 nightly dumps. |
| Postgres connections | Default pools: web 10, worker 5, plus one-off scripts. The bundled Postgres (100) is plenty. With an external Postgres, keep `max_connections` ≥ 40 and tune `DB_POOL_MAX`. |
| Ollama (optional) | A 7B-class model needs ~8 GB of RAM on CPU, and is slow without a GPU (see §4). |

## 2. Quick start (about 20 minutes)

```bash
git clone https://github.com/Fuchine/web.git fuchine
cd fuchine
cp .env.example .env
```

Generate the secrets and paste each into `.env`:

```bash
openssl rand -base64 32   # → AUTH_SECRET
openssl rand -base64 32   # → FUCHINE_ENCRYPTION_KEY  (back it up, see §6)
openssl rand -hex 24      # → POSTGRES_PASSWORD
openssl rand -hex 24      # → REDIS_PASSWORD
```

Then edit `.env`. The minimum for a working instance:

```ini
SITE_ADDRESS=fuchine.example.com          # not in .env.example: add this line
AUTH_URL=https://fuchine.example.com      # https, no trailing slash
AUTH_SECRET=...
FUCHINE_ENCRYPTION_KEY=...
POSTGRES_PASSWORD=...
REDIS_PASSWORD=...
AUTH_ALLOWED_EMAILS=you@example.com       # your own address: the first account needs no invite
TZ=Europe/Berlin                          # your zone: defines "today" for streaks

# one sign-in method (or both):
AUTH_GOOGLE_ID=...
AUTH_GOOGLE_SECRET=...
# EMAIL_SERVER=smtp://user:pass@smtp.example.com:587
# EMAIL_FROM="Fuchine <login@example.com>"

# AI (optional, see §3.6)
LLM_PROVIDER=openai
LLM_API_KEY=sk-...
HOUSE_DAILY_TOKEN_BUDGET=2000000
```

Leave `DATABASE_URL` and `REDIS_URL` as they are: the compose services
override them with the internal hostnames and your passwords.

Start the stack and seed the dictionary once:

```bash
docker compose up -d --build     # builds the images; migrate → web + worker → caddy
docker compose run --rm migrate pnpm --filter @fuchine/db seed:jmdict   # ~298k entries, one time
docker compose run --rm migrate pnpm --filter @fuchine/db seed:pitch    # ~124k pitch accents (Kanjium), one time
```

The first build takes several minutes. The `migrate` service applies database
migrations automatically before web and worker start. Seed the dictionary
**before** inviting anyone: an empty dictionary looks like a bug.

Check it is up:

```bash
docker compose ps
curl -s https://fuchine.example.com/api/health
# {"ok":true,"db":true,"redis":true,"workerAlive":true,"houseBudget":"ok"}
```

Open `https://fuchine.example.com`, sign in with the address you put in
`AUTH_ALLOWED_EMAILS`, then install the browser extension and point it at your
instance to import your first video: see [`EXTENSION.md`](EXTENSION.md).
Create an API token for it in **Settings → Extension & API** and paste it into
the extension popup: imports then authenticate with `Authorization: Bearer`
instead of depending on the session cookie reaching your instance cross-origin.
Tokens can only import (no other route accepts them), are stored as SHA-256
hashes, and are revoked from the same screen. Any client can use one:

```bash
curl -X POST https://fuchine.example.com/api/import \
  -H "Authorization: Bearer fch_…" -H "Content-Type: application/json" \
  -d '{"url":"https://www.youtube.com/watch?v=…","title":"…","captions":[{"startMs":0,"endMs":1500,"text":"…"}]}'
```

Turn on backups before the first real user (§6):

```bash
docker compose --profile backup up -d db-backup
```

### Trying it without a domain

Set `SITE_ADDRESS=localhost` and `AUTH_URL=https://localhost`. Caddy then uses
its own local CA, so the browser shows a certificate warning. You still need a
sign-in method: a Google OAuth client accepts
`https://localhost/api/auth/callback/google` as a redirect URI. The console
magic link printed by `pnpm dev` exists only in development, never in this
production stack.

## 3. Configuration (`.env`)

`.env.example` documents every variable. The ones that matter, grouped. The web
app **fails fast** at boot on a broken production config (missing secret,
malformed encryption key, no sign-in method, invalid registration mode or
budget) and prints what is missing in `docker compose logs web`.

### 3.1 Secrets

| Variable | Notes |
|---|---|
| `AUTH_SECRET` | Signs sessions and tokens. `openssl rand -base64 32`. Never reuse a dev value. |
| `FUCHINE_ENCRYPTION_KEY` | 32 bytes, base64. Encrypts users' saved API keys (AES-256-GCM). **Permanent:** back it up with the database. Losing it makes every saved key undecryptable (users must re-enter theirs). Rotate with `rotate:key` (§9). |
| `POSTGRES_PASSWORD` | Set at first run of the Postgres volume. Changing it later on an existing volume needs `docker compose exec postgres psql -U fuchine -c "ALTER USER fuchine PASSWORD '<new>'"` before restarting with the new value. |
| `REDIS_PASSWORD` | Redis `requirepass`. |

### 3.2 Site and time

| Variable | Notes |
|---|---|
| `SITE_ADDRESS` | Domain Caddy serves and gets a certificate for. Default `localhost`. |
| `AUTH_URL` | Public URL of the instance, `https://<domain>`, no trailing slash. |
| `TZ` | Instance timezone (IANA name). Defines "today" for streaks, daily goals, the heatmap and the daily AI budget. Compose passes the same value to web and worker; default `America/Sao_Paulo`. |
| `DEPLOYMENT_MODE` | Keep `self-host`. |
| `DB_POOL_MAX` | Max Postgres connections per process (web default 10, worker 5). |

### 3.3 Sign-in

| Variable | Notes |
|---|---|
| `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` | Google OAuth client ([console](https://console.cloud.google.com/apis/credentials)). Authorized redirect URI: `https://<domain>/api/auth/callback/google`. **Publish** the consent screen: in "Testing" mode Google caps you at 100 users and shows an unverified-app screen. |
| `EMAIL_SERVER`, `EMAIL_FROM` | SMTP for magic links, e.g. `smtp://user:pass@smtp.example.com:587`. Configure SPF, DKIM and DMARC for the sender domain: a login e-mail in spam makes the instance unusable. |

Magic links are rate-limited per e-mail and IP in Redis, and fail closed: if
Redis is down, no link is sent.

### 3.4 Registration (who can create an account)

Every new account can spend your house AI key, so a public instance should never
be `open`.

| Variable | Notes |
|---|---|
| `REGISTRATION` | `open` (anyone), `invite` (existing users + allowlists + invited e-mails), `closed` (existing users + allowlists only). **Unset = `invite` in production.** An unknown value stops the boot. |
| `AUTH_ALLOWED_EMAILS` | Comma-separated exact addresses. Applies in every mode. Put your own address here. |
| `AUTH_ALLOWED_DOMAINS` | Comma-separated domains. `example.com` matches `a@example.com`, not `a@sub.example.com`. With Google, only verified e-mails match a domain or an invite. |

Existing users can always sign in, whatever the mode. A denied magic-link
request shows the same "check your e-mail" screen as a successful one but sends
nothing, so the page does not reveal who has an account; a denied Google
sign-in sees "This Fuchine instance is invite-only".

Invites are bound to an e-mail, single use, and expire (default 14 days):

```bash
docker compose run --rm worker pnpm --filter @fuchine/worker invite add friend@example.com --days 14 --note "book club"
docker compose run --rm worker pnpm --filter @fuchine/worker invite list          # --all includes used/expired
docker compose run --rm worker pnpm --filter @fuchine/worker invite revoke friend@example.com
```

### 3.5 House AI budget

The **house key** is the AI key you configure in `.env` (`LLM_*`). It pays for
subtitle translation, explanations for users who have not set their own key,
and the background pre-warm of explanations. Users' own keys (BYOK) are never
counted against it.

| Variable | Notes |
|---|---|
| `HOUSE_DAILY_TOKEN_BUDGET` | Daily ceiling on house-key tokens (input + output), across web and worker, per local day (`TZ`). At the ceiling, new explanations for users without a key and translation of not-yet-translated chunks return a "house budget" message, and the pre-warm stops, until midnight. Cached content and BYOK keep working. **Unset = no ceiling** (the boot logs a warning). Example: `2000000`. |
| `HOUSE_EXPLAIN_FALLBACK` | `false` = users without their own key cannot generate *new* explanations on the house key (they are told to add a key in Settings); cached ones still serve. Translation and pre-warm are unaffected. Default `true`. |

The figure is cached for 30 s per process, so the ceiling can be overshot by
about half a minute of traffic. DeepL usage is measured in characters and is
not counted (it is bounded by your DeepL plan); the LLM fallback behind it is.

```bash
docker compose run --rm worker pnpm --filter @fuchine/worker usage
# house tokens today: 412,880 / 2,000,000 (21%) — ok
#   explainLine      350,112
#   translateBatch    62,768
# byok tokens today:  0 (users' own keys, not budgeted)
```

`/api/health` reports only the state (`unlimited` / `ok` / `exhausted`), never
numbers.

### 3.6 AI providers

| Variable | Notes |
|---|---|
| `LLM_PROVIDER` | `echo` (default: no AI, lines stay Japanese-only), `minimax`, `openai`, `openai-compatible`, or `deepl` (translation only, cannot explain). |
| `LLM_API_KEY` | Key for the provider. Required for every provider except `echo`. |
| `LLM_BASE_URL` | Override the endpoint. Defaults: `minimax` → `https://api.minimax.io/v1`, `openai` → `https://api.openai.com/v1`. **Required** for `openai-compatible`. |
| `LLM_MODEL` | Override the model. Defaults: `minimax` → `minimax-m3`, `openai` → `gpt-4o-mini`. **Required** for `openai-compatible`. |
| `MT_PROVIDER`, `MT_API_KEY`, `MT_BASE_URL` | Optional dedicated translation backend; `deepl` recommended (a `:fx` key suffix means DeepL Free, host auto-detected). Falls back to the `LLM_*` provider when it fails or rate-limits. Unset = translation uses `LLM_*`. |
| `PREWARM_MAX_LINES` | Explanations pre-generated in the background for the first N lines of each import (default 150). The rest is pre-warmed when the video is first opened. Higher = more house spend per import. |

Each user can also set their own key in **Settings** (BYOK). The Settings
screen offers **MiniMax and OpenAI only**, with their default endpoints; it
cannot point at a custom base URL. A custom endpoint, including a local model,
is therefore only possible for the **house provider** in `.env`.

`echo` in production means AI is silently off; the boot logs a warning.

### 3.7 Extra dictionaries (Yomitan format)

Fuchine ships JMdict and Kanjium pitch (seeded, §2). Any dictionary in the
**Yomitan** zip format (format 3: term banks, pitch and frequency lists, with
an `index.json`) can be added to the instance: monolingual dictionaries
(国語辞典), other bilingual ones, pitch dictionaries and domain frequency lists
(YouTube, anime and drama, Netflix, JPDB…). Fuchine distributes none of them.
**You are responsible for having the right to use the dictionaries you
import.** Their attribution, author and URL from `index.json` are kept and shown
in the admin list.

```bash
# put the zip next to the compose file, then:
docker compose run --rm -v "$PWD/dicts:/dicts:ro" worker \
  pnpm --filter @fuchine/worker dict:import /dicts/my-dictionary.zip
docker compose run --rm worker pnpm --filter @fuchine/worker dict:list
docker compose run --rm worker pnpm --filter @fuchine/worker dict:remove "Dictionary title"
```

- Importing a title that already exists **replaces** it (one transaction; the
  previous revision stays if the import fails) and keeps users' choices.
- Each user turns dictionaries on, orders them, and picks the frequency list
  that drives the Anki export's `FreqSort` in **Settings → Dictionaries**.
  Nothing is shown until a user enables it.
- Images inside dictionaries are not imported; definitions are rendered from a
  whitelist of tags and styles (spec: `docs/plans/2026-10-31-yomitan-dictionaries-spec.md`).
- Size: archives whose banks exceed `DICT_MAX_UNCOMPRESSED_MB` uncompressed
  (default 200) are rejected. Large monolingual or bilingual dictionaries need
  more: Jitendex (514 MB of banks) imported in about 50 s with
  `-e DICT_MAX_UNCOMPRESSED_MB=1000` and takes about 450 MB of database space.

| Variable | Notes |
|---|---|
| `ADMIN_EMAILS` | Comma-separated e-mails of instance admins. Admins can upload, disable and remove dictionaries in Settings → Dictionaries (uploads up to 100 MB through Caddy; use the CLI for larger files). Unset = no admins; the CLI still works. |
| `DICT_MAX_UNCOMPRESSED_MB` | Cap on a dictionary's uncompressed banks, for the CLI and the upload (default 200). |

## 4. Local AI with Ollama

The house provider can be any OpenAI-compatible endpoint, which includes
[Ollama](https://ollama.com)'s `/v1` API. This keeps all AI on your hardware at
no per-token cost. Only the house provider can do this (see §3.6): users' own
keys in Settings cannot point at Ollama.

Add Ollama as a compose service with an override file. Compose loads
`docker-compose.override.yml` automatically, so the repository files stay
untouched:

```yaml
# docker-compose.override.yml
services:
  ollama:
    image: ollama/ollama   # pin a version tag for a real deploy
    restart: unless-stopped
    volumes:
      - ollama_data:/root/.ollama
volumes:
  ollama_data:
```

In `.env`:

```ini
LLM_PROVIDER=openai-compatible
LLM_BASE_URL=http://ollama:11434/v1
LLM_MODEL=qwen2.5:7b
LLM_API_KEY=ollama        # any non-empty value: the adapter requires one, Ollama ignores it
```

Then:

```bash
docker compose up -d
docker compose exec ollama ollama pull qwen2.5:7b
docker compose up -d --force-recreate web worker   # pick up the new .env
```

Notes:

- **Model choice.** Pick a model that handles Japanese and returns JSON reliably
  (explanations use JSON response mode). `qwen2.5:7b` is only an example; quality
  of translations and explanations depends heavily on the model.
- **Timeouts.** Each AI call has a 30-second timeout. Translation sends up to 40
  lines per call, so a slow CPU-only model can time out; then lines stay
  untranslated (the app degrades, it doesn't break). A GPU or a smaller model
  helps. For GPU access, add the device reservation documented by Ollama to the
  override.
- **Ollama on the host instead of in compose.** Use
  `LLM_BASE_URL=http://host.docker.internal:11434/v1`, start Ollama listening on
  an interface the containers can reach (`OLLAMA_HOST=0.0.0.0`, firewalled from
  the internet), and on Linux add to the override:
  ```yaml
  services:
    web:
      extra_hosts: ["host.docker.internal:host-gateway"]
    worker:
      extra_hosts: ["host.docker.internal:host-gateway"]
  ```
- **Budget.** Local tokens are still metered as house usage. Leave
  `HOUSE_DAILY_TOKEN_BUDGET` unset or set it high (the boot warning about an
  unset budget is harmless here), or use it to bound load on the machine.
- You can still put DeepL in front for translation (`MT_PROVIDER=deepl`) and
  keep Ollama for explanations.

## 5. TLS and the reverse proxy

The bundled Caddy (`Caddyfile`) terminates HTTPS and is the only ingress: `web`
publishes no host port.

- With `SITE_ADDRESS` set to a real domain, Caddy obtains and renews a Let's
  Encrypt certificate automatically. Ports 80 and 443 must be open and DNS must
  point at the host. Certificates live in the `caddy_data` volume.
- Caddy caps request bodies at **2 MB** (larger requests get `413`); the largest
  legitimate body, a long video's captions, is about 0.5 MB. The one exception
  is `POST /api/admin/dictionaries` (admin dictionary upload, §3.7): 100 MB. The
  app rejects non-admins there before reading the body.
- Caddy **replaces** any client-sent `X-Forwarded-For` with the real peer
  address. The magic-link per-IP rate limit depends on that.
- Caddy gets no secrets: only `SITE_ADDRESS`.
- Security headers (CSP with `frame-ancestors 'none'`, `X-Frame-Options`,
  `Permissions-Policy`) come from the app itself.

**Using your own proxy instead** (nginx, Traefik, a CDN): it must be the only
way to reach the web container (Auth.js trusts the forwarded host headers), set
`X-Forwarded-Host`/`X-Forwarded-Proto`, **overwrite** `X-Forwarded-For` rather
than append to it (nginx: `proxy_set_header X-Forwarded-For $remote_addr;`),
and cap bodies at 2 MB (nginx: `client_max_body_size 2m;`), except
`POST /api/admin/dictionaries` if you want admin uploads (100 MB).

## 6. Backups and restore

User progress (cards, the FSRS review history, stats) is the only data that
cannot be re-derived. **`docker compose down -v` deletes the database volume,
with no undo.**

### Enable nightly backups

```bash
docker compose --profile backup up -d db-backup
```

The `db-backup` sidecar runs `pg_dump -Fc` once a day into the `pg_backups`
volume (`/backups/fuchine-<timestamp>.dump`) and keeps the 7 most recent. The
first dump happens as soon as it starts.

```bash
# list dumps
docker compose --profile backup run --rm --entrypoint ls db-backup -l /backups

# take a dump now
docker compose exec db-backup sh -c 'pg_dump -Fc "$DATABASE_URL" > /backups/fuchine-manual.dump'

# copy all dumps off the volume into the current directory
docker compose --profile backup run --rm -v "$PWD":/out --entrypoint sh db-backup -c 'cp /backups/*.dump /out/'
```

Copy dumps **off the host** regularly; a backup on the same disk is not a backup.

### Back up the encryption key

Store `FUCHINE_ENCRYPTION_KEY` **with** the dumps (same vault, not the same
disk). A restored database with a different key cannot decrypt users' saved
API keys; AES-GCM ciphertext under the wrong key is unrecoverable. Keeping a copy
of the whole `.env` alongside is simplest.

Redis is intentionally not backed up: queues can be re-populated by
re-importing.

### Restore

This overwrites the current database (`--clean`). Rehearse once on a throwaway
instance before you need it.

```bash
docker compose stop web worker

# from a dump in the pg_backups volume:
docker compose --profile backup run --rm --entrypoint sh db-backup -c \
  'pg_restore --clean --if-exists --no-owner --no-acl -d "$DATABASE_URL" /backups/fuchine-<timestamp>.dump'

# or from a file in the current directory:
docker compose --profile backup run --rm -v "$PWD":/restore:ro --entrypoint sh db-backup -c \
  'pg_restore --clean --if-exists --no-owner --no-acl -d "$DATABASE_URL" /restore/<file>.dump'

docker compose run --rm migrate    # bring the schema up to date if the dump is older than the code
docker compose up -d
```

Make sure `.env` has the same `FUCHINE_ENCRYPTION_KEY` as when the dump was
taken. Outside compose, `scripts/pg-restore.sh` does the same `pg_restore`
against any `DATABASE_URL`.

## 7. Upgrading

```bash
git pull
docker compose up -d --build
```

`--build` matters: a plain `docker compose up -d` keeps running the old images.
The `migrate` service applies new migrations before web and worker restart. Take
a dump first (§6). If an upgrade note asks for a backfill, run it through the
worker image, for example:

```bash
docker compose run --rm worker pnpm --filter @fuchine/worker backfill:level         # level estimate of old videos
docker compose run --rm worker pnpm --filter @fuchine/worker backfill:daily-stats   # daily stats from older reviews
docker compose run --rm worker pnpm --filter @fuchine/worker backfill:explain       # pre-warm explanations of old videos (spends house tokens)
```

Re-running the JMdict seed is safe (it upserts) and picks up the latest
dictionary release. The pitch seed (`seed:pitch`) is safe to re-run too; it
reads a pinned Kanjium revision (set `KANJIUM_REF` to move it).

## 8. Health endpoint

`GET /api/health` is public and cheap. It returns `200` when Postgres and Redis
are reachable, `503` otherwise:

```json
{ "ok": true, "db": true, "redis": true, "workerAlive": true, "houseBudget": "ok" }
```

| Field | Meaning |
|---|---|
| `ok` | `db && redis`: the web app can serve requests. |
| `db` | Postgres answered `SELECT 1` within 1 s. |
| `redis` | Redis answered `PING` within 1 s. |
| `workerAlive` | The worker renewed its heartbeat in the last 30 s. Informational: a dead worker does not fail the probe, but imports and pre-warm stall. |
| `houseBudget` | `unlimited` (no ceiling), `ok`, `exhausted` (house AI paused until midnight), or `unknown` (could not be read). |

The compose healthcheck of `web` uses it. Without a public domain, query it from
inside the container:
`docker compose exec web wget -qO- http://127.0.0.1:3000/api/health`.

## 9. Operator CLIs

All run through the worker image (`docker compose run --rm worker pnpm --filter @fuchine/worker <script>`):

| Script | What it does |
|---|---|
| `invite add\|list\|revoke` | Manage registration invites (§3.4). |
| `usage` | Today's house and BYOK token spend (§3.5). |
| `rotate:key` | Re-encrypt every saved BYOK key from `OLD_ENCRYPTION_KEY` to `FUCHINE_ENCRYPTION_KEY`. Pass both, then put the new key in `.env`: `docker compose run --rm -e OLD_ENCRYPTION_KEY=<old> -e FUCHINE_ENCRYPTION_KEY=<new> worker pnpm --filter @fuchine/worker rotate:key`. Safe to re-run. |
| `dict:import <zip>`, `dict:list`, `dict:remove <title>` | Install, list and remove Yomitan dictionaries (§3.7). |
| `backfill:level`, `backfill:daily-stats`, `backfill:explain` | One-off backfills (§7). |

The dictionary seeds run through the migrate image:
`docker compose run --rm migrate pnpm --filter @fuchine/db seed:jmdict`, then
`… seed:pitch` (pitch accent).

## 10. Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `web` keeps restarting | The boot check failed. `docker compose logs web` lists the missing or invalid variables (`AUTH_SECRET`, `FUCHINE_ENCRYPTION_KEY` not 32 bytes base64, no sign-in method, bad `REGISTRATION` or `HOUSE_DAILY_TOKEN_BUDGET`). |
| `docker compose up` errors with "Set POSTGRES_PASSWORD in .env" | `POSTGRES_PASSWORD` or `REDIS_PASSWORD` is empty. |
| Postgres auth fails after changing `POSTGRES_PASSWORD` | The password is fixed when the volume is created. Run the `ALTER USER` in §3.1 with the new value. |
| "This Fuchine instance is invite-only" for your own account | Your address is not in `AUTH_ALLOWED_EMAILS` (exact match, comma-separated), or your Google e-mail is unverified. Add it, or `invite add` yourself, and recreate web (`docker compose up -d web`). |
| Magic link never arrives | Check `EMAIL_SERVER`, the spam folder, SPF/DKIM/DMARC. A request for a non-allowed address shows "check your e-mail" but sends nothing by design. With Redis down, no link is sent. |
| Google: `redirect_uri_mismatch` | Register `https://<domain>/api/auth/callback/google` and make `AUTH_URL` match the domain exactly. |
| No certificate / browser TLS error | DNS does not point at the host, or ports 80/443 are blocked. `docker compose logs caddy` shows the ACME error. |
| Dictionary pop-up is empty | The JMdict seed did not run. Run it (§2). |
| No pitch accent in the pop-up | The pitch seed did not run (`seed:pitch`, §2), or the word is not in Kanjium. |
| Import stays "processing", `workerAlive: false` | `docker compose logs worker`. Most often the worker was OOM-killed while loading kuromoji: give it more memory (§1). The worker re-queues stuck imports when it restarts; a failure reason is shown on the video. |
| Seed killed with exit code 137 | Out of memory while parsing JMdict. Add swap or memory temporarily (§1) and re-run. |
| No translations, explanations fail | `LLM_PROVIDER` is `echo` (see the boot warning), the key is wrong, or `houseBudget` is `exhausted`. Check `docker compose logs web worker` and the `usage` CLI. |
| Ollama calls time out | The model is too slow for the 30 s per-call timeout. Use a GPU or a smaller model (§4). |
| `413` on import | The request exceeded the 2 MB body cap. Legitimate imports are far below it; a custom proxy may have a lower limit. |
| Changes in the repo don't show up | You ran `up -d` without `--build` (§7). |
| Extension can't reach the instance | See [`EXTENSION.md`](EXTENSION.md#troubleshooting). |
