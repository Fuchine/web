# backlog: Biblioteca e lista de frases sem paginação

**Date:** 2026-07-06
**Feature:** Biblioteca (F1) / Phrases (F2)
**Status:** CLOSED (2026-07-10) — backend paginado: `listVideos` e `listPhrases` agora aceitam `{ limit, cursor }` e retornam `{ items, nextCursor }`. `listVideos` trocou o `leftJoin + count` por subquery lateral (conta só a página). API `GET /api/videos?cursor=...&limit=24` suporta infinite scroll. Frontend SSR usa primeira página (24bib / 50frases); infinite scroll no client é follow-up.

---

## Problema

Duas listas centrais carregam o dataset inteiro em toda visita:

1. **`listVideos`** (`apps/web/lib/study.ts:14-33`): todos os vídeos com
   `count(subtitle_lines.id)` via `LEFT JOIN` — o join varre a tabela de linhas
   inteira (600+ linhas por vídeo) só para contar. O payload da biblioteca (e o
   filtro/sort client-side em `library-view.tsx`) cresce linearmente com o
   catálogo — que no modelo de cache compartilhado é global, não do usuário.
2. **`listPhrases`** (`apps/web/lib/phrases.ts:21-43`): todos os cards minerados
   do usuário com join triplo, sem `LIMIT`. Um usuário assíduo acumula milhares
   de cards em meses.

## Proposta

- Cursor por `(createdAt, id)` + `LIMIT` (~24 na grade da biblioteca, ~50 nas
  frases), com infinite scroll no client — o padrão já existe no dictionary
  browse (cursor `l:<length>:<id>`), é só replicar.
- Na `listVideos`, trocar o join de contagem por subquery lateral
  (`(SELECT count(*) FROM subtitle_lines sl WHERE sl.video_id = v.id)`) para
  contar só os vídeos da página.
- Search/sort/filtro por categoria continuam client-side dentro da página até a
  Fase 2; mover para a query quando a paginação chegar.

## Esforço / prioridade

**M · média.** Hoje (catálogo pequeno) o custo é baixo; vira problema junto com
a biblioteca pública da F2. Fazer junto com
[library-comprehension-full-scan.md] para escopar as duas queries de uma vez.

## Referências

- `apps/web/lib/study.ts:14-33`, `apps/web/lib/phrases.ts:21-43`
- `apps/web/app/library-view.tsx` (filtro/sort client-side)
- Padrão de cursor: `apps/web/app/api/dictionary/browse/route.ts`
