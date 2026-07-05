# backlog: Library — tabs de categoria são decorativas

**Date:** 2026-07-04
**Feature:** Biblioteca (F1)
**Status:** OPEN — bloqueado em decisão de schema/pipeline

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
