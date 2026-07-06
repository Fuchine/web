# backlog: Pool do Postgres sem knob — orçar conexões antes do deploy

**Date:** 2026-07-06
**Feature:** Produção / DB
**Status:** OPEN

---

## Problema

`createDb` (`packages/db/src/client.ts:14-16`) cria o client postgres.js sem
nenhuma configuração de pool: `postgres(connectionString, { prepare: false })`
usa o default (`max: 10`, sem `idle_timeout`). Consumidores simultâneos num
deploy típico:

- web (`next start`): até 10;
- worker: até 10 (com `concurrency: 2` de import + explain, usa poucas, mas o
  teto é 10);
- scripts de backfill/seed rodando pontualmente: +10 cada.

Num Postgres default (`max_connections = 100`) há folga; num VPS pequeno com
Postgres ajustado para baixo, ou com 2+ réplicas do web, o teto chega rápido —
e o sintoma ("connection slots are reserved") aparece como erro 500
intermitente, difícil de diagnosticar de longe.

## Proposta

1. `createDb(url, { max? })` aceitando `DB_POOL_MAX` (default 10) e um
   `idle_timeout` modesto (~20s) — knob exposto, default inalterado.
2. Documentar o orçamento no README de produção: web 10 + worker 5 + margem
   de scripts ≤ `max_connections` com folga.
3. PgBouncer fica explicitamente **fora** do escopo até existir demanda real
   (múltiplas réplicas) — anotar para não sobre-engenheirar.

## Esforço / prioridade

**S · baixa.** Preventivo e barato; o custo de não ter é uma sessão de
debugging em produção no pior momento.

## Referências

- `packages/db/src/client.ts:14-17`
- `apps/worker/src/index.ts` (segundo pool do mesmo banco)
- Relacionado: [deploy-story-missing.md]
