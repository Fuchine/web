# backlog: Export (Anki) — botão morto em Settings

**Date:** 2026-07-04 · **Updated:** 2026-07-05
**Feature:** Data / Export (Settings)
**Status:** RESOLVED via TSV (2026-07-05); `.apkg` de verdade fica como upgrade

---

## Resolução (2026-07-05)

Escolhido o **caminho TSV** (o backlog autorizava começar simples e evoluir):

- `lib/export.ts` — `buildDeckTsv` (puro, testado em `export.test.ts`) monta um
  arquivo Anki-importável com header de diretivas (`#separator:tab`,
  `#html:true`, `#columns:Expression\tMeaning\tNotes\tSource`). Campos são
  achatados (tab→espaço, newline→`<br>`) pra não quebrar a grade. `getDeckCards`
  faz o `sentence_cards` JOIN `subtitle_lines` JOIN `videos`.
- Rota `GET /api/export/deck` (auth) — devolve o TSV como
  `attachment; filename="fuchine-deck-<data>.txt"`. Deck vazio → só o header.
- `settings-view.tsx` — botão "Export deck" agora baixa de `/api/export/deck`;
  "Sign out" ao lado ligado a `signOut({ callbackUrl: "/login" })`.

**D2 respeitado**: só texto; o clipe vai como link
`youtube.com/watch?v=...&t=<s>` (coluna Source), nunca mídia anexada.

## Upgrade futuro (não bloqueia)

- **`.apkg` de verdade** (SQLite zipado — `anki-apkg-export`/genanki-js; checar
  licença/manutenção) se o TSV se mostrar insuficiente (ex.: decks com modelo
  de cartão próprio, tags, agendamento).
- **Verso com leitura da frase**: hoje o verso é a tradução; a leitura por
  token existe em `tokens` mas não há leitura agregada da linha (mesma limitação
  do cloze do summary).
