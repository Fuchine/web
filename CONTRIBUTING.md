# Contributing to Fuchine

Thanks for your interest. Fuchine is open core under
[AGPL-3.0-only](LICENSE); contributions are accepted under the
[Developer Certificate of Origin](https://developercertificate.org/) (DCO) —
see [Sign your commits](#sign-your-commits-dco) below.

## Development quick start

Prerequisites: **Node 22**, **pnpm**, and **Docker** (for Postgres + Redis).

```bash
# 1. Bring up the infrastructure
docker compose up -d          # Postgres + Redis

# 2. Install and configure
pnpm install
cp .env.example .env          # fill DATABASE_URL, REDIS_URL, etc.

# 3. Prepare the database
pnpm db:migrate
pnpm --filter @fuchine/db seed        # JMdict + frequency

# 4. Run
pnpm dev                      # web (+ worker where applicable)
```

The monorepo is pnpm + Turborepo. Packages live under `packages/`, apps under
`apps/`. See [`CLAUDE.md`](CLAUDE.md) and [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md)
for the architecture and the locked decisions (D1–D8) — please read them before
proposing anything structural.

## Before you open a PR

CI runs these on every PR; run them locally first:

```bash
pnpm typecheck    # all packages must be green
pnpm test         # unit tests across the monorepo
pnpm build        # web app builds
```

Guidelines:

- **Don't violate the locked decisions** (AGPL everywhere, never store video/audio,
  BYOK keys never in plaintext or logs, FSRS for SRS, English-only UI). These are
  in `CLAUDE.md` and `docs/ARQUITETURA.md`.
- **Schema changes** come from `docs/CONTRATO_IA.md` and the ERD — don't improvise
  columns.
- Keep PRs focused. Match the style and comment density of the surrounding code.

## Commit conventions

We use [Conventional Commits](https://www.conventionalcommits.org/) prefixes
(`feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`), optionally scoped
(`feat(web): …`).

## Sign your commits (DCO)

Every commit must carry a `Signed-off-by` line certifying you have the right to
submit it under the project's license. Add it with `-s`:

```bash
git commit -s -m "fix(import): guard against empty payload"
```

This appends:

```
Signed-off-by: Your Name <your.email@example.com>
```

CI enforces this (see `.github/workflows/dco.yml`); PRs with unsigned commits
won't pass. To sign off commits you already made, use
`git rebase --signoff <base>` (or `git commit --amend -s` for the last one).

## Reporting security issues

Do **not** open a public issue. Follow [SECURITY.md](SECURITY.md).
