# backlog: Library — Save/Hide/Not interested não persistem

**Date:** 2026-07-04
**Feature:** Biblioteca (F1)
**Status:** OPEN — bloqueado em decisão de schema

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
