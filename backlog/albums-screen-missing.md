# backlog: Página /albums — backend pronto, tela não existe

**Date:** 2026-07-04 · **Updated:** 2026-07-05
**Feature:** Álbuns (F2)
**Status:** RESOLVED (2026-07-05) — telas /albums e /albums/[id] shipadas

---

## Resolução (2026-07-05)

Telas construídas **pixel-perfect** a partir de `claude-design/albums.*` e
`album-detail.*` (CSS portado 1:1 para `app/albums/albums.css` e
`app/albums/[id]/album-detail.css`; tokens do design são idênticos aos do
`@fuchine/ui` theme-map, verificado). Sidebar reusa o `AppShell` (badge "SOON"
removido em `nav.tsx`; Albums agora navega para `/albums`).

- **/albums**: grade com tile "New album", cards com capa em mosaico (tons
  determinísticos por id de vídeo), contagem, pin, words + % de compreensão
  reais. Modal "New album" com nome/descrição/cor de capa e picker de vídeos da
  biblioteca → `POST /api/albums` + `POST /api/albums/[id]/videos`. Menu do card:
  open, pin (`PATCH {pinned}`), rename inline (`PATCH {name}`), duplicate
  (cria cópia + membros), remove (`DELETE`).
- **/albums/[id]**: hero (capa, título, pin, descrição, meta videos·words·
  runtime, barra de compreensão), lista de vídeos com anel de compreensão real +
  level + duração, remover-do-álbum, play. Empty state. Menu do hero: play, pin,
  duplicate, remove (com confirm).
- **Backend**: `listAlbumsForView` (covers + words + pct de compreensão),
  `getAlbumDetail`, e `pinned` em `parseAlbumInput`/`updateAlbum` (usa a coluna
  `pinnedAt` já existente — sem migration).

## Desvios honestos (dados que o app ainda não tem)

- **Progresso de watch por vídeo** não é rastreado (só `user_daily_stats` por
  dia), então o design "% watched / Watched / Not started" por linha foi
  **omitido**; o anel mostra **compreensão** (real) e a barra do hero é
  **% de compreensão** do álbum (não "% complete"). Fechar quando houver
  progresso por vídeo.
- Itens do menu do design sem backing ("Edit details", "Download offline · Pro")
  foram deixados de fora; só ações funcionais entraram.

## Residual (do inventário, fora desta tela)

1. ~~**Álbum como filtro** na biblioteca~~ — **FEITO 2026-07-05**. Seção
   "Album" no dropdown de Filter da biblioteca (`getAlbumMemberships` +
   `library-view`); a grade filtra pelos vídeos do álbum, o heading vira o nome
   do álbum, e o botão Filter fica ativo. (phrases/stats ainda podem ganhar o
   mesmo filtro depois.)
2. ~~**Minerar → escolher álbum/coleção** no player~~ — **FEITO 2026-07-05**.
   Como álbuns colecionam **vídeos** (não há deck de cards no schema), o card
   minerado agora oferece **"Add video to album"** com chips dos álbuns do
   usuário (`MinedCard` + `Player` → `POST /api/albums/[id]/videos`).

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
