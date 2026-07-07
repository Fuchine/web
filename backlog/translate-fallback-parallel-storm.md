# backlog: Fallback linha-a-linha dispara até 40 chamadas paralelas

**Date:** 2026-07-06
**Feature:** LLM provider (camada 1)
**Status:** DONE (2026-07-07)

---

## Problema

Em `OpenAICompatibleProvider.translateChunk`
(`packages/llm/src/providers/openai-compatible.ts:69-80`), quando o chunk
desalinha duas vezes, o fallback traduz linha a linha com
`Promise.all(chunk.map(...))` — até **40 chamadas simultâneas**
(`TRANSLATE_CHUNK = 40`) contra um provider que *acabou de falhar duas vezes*.

Consequências: rajada que convida 429 em cascata; `translateOne` engole erro e
devolve `null` (linhas 101-116), então um provider rate-limitado produz um
chunk todo-null → `isTranslationFailure` → 502 — **depois** de pagar as 40
chamadas.

## Proposta

1. Trocar o `Promise.all` por um pool de 2–3 em série (o `runPool` de
   `packages/llm/src/prewarm.ts:58-79` já faz exatamente isso — mover para um
   util compartilhado).
2. *Early abort*: se as ~4 primeiras chamadas do fallback falharem, desistir do
   chunk inteiro (lançar `ProviderError`) em vez de completar as 40.

## Resolução (2026-07-07)

Em `packages/llm/src/providers/openai-compatible.ts`, o `Promise.all(chunk.map(...))`
do fallback virou `boundedTranslateFallback(chunk, translateOne)` — helper
exportado e testado:

1. **Concorrência limitada** (`FALLBACK_CONCURRENCY = 3`): pool de workers que
   preserva a ordem e devolve um array do mesmo tamanho (CONTRATO §3.2), em vez
   de até 40 chamadas simultâneas.
2. **Early abort** (`FALLBACK_ABORT_AFTER = 4`): se as primeiras chamadas
   falham (`null`) e **nada** traduziu ainda, para de emitir novas chamadas — o
   restante fica `null` (upstream já trata chunk todo-null como falha → 502).
   Uma linha que traduz cedo desliga o abort e o chunk termina inteiro.

Optei por **não lançar `ProviderError`** (o contrato de `translateChunk` segue
"array do mesmo tamanho, nunca lança"), então um chunk que falha não aborta o
`translateBatch` inteiro nos vídeos multi-chunk — só economiza as chamadas.

Testes novos (`openai-compatible.test.ts`): ordem preservada no sucesso, teto de
concorrência respeitado, abort limita o total de chamadas (`≤ abortAfter +
concorrência`, não 40) e não aborta quando já houve sucesso. `pnpm test`
(21 llm) + `pnpm typecheck` (8/8) verdes.

## Esforço / prioridade

**S · média.** Só aparece no caminho de falha, mas é onde custo e rate limit
mais doem; o fix é pequeno e testável no padrão dos testes existentes do
provider.

## Referências

- `packages/llm/src/providers/openai-compatible.ts:69-116`
- `packages/llm/src/prewarm.ts:58-79` (`runPool` reutilizável)
- Relacionado: [translation-pump-no-circuit-breaker.md]
