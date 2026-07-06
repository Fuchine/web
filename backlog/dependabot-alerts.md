# backlog: alertas Dependabot (produção + dev-only)

**Date:** 2026-07-04 · **Updated:** 2026-07-05
**Feature:** Higiene do repositório
**Status:** RESOLVED (2026-07-05) — `pnpm audit` limpo

---

## Resolução (2026-07-05)

`pnpm audit` listou 11 avisos (1 critical, 2 high, 8 moderate — superconjunto
dos alertas do Dependabot). Separados produção × dev e corrigidos em 2 bumps
lógicos:

### Produção (runtime do app)
- **drizzle-orm** `^0.38.4 → ^0.45.2` (GHSA-gpj5-g38j-94v9, high — SQL injection
  por identificadores mal escapados) em web/worker/db/llm/nlp.
- **next-auth** `beta.25 → beta.31` (GHSA-5jpx-9hw9-2fx4, email misdelivery).
- **drizzle-kit** `^0.30.2 → ^0.31.10` (puxa esbuild corrigido no toolchain).
- **postcss** (via next) coberto por override `>=8.5.10`.

### Dev/build-only (não afetam o app publicado)
- **vitest** `^2.1.9 → ^3.2.7` (GHSA-5xrq-8626-4rwp, critical mas só com o
  Vitest UI server, que não usamos).
- **vite** `^5.4.11 → ^6.4.3` (fs.deny bypass, path traversal, launch-editor).
- **esbuild** e **uuid** (via drizzle-kit/@esbuild-kit e storybook) por
  `pnpm.overrides` (`esbuild >=0.25.0`, `uuid >=11.1.1`).

**Verificado**: typecheck nos 7 pacotes, testes (web 120, worker 14, db 3, ui
20, llm 17), build do web, `drizzle-kit generate` sem mudanças de schema, e
`pnpm audit` → **No known vulnerabilities found**.

## Nota

`@esbuild-kit/*` segue marcado como deprecated (dependência transitiva do
drizzle-kit), mas o override força o esbuild interno para `>=0.25.0`, então não
há aviso de segurança — só o warning de deprecação.
