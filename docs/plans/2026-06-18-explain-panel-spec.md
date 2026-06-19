# Painel Explain (camada 2) — Design

**Data:** 2026-06-18 · **Status:** aprovado (design) · **Camada:** 2 (explicação)

## Objetivo

Construir o **painel Explain** do player (aba na rail direita) que mostra a
explicação da linha por IA — fiel ao mockup (`claude-design/player.jsx`
`ExplainPanel`, `screenshots/explain.png`): um **breakdown parte-a-parte** da
frase + uma prosa "in plain terms". O backend da camada 2 já existe
(`explainLine` + cache + `POST /api/lines/[id]/explain`), mas o **shape de saída
é mais pobre** que o mockup e a explicação **falha hoje** (sem tela de Settings,
o cache-miss retorna 422 `needsKey`).

## Decisões (aprovadas)

| Decisão | Escolha |
|---|---|
| Contrato | **Enriquecer** para `{ breakdown, plainTerms }`; `prompt_version = 2` |
| Provider no cache-miss | **House-key fallback**: BYOK se houver, senão house key (env `LLM_*`) |
| Rodapé | **Regenerate** (funcional, force) + **Save note** (na tela, **inerte** — sem tabela) |
| Entrada | Aba **Explain** na rail + botão **Explain** sob a legenda focal |

## 1. Contrato enriquecido (`prompt_version = 2`)

Substitui o `Explanation` atual (`packages/db/src/types.ts`):

```ts
export type PartTag =
  | "noun" | "verb" | "adjective" | "adverb" | "particle" | "grammar" | "expression";

export type ExplanationPart = {
  surface: string;     // trecho em japonês; pode abranger vários tokens (歩いて います)
  tag: PartTag;        // categoria p/ o chip da UI
  gloss: string;       // rótulo curto em explanation_language ("every morning")
  note: string;        // uma frase de explicação em explanation_language
  accent?: boolean;    // a parte mais importante, destacada
};

export type Explanation = {
  breakdown: ExplanationPart[]; // percurso ordenado das partes salientes (teto 8)
  plainTerms: string;           // prosa "in plain terms" em explanation_language
};
```

Removidos: `GrammarPoint`, `JlptLevel`, `summary`, `nuance`, `grammarPoints`. (O
topo do painel mostra a frase JA + a tradução EN que já vêm do player; não há
`summary` da IA. JLPT não aparece no mockup.)

**Ripple a ajustar** (todos consumidores do shape antigo):
- `packages/llm/src/contract.ts` — re-exports + `PROMPT_VERSION = 2`.
- `packages/llm/src/prompts.ts` — `buildExplainMessages` pede o shape novo.
- `packages/llm/src/providers/openai-compatible.ts` — reescrever
  `coerceExplanation` (validar `tag` contra o enum, cap 8 em `breakdown`,
  coagir strings); remover `coerceLevel`/`MAX_GRAMMAR_POINTS`.
- Qualquer teste do pacote llm que referencie o shape antigo.

O cache `ai_explanations` é chaveado por `prompt_version`; v1 órfão fica
inofensivo (§5.3). **Sem migration de schema** (a coluna `content` é jsonb).

## 2. Provider house-key fallback (`apps/web/lib/explain.ts`)

No cache-miss: tentar `resolveUserProvider` (BYOK); se `MissingApiKeyError`,
cair para o **house provider** (mesmas envs do worker/tradução). Só retorna
erro de chave se o house provider também não estiver configurado (`echo`/sem
key → `explainLine` lança `ProviderError` → 502, painel mostra erro).

Extrair `houseProvider()` (hoje em `apps/web/lib/translate.ts`) para um módulo
compartilhado `apps/web/lib/house-provider.ts`; `translate.ts` e `explain.ts`
ambos importam de lá.

> Pequeno desvio do CONTRATO §6.2 (camada 2 = BYOK). Justificativa: não há tela
> de Settings ainda; o self-host já paga a house key na tradução. BYOK continua
> tendo prioridade quando configurado. Documentar no CONTRATO §4.

## 3. Regenerate (force)

`explainLine` (lib) e a rota aceitam `force?: boolean`. Com `force`: ignora o
cache na leitura, gera fresco e **sobrescreve** a linha do cache
(`onConflictDoUpdate` em `saveExplanation`, em vez de `onConflictDoNothing`).
Rota: `POST /api/lines/[id]/explain` body `{ force?: boolean }`.

## 4. UI (`packages/ui` + `apps/web`)

### Rail com abas
Hoje `PlayerTranscript` É a `<aside class="rail">` inteira, com a tab-bar fixa
de uma aba só. Refatorar: a tab-bar e o switch sobem para o `Player` (ou um
`PlayerRail`); a rail renderiza `PlayerTranscript` (sem sua tab-bar própria) ou
o novo `PlayerExplain` conforme `activeRailTab: "transcript" | "explain"`.

### `PlayerExplain.tsx` (novo, em `packages/ui`)
Props: a linha focal (`id`, tokens p/ destaque, `textOriginal`, tradução),
`explanation: Explanation | null`, `loading`, `error`, `onRegenerate`,
`onSaveNote` (no-op). Renderiza:
- topo: frase JA (com a palavra focal destacada) + tradução EN;
- "Generated breakdown · Grammar" + lista de `breakdown` (chip do `tag`, `gloss`,
  `note`, destaque em `accent`);
- "In plain terms" + `plainTerms`;
- rodapé: **Regenerate** (chama `onRegenerate`) e **Save note** (presente, desabilitado/inerte).
- estados: loading (gerando…), erro (com retry), empty (sem linha focal).

### Estado no `Player`
- `activeRailTab` (default "transcript").
- Cache local de explicações por `lineId` + flags de loading/erro.
- Callback injetado `onFetchExplanation?: (lineId: string, opts?: { force?: boolean }) => Promise<Explanation>`
  (a parte de rede vive em `apps/web`, igual ao `onFetchChunk`).
- Ao abrir a aba Explain ou clicar no botão "Explain" focal: busca a explicação
  da linha focal atual se ainda não carregada; Regenerate chama com `force`.

### `player-view.tsx` (`apps/web`)
Implementa `onFetchExplanation` via `POST /api/lines/[id]/explain` (com `force`),
mapeando 422/502 para erro exibível.

### Entradas
Aba **Explain** na rail + um botão **Explain** sob a legenda focal (ativa a aba).
"Mine sentence" (SRS) fica **fora de escopo** (feature separada).

## 5. Fora de escopo (YAGNI)
- Tela de **Settings/BYOK** (o fallback house cobre o MVP).
- **Save note** funcional / tabela de notas (botão fica inerte).
- **Mine sentence** / SRS a partir do painel.
- Explicação de **palavra** (`kind="word"`) e o **popup de dicionário** (peça à parte).
- JLPT level / `summary` (não estão no mockup).

## 6. Verificação
1. Unit: `coerceExplanation` v2 — breakdown válido, cap 8, `tag` inválida coagida,
   campos faltando → strings vazias; `plainTerms` ausente → string vazia.
2. Integração: `POST /api/lines/[id]/explain` numa linha real (MiniMax) →
   `{ breakdown:[…], plainTerms:"…" }`, gravado em `ai_explanations` com
   `prompt_version=2`; segundo POST = cache hit; `force:true` regenera e sobrescreve.
3. Manual (browser): abrir a aba Explain de uma linha → breakdown + in plain terms
   renderizam; Regenerate troca o conteúdo; Save note visível e inerte.
4. House fallback: sem BYOK e com `LLM_PROVIDER=minimax`, o painel funciona;
   com `LLM_PROVIDER=echo`, mostra erro (degrada, não quebra).
