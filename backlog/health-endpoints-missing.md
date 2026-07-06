# backlog: Sem health check — worker morre em silêncio, fila acumula

**Date:** 2026-07-06
**Feature:** Produção / Observabilidade
**Status:** OPEN

---

## Problema

1. **Web sem `/api/health`** (verificado por glob): não há endpoint para
   healthcheck de compose/proxy/uptime monitor — nem um que confirme que o
   Postgres e o Redis estão alcançáveis.
2. **Worker sem sinal de vida.** Se o processo do worker cai (OOM, crash),
   nada percebe: imports novos ficam `pending`/`processing` para sempre e o
   usuário vê "Processing" eterno na biblioteca. Os healthchecks do compose
   cobrem só Postgres e Redis (`docker-compose.yml:16-33`).
3. **Persistência da fila é a default do Redis** (RDB por snapshot): um crash
   pode perder os últimos minutos de jobs enfileirados. Tolerável — import é
   re-disparável — mas deve ser escolha declarada, não acidente.

## Proposta

1. **`GET /api/health`** sem auth e barato: `SELECT 1` no Postgres + `PING` no
   Redis, respondendo `{ ok, db, redis }` com 200/503. Usar como healthcheck
   do serviço `web` quando os containers existirem
   ([deploy-story-missing.md]).
2. **Heartbeat do worker:** chave `worker:heartbeat` no Redis com TTL ~30s,
   renovada num `setInterval`; o healthcheck do container do worker verifica a
   chave (`redis-cli EXISTS`). De brinde, o `/api/health` do web pode expor
   `workerAlive` — e a UI de import pode avisar "processing is delayed" em vez
   de girar para sempre.
3. Avaliar `--appendonly yes` no serviço Redis (durabilidade da fila) ou
   documentar o trade-off da default.

## Esforço / prioridade

**S · média.** Poucas linhas por peça; junto do restart automático do compose,
converte "morreu em silêncio" em "reiniciou sozinho e dá para ver".

## Referências

- `docker-compose.yml:16-33`, `apps/worker/src/index.ts`
- Relacionados: [deploy-story-missing.md], [import-jobs-no-retry.md]
  (reconciliador de vídeos presos — complementar ao heartbeat)
