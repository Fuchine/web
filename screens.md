# Fuchine — guia para gerar telas (handoff para IA de design/código)

Este documento explica **como geramos as telas do Fuchine** para que outra IA
(ex.: MiniMax) produza novas telas **consistentes** com o que já existe. Leia
inteiro antes de gerar qualquer tela.

## O produto, em uma frase

Fuchine é um app open-core de **aprendizado de japonês por imersão em vídeo**:
importar vídeo do YouTube → assistir com **legendas duplas** (tokenização,
dicionário pop-up, explicação de IA por linha) → **minerar frases** → **revisar
com SRS (FSRS)**. Todo texto de UI é em **inglês**. (Detalhe do produto em
`docs/ARQUITETURA.md`, telas em `docs/INVENTARIO_TELAS.md` e
`docs/PROMPT_PACK_TELAS.md`.)

## Sistema visual — "ma minimalism" 藍

Calmo, espaçoso e funcional (tipo Linear/Notion) com sensibilidade japonesa:
muito espaço negativo (間), tipografia refinada, contenção. A cor de marca é um
**índigo japonês profundo (藍)** numa escala; neutros **quentes**; o japonês é
**conteúdo real** (nunca decoração). Nada de cores vibrantes. Tema claro e
escuro.

A **fonte da verdade** do visual são os tokens em
`packages/ui/src/styles/tokens.css` (vars CSS, light + dark) mapeados para o
Tailwind v4 em `packages/ui/src/styles/theme-map.css`.

## Como geramos telas: **component-first**

1. Construímos **componentes** num design system isolado: **`packages/ui`**
   (React + **Tailwind v4** + **Storybook**).
2. Cada componente é validado no **Storybook** (`pnpm --filter @fuchine/ui
   storybook`) em claro/escuro antes de compor telas.
3. As **telas** são compostas a partir desses componentes e ligadas às APIs
   reais em **`apps/web/app`** (Next.js App Router).

**Portanto: não reinvente estilos.** Gere telas **reusando os componentes e os
utilitários de token já existentes**. Se faltar um primitivo, proponha o
componente novo (com story) em `packages/ui` em vez de estilizar inline com
cores cruas.

## O que você deve produzir

- **React + TypeScript + Tailwind v4** (sem CSS novo; use utilitários de token).
- **Reuse `@fuchine/ui`** (importe de `@fuchine/ui`): veja a lista abaixo.
- Componentes reutilizáveis (faixa de legenda, popup, painel, etc.) → em
  `packages/ui/src/components/<Nome>/<Nome>.tsx` **com uma `.stories.tsx`**
  cobrindo os estados (e claro/escuro).
- Telas roteadas → `apps/web/app/<rota>/page.tsx`, compondo os componentes e
  consumindo as APIs (shapes abaixo). Componentes com interação/estado levam
  `"use client"`.
- Texto de UI **em inglês**. Japonês usa a classe `.jp` (line-height CJK).

## Utilitários de token disponíveis (Tailwind)

Cores (use como `bg-*`, `text-*`, `border-*`):
`bg`, `bg-2`, `surface`, `fg` (texto principal), `muted`, `faint`, `border`,
`border-strong`, `field`, `field-2`, `accent`, `accent-hover`, `accent-press`,
`accent-soft`, `accent-soft-2`, `accent-line`, `accent-ring`, `on-accent`,
`link`, `indigo`, `indigo-2`, `indigo-deep`, `on-indigo`, `ok`, `ok-soft`,
`error`.

Raio: `rounded-sm` 8px · `rounded` 11px · `rounded-lg` 16px · `rounded-xl` 22px.
Easing calmo: `ease-[var(--ease)]`. Japonês: classe `.jp`.
Dark theme: automático via `[data-theme=dark]` (não hardcode cores).

Exemplos: botão primário = `bg-accent text-on-accent`; link = `text-link`;
superfície = `bg-surface border border-border`; chip POS = `text-link
bg-accent-soft-2`.

## Componentes já prontos (importe de `@fuchine/ui`)

- **Button** (`primary | ghost | quiet`, `sm|md`, `loading`, `icon`, `fullWidth`)
- **Input** / **TextField** (label, error, helper, `leadingIcon`, `invalid`)
- **Badge** (`neutral|indigo|ok|warning|error`, `dot`, `pill`) — POS, JLPT, status
- **Card** (`muted`, `interactive`, `padding`)
- **Avatar** (iniciais, gradiente índigo)
- **SectionHeading** (label uppercase + ação)
- **AppShell** (sidebar colapsável + conta + nav com badge; área principal)
- **BrandPanel** (o campo índigo com o herói 淵) — usado no Login
- **VideoCard** (thumb, LVL, duração, progresso, comprehension ring/text, overflow)
- `cn()` (junta classes)

Veja `packages/ui/src/components/**` como **referência de estilo exata**.

## Telas: prontas vs. a fazer

Prontas: **Login** (`/login`) e **Home/Library** (`/`, hub de vídeos com
`AppShell` + `VideoCard`).

A fazer (ordem do `docs/PROMPT_PACK_TELAS.md`):
- **Player** (tela coração): repouso (vídeo + legendas duplas + transcript +
  controles), popup de dicionário, painel de explicação IA, frase minerada.
- **Review (SRS)**: pergunta (clipe toca), resposta + 4 notas (Again/Hard/Good/
  Easy com intervalos), fim de sessão.
- **Settings**, **Dictionary** (busca), **Phrases**, **Albums**, **Stats**,
  **Import** (modal), **Extension popup**, **estados vazios/erro**.

Os prompts detalhados de cada tela (layout, estados) estão em
`docs/PROMPT_PACK_TELAS.md` — use-os como briefing, mas renderizando no nosso
sistema/componentes.

## Dados e APIs por tela (o backend já existe e está testado)

- **Home/Library** → `GET /api/videos` → `{ videos: [{ id, title, channel,
  durationS, status, levelEstimate, lineCount, ... }] }`
- **Player** → `GET /api/videos/[id]` → `{ video, lines: [{ id, idx, tStartMs,
  tEndMs, textOriginal, textTranslation, tokens: Token[] }] }`. Cada `Token` tem
  `{ surface, lemma, reading, pos, wordEntryId|null }`.
- **Dicionário (popup/busca)** → `GET /api/dictionary?id=<wordEntryId>` ou
  `?q=<texto>` → entrada(s) com `{ lemma, reading, pos, definitions:
  [{ glosses[], partsOfSpeech[], tags? }], frequencyRank }`.
- **Explicar linha (camada 2)** → `POST /api/lines/[id]/explain` →
  `{ explanation: { summary, grammarPoints: [{ pattern, level(N5–N1|null),
  explanation }], nuance|null }, cached }`. (Formato em `docs/CONTRATO_IA.md`.)
- **Minerar** → `POST /api/cards` `{ subtitleLineId }` → cria card (dedup).
- **Revisão** → `GET /api/review/queue` → cards due `{ cardId, clip:{ source,
  sourceId, startMs, endMs }, sentence:{ text, translation }, intervals }`;
  `POST /api/review/[cardId]` `{ grade: 1|2|3|4 }`.

## Regras de ouro

1. **Não invente cores** — só os tokens acima (o índigo 藍 carrega o sistema).
2. **Reuse `@fuchine/ui`**; novos primitivos entram em `packages/ui` com story.
3. **Calmo e espaçoso** — espaço negativo generoso, cantos suaves, sem ruído.
4. **Japonês = conteúdo** com `.jp`, bem separado da tradução.
5. **UI em inglês.** Claro e escuro devem funcionar (via tokens, sem hardcode).
6. **Player é uma tela, vários estados** — herde o layout-base, não recrie.

## Como rodar para validar

```bash
pnpm --filter @fuchine/ui storybook   # componentes (claro/escuro)
pnpm --filter @fuchine/web dev        # app real (http://localhost:3000)
```
