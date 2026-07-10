# backlog: `pnpm.overrides` no package.json é ignorado pelo pnpm 10 — pins de segurança inertes

**Date:** 2026-07-10
**Feature:** Supply chain / tooling
**Status:** CLOSED (2026-07-10) — overrides movidos para `pnpm-workspace.yaml`; `pnpm install` limpo (sem warning), `pnpm audit` limpo, lockfile resolve nodemailer 9.0.1 / esbuild 0.25.12 / postcss 8.5.15. Era OPS-1 de [CORRECOES-PRE-DEPLOY-2026-07-10.md].

---

## Problema

Confirmado empiricamente (2026-07-10): qualquer invocação do pnpm 10.33 avisa
`The "pnpm" field in package.json is no longer read by pnpm. The following
keys were ignored: "pnpm.overrides"`. Os 4 overrides de segurança —
`nodemailer@<9.0.1`, `esbuild@<0.25.0`, `postcss@<8.5.10`, `uuid@<11.1.1`
(`package.json:27-34`) — **não têm efeito**. Hoje o lockfile congelado ainda
resolve as versões corrigidas (nodemailer 9.0.1; `pnpm audit` limpo), ou seja,
a proteção real é só o lock — o próximo `pnpm update`/re-resolução derruba os
pins sem aviso.

## Proposta

Mover o bloco para `overrides:` no `pnpm-workspace.yaml` (onde o
`onlyBuiltDependencies` já foi migrado), rodar `pnpm install` e confirmar que
o lockfile continua resolvendo nodemailer 9.x etc. Apagar o bloco `pnpm` do
package.json (o warning some — sinal de que ficou limpo).

## Esforço / prioridade

**XS · alta (bloqueia deploy).** Edit de minutos; sem ele os pins são teatro.

## Referências

- `package.json:27-34`, `pnpm-workspace.yaml`
- Origem: [CORRECOES-PRE-DEPLOY-2026-07-10.md] (OPS-1)
