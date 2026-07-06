# backlog: Library — tabs de categoria são decorativas

**Date:** 2026-07-04 · **Updated:** 2026-07-05
**Feature:** Biblioteca (F1)
**Status:** RESOLVED (2026-07-05) — heurística v1; upgrade opcional

---

## Resolução (2026-07-05)

Decisão: **coluna `videos.category text` nullable** (migration `0011`),
classificada no worker por **heurística de palavras-chave** (sem API key, sem
custo de LLM). `apps/worker/src/category.ts` (`classifyCategory`, puro e testado
em `category.test.ts`) casa título+canal (JP+EN) contra os buckets das tabs;
retorna null quando não tem certeza (nunca esconde vídeo por chute errado —
regra específica antes de broad, ex.: VTuber antes de Gaming). Ligado no
pipeline (grava no fim do import, preserva categoria existente). `listVideos`
expõe a coluna e a biblioteca filtra de verdade:
`if (cat !== "All" && v.category !== cat) return false`.

## Residual

- **Vídeos antigos** ficam sem categoria até reprocessar (não há
  `backfill:category` ainda — seguir o padrão de `backfill:level`).
- **Precisão da heurística** é modesta; um upgrade (YouTube category API via
  extensão, ou LLM barato na camada 1) pode entrar atrás do mesmo
  `classifyCategory`.

---

## Problema

As tabs da biblioteca (Gaming, Music, Variety, VTuber, Vlog, ...) vêm de uma
lista estática `CATEGORIES` em `library-view.tsx`, e o filtro é literalmente:

```ts
if (cat !== "All") return false; // qualquer tab ≠ All mostra vazio
```

Não existe coluna de categoria em `videos` nem qualquer classificação no
pipeline de import.

## O que precisa

1. **Decisão:** de onde nasce a categoria?
   - Coluna `category` em `videos` classificada no import (worker) — via
     YouTube category API (a extensão tem acesso ao contexto da página),
     heurística por título/canal, ou LLM barato na camada 1;
   - ou tags por usuário (outra tabela);
   - ou remover as tabs até a Fase 2 (recomendações).
2. Depois: schema/migration (se coluna), classificação no worker, filtro real
   na query (`listVideos`) e nas tabs.

## Referências

- `library-view.tsx` (`CATEGORIES`, filtro em `list`)
- `videos` em `packages/db/src/schema.ts` (sem coluna de categoria hoje)
