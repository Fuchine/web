# backlog: 8 alertas Dependabot (4 high, 4 moderate)

**Date:** 2026-07-04
**Feature:** Higiene do repositório
**Status:** OPEN

---

## Problema

No push de 2026-07-04 o GitHub reportou 8 vulnerabilidades na branch default:
**4 high, 4 moderate** — pré-existentes, não relacionadas aos commits do dia.

https://github.com/Fuchine/web/security/dependabot

## O que precisa

1. Listar os alertas (`gh api repos/Fuchine/web/dependabot/alerts` ou UI) e
   separar produção × dev-only.
2. Bump das dependências afetadas no workspace pnpm; depois
   `pnpm typecheck` + `pnpm --filter @fuchine/web test` +
   `pnpm --filter @fuchine/worker test`.
3. Commit por bump lógico.
