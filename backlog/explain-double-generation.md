# backlog: explainLineCached sem single-flight — prefetch × pre-warm geram 2×

**Date:** 2026-07-06
**Feature:** Custos de IA (camada 2)
**Status:** RESOLVED (2026-07-09) — single-flight em `explainLineCached`: o miss
roda numa transação sob `pg_advisory_xact_lock(hashtext(lineId:kind:lang:version))`
e re-checa o cache ao adquirir o lock; o segundo chamador concorrente (pre-warm ×
prefetch) acorda no hit em vez de gerar de novo. Fast-path de leitura sem
transação preservado para o caminho comum (cache quente). E2E estendido (missas
concorrentes → 1 chamada de provider) — 18/18 green.

---

## Problema

`explainLineCached` (`packages/llm/src/cache.ts:75-99`) é *check-then-generate*
sem claim: dois chamadores que erram o cache ao mesmo tempo geram a mesma linha
duas vezes (o segundo `saveExplanation` sobrescreve — dinheiro fora, resultado
idêntico).

O cenário não é teórico, é o fluxo normal de um vídeo recém-importado:

- O **worker** roda o pre-warm do vídeo inteiro (pool interno de 2,
  `apps/worker/src/index.ts:40-56`);
- ao mesmo tempo o **player** do usuário que importou prefetcha 3 slots à
  frente da linha focal (`packages/ui/src/components/Player/Player.tsx:79`,
  `PREFETCH_CONCURRENCY = 3`).

Ambos caminham pela mesma região do vídeo → dezenas de linhas geradas em
duplicidade por sessão de estudo pós-import. O dedupe do player
(`pendingExplainRef`) só vale dentro de uma aba; não enxerga o worker nem outra
aba/usuário.

## Proposta

Single-flight no ponto único de geração (`explainLineCached`), sem mudança de
schema: envolver o miss em **`pg_advisory_xact_lock(hashtext(lineId || lang ||
version))`** — quem chega segundo bloqueia, re-checa o cache ao acordar e serve
o hit. Custo: uma round trip extra só no miss.

Alternativa menor (não exclui a primeira): o player pular o prefetch quando o
payload do vídeo indicar pre-warm em andamento (worker ainda cobrindo o vídeo)
— mas isso não protege o caso duas-abas/dois-usuários.

## Esforço / prioridade

**M · média.** Corta um desperdício real e recorrente (cada duplicata ≈ o custo
de uma linha explicada); vira mais relevante conforme o pre-warm for limitado
([prewarm-cost-per-import.md]) e mais tráfego cair no caminho on-demand.

## Referências

- `packages/llm/src/cache.ts:75-99`, `packages/llm/src/prewarm.ts:135-139`
- `packages/ui/src/components/Player/Player.tsx:521-555` (pumpPrefetch)
- Relacionados: [prewarm-cost-per-import.md], [ai-endpoints-no-rate-limit.md]
