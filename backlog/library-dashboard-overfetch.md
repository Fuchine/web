# backlog: Dashboard e biblioteca buscam muito mais do que renderizam

**Date:** 2026-07-06
**Feature:** Biblioteca / Dashboard (F1)
**Status:** DONE (2026-07-06; partes 1 e 2 primeiro, parte 3 em 2026-07-07)

---

## Problema

As duas páginas mais visitadas pagam queries pesadas para exibir números
simples:

1. **Badge "review due" carrega a fila inteira.** `app/page.tsx:18` e
   `app/library/page.tsx:17` chamam `getReviewQueue(db, userId)` — join de
   `sentence_cards` ⋈ `subtitle_lines` ⋈ `videos` com `tokens` jsonb, mais um
   segundo query de `word_entries` (definições completas) — só para usar
   `queue.length` no badge da sidebar.
2. **Dashboard puxa a biblioteca inteira para 1 card.** `app/page.tsx:16`
   chama `listVideos(db)` (todos os vídeos + `count` de `subtitle_lines` via
   join na tabela inteira) para usar apenas `rows[0]` no "Continue watching".
3. **StatBar da biblioteca roda `getStats` completo.** `app/library/page.tsx:19`
   executa as ~8 queries da agregação de stats — incluindo o scan sem limite de
   `review_logs` (ver [stats-unbounded-review-scan.md]) — para mostrar 4 KPIs.

Impacto: TTFB do dashboard e da biblioteca cresce com o tamanho do histórico e
do catálogo, em toda navegação, para dados que cabem em 3 queries baratas.

## Proposta

1. `countDueCards(db, userId)`: `SELECT count(*) FROM sentence_cards WHERE
   user_id = $1 AND due <= now()` (o índice `sentence_cards_user_due_idx` já
   cobre). Usar no badge das duas páginas.
2. `getLatestVideo(db)`: o mesmo select de `listVideos` com `LIMIT 1` e sem o
   join de contagem (o dashboard não mostra lineCount).
3. Extrair um `getLibraryKpis(db, userId)` enxuto (watch time de
   `user_daily_stats`, wordsKnown por `count` de state=2, streak — junto do fix
   de [stats-unbounded-review-scan.md]) em vez de `getStats` inteiro.

## Estado

- **Parte 1 (feita).** `countDueCards(db, userId)` em `lib/cards.ts` — `count(*)`
  coberto por `sentence_cards_user_due_idx`, substitui `getReviewQueue().length`
  no badge do dashboard (`app/page.tsx`) e da biblioteca (`app/library/page.tsx`).
  **Nota de semântica:** o badge agora mostra o backlog real de cards vencidos,
  não o comprimento da fila da sessão (que era capado em 20 e por metas diárias).
- **Parte 2 (feita).** `getLatestVideo(db)` em `lib/study.ts` — `LIMIT 1` sem o
  join de contagem; o dashboard não usa mais `listVideos` só para `rows[0]`.
- **Parte 3 (feita, 2026-07-07).** `getLibraryKpis(db, userId)` em `lib/stats.ts`
  substitui `getStats` na biblioteca (`app/library/page.tsx`). Só **2 queries**
  (count de cards `state=2` + 1 linha por dia ativo de `user_daily_stats`) contra
  as ~6 do `getStats` (retention, scan do heatmap em `review_logs`, join de top
  sources, knownDelta) — nenhuma delas usada pelo StatBar. Os 3 números
  (`watchTimeHours`, `wordsKnown`, `dayStreak`) são derivados exatamente como no
  `getStats` (mesma definição de dia ativo, reusa `computeStreaks`), então o que
  aparece na tela não muda. A conta de horas virou o helper puro `watchHoursLast7`
  (testado; `getStats` também passou a reusá-lo). Depende de
  [stats-unbounded-review-scan.md] (já feito): sem os scans O(histórico), a fonte
  de dias ativos é `user_daily_stats`. `pnpm test` (124 web, +4) e `pnpm typecheck`
  (8/8) verdes.

## Esforço / prioridade

**S · alta.** Poucas linhas, afeta o caminho quente de toda sessão de uso.

## Referências

- `apps/web/app/page.tsx:15-19`, `apps/web/app/library/page.tsx:16-21`
- `apps/web/lib/cards.ts:67-118` (`getReviewQueue`), `lib/study.ts:14-33`
- Relacionados: [stats-unbounded-review-scan.md], [unpaginated-lists.md]
