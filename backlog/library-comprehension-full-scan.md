# backlog: Comprehension da biblioteca varre word_examples inteiro por request

**Date:** 2026-07-06
**Feature:** Biblioteca (F1) — indicador de compreensão
**Status:** DONE (2026-07-07)

---

## Problema

`getComprehensionByVideo` (`apps/web/lib/study.ts:46-73`) agrega **todos os
`word_examples` de todos os vídeos** (`GROUP BY video_id`, sem `WHERE`) a cada
load da biblioteca:

1. **Sem índice utilizável:** `word_examples` só tem índice por `wordEntryId` e
   o unique `(wordEntryId, subtitleLineId)` (`packages/db/src/schema.ts:215-218`).
   `GROUP BY videoId` = seq scan + hash aggregate da tabela inteira.
2. **A tabela cresce com o catálogo global, não com o usuário.** No modelo de
   cache compartilhado (D3), `word_examples` acumula ~200–400 linhas por vídeo
   importado por *qualquer* usuário. Com 500 vídeos são ~150k linhas varridas e
   re-agregadas em **cada** render da biblioteca, por usuário.
3. Recalcula tudo mesmo para vídeos fora da tela (hoje não há paginação — ver
   [unpaginated-lists.md]).

## Proposta

Em ordem de retorno por esforço:

1. **Índice em `word_examples (video_id, word_entry_id)`** — aditivo, passa
   pelo ERD; serve o `GROUP BY` e o `count(distinct)`. (Também acelera o
   cascade delete de vídeos.)
2. **Escopar aos vídeos exibidos:** aceitar `videoIds: string[]` e filtrar
   `WHERE video_id IN (...)` — casa com a paginação da biblioteca quando ela
   existir.
3. Se ainda pesar: cachear o resultado por usuário com TTL curto
   (`unstable_cache`/revalidate ~60s) — compreensão não muda de segundo em
   segundo.

## Resolução (2026-07-07)

Itens 1 e 2 feitos:

1. **Índice** `word_examples (video_id, word_entry_id)`
   (`word_examples_video_word_idx`) em `schema.ts` + migration
   `drizzle/0012_quick_smasher.sql`. Serve o `GROUP BY video_id` +
   `count(distinct word_entry_id)` e acelera o cascade delete por vídeo.
   **Rodar `pnpm db:migrate` no deploy.**
2. **Escopo por vídeos exibidos.** `getComprehensionByVideo(db, userId, videoIds?)`
   filtra `WHERE video_id IN (...)` quando os ids são passados (array vazio ⇒
   mapa vazio, sem query). `app/library/page.tsx` agora busca `listVideos`
   primeiro e passa os ids (as outras 5 queries seguem em paralelo — nenhuma
   depende da comprehension); `app/albums/[id]` escopa aos vídeos do álbum. O
   E2E (`e2e-comprehension.ts`) usa a forma sem escopo — segue válido (param
   opcional).

Item 3 (cache com TTL) não foi necessário: índice + escopo já tiram o custo
O(catálogo) do request. `pnpm typecheck` (8/8) verde; o ganho de plano da query
depende de banco (não medido aqui).

## Esforço / prioridade

**M · alta.** Hoje é o custo O(catálogo) mais claro do request da biblioteca; o
índice sozinho já é ganho imediato com risco zero.

## Referências

- `apps/web/lib/study.ts:46-73`, `apps/web/app/library/page.tsx:18`
- `packages/db/src/schema.ts:201-219` (índices de `word_examples`)
- Relacionados: [unpaginated-lists.md], [library-dashboard-overfetch.md]
