# backlog: Library — Save/Hide/Not interested não persistem

**Date:** 2026-07-04 · **Updated:** 2026-07-05
**Feature:** Biblioteca (F1)
**Status:** RESOLVED (2026-07-05)

---

## Resolução (2026-07-05)

Decisão: **uma tabela de flags** (segue o precedente de albums), com
`not_interested` distinto de `hidden` pra poder alimentar recomendação (F2) —
hoje ambos escondem o card. `user_video_flags(user_id, video_id, flag,
created_at)` com PK composta + enum `video_flag` (migration `0009`).

- `lib/video-flags.ts`: `setVideoFlag`/`clearVideoFlag` (idempotentes) e
  `getVideoFlags` → `{ saved, hidden }` (hidden = hidden ∪ not_interested).
- Rota `POST/DELETE /api/videos/[id]/flags` com `{ flag }` validado.
- `library/page.tsx` hidrata `initialSaved`/`initialHidden`; `library-view.tsx`
  usa como estado inicial e persiste cada ação (save toggla, hide/not-interested
  POSTam com undo que faz DELETE). Sobrevive ao reload.

---

## Problema

No menu do card da biblioteca (`apps/web/app/library-view.tsx`), três ações são
só `useState` local e somem no reload:

- **Save for later** — toggle no set `saved`
- **Hide video** — set `hidden` (com toast + undo)
- **Not interested** — idem, mensagem diferente

Não existe tabela no schema para interação usuário↔vídeo (algo como
`user_video_flags(user_id, video_id, flag, created_at)` com PK composta).
`videos` é shared-cache (sem user_id), então o flag é necessariamente uma
tabela própria.

## O que precisa

1. **Decisão de schema** (CLAUDE.md: mudanças saem do ERD, não improvisar):
   uma tabela de flags ou três booleans? "Not interested" alimenta recomendação
   (Fase 2) ou é só hide com outro rótulo?
2. Depois: migration + lib + rotas (`POST/DELETE /api/videos/[id]/flags`?) +
   hidratar o estado inicial no server component da biblioteca.

## Referências

- Menu: `library-view.tsx` (`onAction` — casos `save`/`hide`/`not-interested`)
- Padrão a seguir: albums (`lib/albums.ts` + `/api/albums`), shipped 2026-07-04
