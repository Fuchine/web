# backlog: Export .apkg (Anki) — botão morto em Settings

**Date:** 2026-07-04
**Feature:** Data / Export (Settings)
**Status:** OPEN — backend inexistente

---

## Problema

Em `/settings` → grupo "Data", o botão **"Export deck — Download your mined
cards as an Anki package"** (`settings-view.tsx`) não tem `onClick` nem
endpoint. Não existe nenhuma lib/rota de export no app.

## O que precisa

1. **Decidir o formato**: `.apkg` de verdade (SQLite zipado — lib tipo
   `anki-apkg-export` ou genanki-js; checar licença/manutenção) vs começar com
   um export simples (CSV/TSV compatível com import do Anki) e evoluir.
2. Rota `GET /api/export/deck` (auth): monta o deck a partir de
   `sentence_cards` JOIN `subtitle_lines` JOIN `videos` — frente = frase JP
   (áudio não existe: D2 proíbe armazenar mídia; o clipe é link para o vídeo
   com timestamp), verso = tradução + leitura + notas.
3. Ligar o botão (download via blob) e estados de vazio (sem cards).

**Atenção D2**: nunca anexar áudio/vídeo ao deck — só texto e o link
`youtube.com/watch?v=...&t=`.

## Referências

- `settings-view.tsx` (grupo "Data"); "Sign out" ao lado também está sem
  handler (fiação trivial via `signOut()` do next-auth — mesma passada).
