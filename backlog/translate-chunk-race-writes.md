# backlog: translateChunk — corrida no marker e 30 UPDATEs por chunk

**Date:** 2026-07-06
**Feature:** Tradução lazy (F1)
**Status:** OPEN

---

## Problema

`translateChunk` (`apps/web/lib/translate.ts:48-130`) tem dois defeitos no
caminho de miss:

1. **Corrida = tradução dupla.** O marker é checado antes (linha 80-89) e
   gravado só **depois** de traduzir (linha 118-121). Dois requests simultâneos
   do mesmo chunk — duas abas, ou dois usuários no mesmo vídeo popular (cache
   compartilhado torna isso o caso esperado na cloud) — ambos erram o marker e
   ambos pagam a chamada de MT. O `onConflictDoNothing` só deduplica o
   registro, não o gasto.
2. **Persistência em 30 statements.** As traduções são gravadas com um
   `db.update` por linha em `Promise.all` (linhas 110-117) — 30 round trips
   paralelos por chunk, disputando conexões do pool a cada chunk do pump.

## Proposta

Usar o próprio marker como *claim* (o schema já reserva os status —
`packages/db/src/schema.ts:171`, comentário "failed/pending reserved"):

1. `INSERT INTO subtitle_translation_chunks (video_id, chunk_idx, status)
   VALUES (..., 'pending') ON CONFLICT DO NOTHING RETURNING` — quem recebe a
   linha de volta traduz; quem não recebe devolve `202` (`{"pending": true}`) e
   o player re-tenta o fetch do chunk em alguns segundos.
2. No sucesso: batch UPDATE via `unnest` + `UPDATE ... SET status='done'` na
   mesma transação. Na falha: `DELETE` do marker pending (destrava o retry).
3. Varredura de markers `pending` velhos (>2 min) no início do request — cobre
   o processo que morreu no meio.

## Esforço / prioridade

**S-M · média.** O custo da corrida é limitado (1 chunk duplicado por
colisão), mas o padrão claim + batch write também simplifica o backoff do pump
e prepara o endpoint para a biblioteca pública da F2.

## Referências

- `apps/web/lib/translate.ts:80-121`
- `packages/db/src/schema.ts:164-177` (`subtitle_translation_chunks`)
- Relacionados: [translation-pump-no-circuit-breaker.md],
  [ai-endpoints-no-rate-limit.md]
