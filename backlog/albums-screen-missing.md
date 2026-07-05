# backlog: Página /albums — backend pronto, tela não existe

**Date:** 2026-07-04
**Feature:** Álbuns (F2)
**Status:** OPEN — destravado (só UI + fiação)

---

## Contexto

O CRUD de álbuns shipped em 2026-07-04: `GET/POST /api/albums`,
`PATCH/DELETE /api/albums/[id]`, `POST/DELETE /api/albums/[id]/videos`
(`lib/albums.ts`, E2E em `scripts/e2e-albums.ts`). A biblioteca já tem o modal
"Add to album" com criação inline. A sidebar mostra "Albums" com badge
**SOON** e sem rota.

## O que falta

1. **Página `/albums`**: grade de álbuns (nome, contagem, capa = thumbnail do
   primeiro vídeo?), criar/renomear/excluir, e a visão de um álbum com seus
   vídeos (remover vídeo, ir pro player). Tirar o "SOON" da sidebar.
2. **Álbum como filtro** (inventário): na biblioteca, na lista de frases e no
   Stats ("tempo por álbum").
3. **Minerar → escolher álbum/coleção** (estado "frase minerada" do player, no
   inventário) — hoje o card mina sem escolha de destino.

O design das telas sai pelo fluxo do Claude Design (ver
`docs/PROMPT_PACK_TELAS.md` / `screens.md`).

## Referências

- Backend: `lib/albums.ts`, rotas em `app/api/albums/`
- Schema: `albums` + `album_videos` (PK composta) em `packages/db`
