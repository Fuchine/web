# backlog: Jobs de import sem retry — vídeo preso em "processing" e falha sem motivo

**Date:** 2026-07-06
**Feature:** Import (fila / worker)
**Status:** OPEN

---

## Problema

1. **Sem retry.** `queue.add("import", ...)` (`apps/web/lib/import.ts:98`) e
   `getImportQueue` (`packages/jobs/src/index.ts:25-27`) não configuram
   `attempts`/`backoff` — default do BullMQ é 1 tentativa. Um blip transitório
   (Postgres reiniciando, OOM no worker) mata o import de vez.
2. **Vídeo preso.** `importVideo` seta `processing` logo no início
   (`apps/worker/src/pipeline.ts:49`); se o processo morre no meio, o vídeo
   fica `processing` para sempre — a biblioteca mostra "Processing" eterno e
   não há reconciliador.
3. **`failed` sem motivo.** No catch (`pipeline.ts:96-98`) o status vira
   `failed` seco; a ARQUITETURA (§4.2) pede "status = falhou **com motivo
   legível**", mas o schema não tem onde guardar (decisão de ERD pendente).
   O mesmo vale para o job de pre-warm (falha só vai a log).

## Proposta

1. `defaultJobOptions: { attempts: 3, backoff: { type: "exponential", delay:
   5000 }, removeOnComplete: true }` em `getImportQueue`/`getExplainQueue` —
   idempotência já é garantida pelo pipeline (onConflictDoNothing em tudo).
2. Reconciliador barato no startup do worker: vídeos `processing` sem job
   ativo/aguardando na fila → re-enfileirar (ou marcar `failed`).
3. **Decisão de schema (ERD):** coluna `status_reason text` em `videos` para o
   motivo legível ("no captions", "tokenizer error: …"), exibida no card da
   biblioteca — hoje o estado de erro do inventário não tem o que mostrar.

## Esforço / prioridade

**S-M · média.** Itens 1–2 são pequenos e removem um modo de falha visível ao
usuário; item 3 espera a decisão de ERD mas destrava o empty/error state (T1.9).

## Referências

- `packages/jobs/src/index.ts`, `apps/web/lib/import.ts:98`
- `apps/worker/src/pipeline.ts:49, 96-99`, `apps/worker/src/index.ts`
- Relacionado: [import-validation-caps.md], [embed-blocked-videos.md]
  (também quer sinalização por vídeo)
