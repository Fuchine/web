# Contrato da camada de IA (`packages/llm`)

**Versão 0.1 · 12 de junho de 2026 · `prompt_version` inicial: 1**

Este documento fixa o formato de entrada e saída das duas funções de IA do produto: `translateBatch` (tradução das legendas, camada 1, no import) e `explainLine` (explicação profunda da linha, camada 2, sob demanda). É a fronteira entre `packages/llm` e o resto do app — quem chama sabe exatamente o que recebe, independente do provider (Claude, GPT, Gemini, local) atrás.

**Por que isto vem antes do schema:** a coluna `ai_explanations.content` (jsonb) guarda exatamente o objeto que `explainLine` devolve, e `subtitle_lines.text_translation` guarda o que `translateBatch` devolve. Travar o shape agora faz o schema sair estável — mudanças posteriores no formato viram, no máximo, bump de `prompt_version`, não migration de dados.

---

## 1. Os três eixos de idioma

O schema antigo usava `target_lang`, que é ambíguo: em ensino, "alvo" é a língua que se *aprende*; em tradução, é a língua para a qual se *traduz*. São coisas diferentes. O contrato usa três nomes explícitos:

| Eixo | Nome no contrato | Exemplo | O que é |
|---|---|---|---|
| Língua estudada | `learning_language` | `ja` | O idioma do vídeo e das frases. |
| Língua das explicações | `explanation_language` | `pt` | O idioma nativo do usuário; em que traduções e explicações são escritas. |
| Língua da interface | (fora deste contrato) | `pt` | Locale da UI; não afeta a IA. |

`learning_language` e `explanation_language` substituem `target_lang` em `user_settings` e em todas as chamadas de IA. No MVP, `learning_language` é sempre `ja`, mas o campo existe desde a primeira migration (decisão D4).

---

## 2. Tipos compartilhados

```ts
// Definido por packages/nlp (camada 0), consumido por explainLine.
type Token = {
  surface: string;        // forma como aparece no texto: 日本語
  lemma: string;          // forma base para lookup no dicionário
  reading: string;        // leitura em hiragana: にほんご
  pos: string;            // classe gramatical
  wordEntryId: string | null; // entrada de dicionário resolvida, ou null
};

// Nível JLPT estimado de um ponto gramatical.
type JlptLevel = "N5" | "N4" | "N3" | "N2" | "N1";
```

---

## 3. `translateBatch` — tradução das legendas (camada 1)

### 3.1. Assinatura

```ts
translateBatch(
  lines: string[],
  opts: { from: string; to: string }   // from = learning_language, to = explanation_language
): Promise<(string | null)[]>;
```

### 3.2. Garantia central — alinhamento 1:1

A função **sempre devolve um array do mesmo tamanho e na mesma ordem da entrada.** Esta é a cláusula mais importante do contrato. O modelo subjacente pode errar — devolver 19 traduções para 20 linhas, reordenar, fundir linhas. Lidar com isso é responsabilidade interna de `translateBatch`, **nunca** do chamador. O chamador recebe exatamente `lines.length` elementos ou um erro (§6); nunca um array desalinhado.

Implementação esperada: pedir saída em JSON array, validar `length === lines.length`; em divergência, uma tentativa de re-prompt; persistindo a divergência, cair para tradução linha a linha (mais cara, mas alinhada por construção).

### 3.3. Semântica do `null`

Cada posição do array é a tradução em texto **ou** `null`. `null` significa "sem tradução disponível para esta linha" e cobre três casos no MVP: linha que é só efeito sonoro ou música (♪…♪), linha vazia, e linha que o provider não conseguiu traduzir. O player trata posição `null` como "exibir só o japonês". Distinguir "nada a traduzir" de "falha" fica para uma versão futura — no MVP, a simplicidade vence.

### 3.4. Contexto e lotes

O chamador passa **todas** as linhas do vídeo, em ordem. Internamente a função quebra em lotes (~50 linhas, com algumas linhas de sobreposição como contexto, para resolver pronomes e continuidade entre cortes). Esse fatiamento é detalhe de implementação: de fora, entra o vídeo inteiro, sai o vídeo inteiro traduzido e alinhado.

### 3.5. Falha não derruba o import

Tradução é camada 1; se ela falhar inteira (provider fora do ar), o import **não** falha. O pipeline captura o erro, salva o vídeo com `text_translation = null` em todas as linhas e `status = concluído`. A camada 0 (tokens + dicionário) já torna o vídeo útil, e um job de retry pode preencher as traduções depois. Isso realiza a mitigação de risco do §11 da arquitetura: degrada com aviso, não quebra.

### 3.6. Quando roda — lazy por chunk (atualização 2026-06-18)

A camada 1 deixou de rodar no import. Agora a tradução é **sob demanda, por
chunk de 30 linhas**, disparada pelo player conforme o usuário assiste
(`apps/web/lib/translate.ts`, `POST /api/videos/[id]/translate`). A tabela
`subtitle_translation_chunks` registra os chunks já traduzidos, desambiguando
`text_translation = null` ("SFX/vazio") de "ainda não traduzido". A **assinatura
de `translateBatch` não muda** (recebe a lista de linhas do chunk) e o
`prompt_version` não muda (o shape de saída é o mesmo). Alvo fixo `en` (a coluna
é compartilhada por vídeo). Falha do provider degrada: o chunk não recebe
marcador e pode ser re-tentado depois.

---

## 4. `explainLine` — explicação da linha (camada 2)

### 4.1. Assinatura

```ts
explainLine(
  ctx: SubtitleLineCtx,
  opts: { explanationLanguage: string }
): Promise<Explanation>;

type SubtitleLineCtx = {
  text: string;                 // a linha em japonês
  prevText: string | null;      // linha anterior, para contexto/pronomes
  nextText: string | null;      // linha seguinte
  tokens: Token[];              // vindos da camada 0 — evitam o modelo re-parsear
  learningLanguage: string;     // "ja"
};
```

Passar os `tokens` da camada 0 não é redundância: ancora a explicação na mesma segmentação que o dicionário usa, evitando que o modelo discorde do tokenizador sobre onde a palavra começa.

### 4.2. Saída

```ts
type Explanation = {
  breakdown: ExplanationPart[]; // percurso ordenado das partes salientes (teto 8)
  plainTerms: string;           // prosa "in plain terms", em explanation_language
};

type ExplanationPart = {
  surface: string;  // trecho em japonês; pode abranger vários tokens (歩いて います)
  tag: "noun" | "verb" | "adjective" | "adverb" | "particle" | "grammar" | "expression";
  gloss: string;    // rótulo curto em explanation_language
  note: string;     // uma frase de explicação em explanation_language
  accent?: boolean; // a parte mais importante, destacada
};
```

> **Atualização 2026-06-18 — `prompt_version = 2`.** O shape mudou de
> `{ summary, grammarPoints, nuance }` para `{ breakdown, plainTerms }` (mais rico,
> casa com o painel Explain). Entradas v1 no cache ficam órfãs e inofensivas (§5.3).
> **Provider:** o cache-miss usa a chave BYOK do usuário quando configurada; sem
> ela, cai para a *house key* (env `LLM_*`) — pequeno desvio do §6.2, justificado
> enquanto não há tela de Settings. **Regenerate:** `POST /api/lines/[id]/explain`
> com `{ force: true }` ignora e sobrescreve o cache.

### 4.3. Em qual idioma cada campo vem

`summary`, `grammarPoints[].explanation` e `nuance` são escritos em `explanation_language` (o idioma nativo do usuário). `pattern` permanece em japonês — é a própria forma gramatical. `level` é um enum neutro de idioma.

### 4.4. Bordas — as decisões que *são* o contrato

| Situação | Comportamento |
|---|---|
| Linha sem gramática a explicar (ex.: um único substantivo, uma interjeição) | `grammarPoints = []` (array vazio, **nunca** `null`). |
| Muitos padrões na frase | Teto de **4** pontos. A IA prioriza os que um aprendiz no nível do vídeo provavelmente não conhece e ignora partículas triviais, salvo quando notáveis. |
| Romaji na saída | **Não incluído.** Leitura e furigana já vêm dos `tokens` da camada 0, de graça; pagar tokens de LLM para reproduzir isso seria desperdício. A explicação é sobre sentido e gramática, não leitura. |
| Nada de notável no registro/tom | `nuance = null`. |
| Linha intraduzível (ruído, texto corrompido) | `summary` declara isso em linguagem natural; `grammarPoints = []`; `nuance = null`. |

### 4.5. Estabilidade

`explainLine` roda com temperatura baixa. A saída precisa ser razoavelmente determinística para que o cache faça sentido — duas gerações da mesma linha não deveriam divergir de forma relevante.

### 4.6. Exemplo preenchido

Para a linha `もう行ってしまったかもしれない。` (`summary` e explicações em `pt`):

```json
{
  "summary": "Diz que ela provavelmente já foi embora.",
  "grammarPoints": [
    {
      "pattern": "〜てしまう",
      "level": "N4",
      "explanation": "marca ação concluída, com nuance de arrependimento ou finalidade"
    },
    {
      "pattern": "〜かもしれない",
      "level": "N4",
      "explanation": "expressa possibilidade: 'pode ter ~'"
    }
  ],
  "nuance": "Registro casual; しまった carrega leve resignação."
}
```

É exatamente este objeto que vai para a coluna `ai_explanations.content`.

---

## 5. Contrato de cache

### 5.1. Chave

O cache da camada 2 é único por:

```
(subtitle_line_id, kind, explanation_language, prompt_version)
```

- `kind`: tipo de explicação. No MVP existe só `"line"` (explicação de linha). O campo fica reservado para tipos futuros — `"word"` (aprofundar uma palavra além do dicionário), `"grammar_drill"` — sem precisar de migration.
- `explanation_language` na chave: o português e o inglês da mesma linha são entradas distintas.

### 5.2. O modelo **não** entra na chave

A coluna `model` registra qual modelo escreveu a explicação (para depuração e custo), mas **não** faz parte da identidade do cache. Uma explicação gerada pelo Claude é reaproveitada mesmo que o usuário depois troque para GPT: a explicação é "correta o bastante" independimente de quem a escreveu, e reusá-la economiza dinheiro. Se um dia você quiser regenerar tudo com um modelo melhor, isso é feito subindo `prompt_version` (§6), não tirando o modelo da chave.

### 5.3. Regeneração preguiçosa

Quando `prompt_version` sobe, requisições novas erram o cache e geram conteúdo fresco. As entradas antigas permanecem no banco, órfãs e inofensivas — ninguém as apaga, ninguém as serve. Sem job de migração, sem downtime.

---

## 6. Política de versionamento (`prompt_version`)

`prompt_version` é um inteiro, vive em código junto dos prompts, e viaja para a chave de cache. Começa em **1**.

**Suba a versão quando:** o shape da saída mudar (campo novo, campo removido, significado alterado) **ou** o prompt mudar o bastante para que você queira gerações novas (ex.: melhorou a qualidade das explicações de gramática).

**Não suba quando:** trocar de provider mantendo o mesmo shape (o cache é chaveado por formato, não por modelo — §5.2); corrigir um typo no prompt que não muda o resultado de forma perceptível.

**Compatibilidade:** como a chave inclui a versão, formatos novo e antigo coexistem sem conflito. Adicionar um campo opcional ao `Explanation` é uma mudança aditiva — sobe a versão, o cache antigo continua válido para o código que ainda lê o formato antigo, e o novo se preenche sob demanda.

---

## 7. Modelo de erros

As duas funções podem lançar erro. Os tipos a tratar:

| Erro | Quando | Como o app reage |
|---|---|---|
| `MissingApiKeyError` | Self-host sem chave BYOK configurada | UI explica como obter uma chave; camada 0 segue funcionando (dicionário, tokens, player JP). |
| `ProviderError` | Provider fora do ar, resposta inválida após retry | `translateBatch`: import salva sem tradução (§3.5). `explainLine`: UI mostra "não foi possível explicar agora, tente de novo". |
| `RateLimitError` | Provider limitou requisições | Backoff e retry no worker; na UI, mensagem de "tente em instantes". |
| `QuotaExceededError` | Cloud, usuário estourou a cota do plano | Só no modo cloud; UI oferece upgrade. No self-host nunca ocorre. |

Princípio geral: **falha de IA degrada, não quebra.** Um vídeo sem tradução ainda é estudável; uma linha sem explicação ainda toca no player e entra no SRS.

---

## 8. Recomendação de modelo por função

Provider-agnóstico, mas com expectativa de tier (ecoa o §6.4 da arquitetura). É recomendação de configuração, não cláusula rígida:

| Função | Tier esperado | Ordem de custo |
|---|---|---|
| `translateBatch` | Econômico (classe Haiku / mini) | Centavos por vídeo de ~20 min, uma vez. |
| `explainLine` | Intermediário | ~1–2k tokens por linha, uma vez por linha/idioma/versão. |

---

## 9. Decisões que precisam do seu aval de produto

Eu fechei o contrato inteiro, mas estas escolhas são de gosto de produto — vale confirmar antes de virar código:

1. **Teto de 4 pontos gramaticais** por linha. Mais que isso vira parede de texto; menos pode cortar frase densa. 4 é um chute calibrado.
2. **Sem romaji na explicação.** Aposto que a leitura via furigana (camada 0) basta. Se você quiser romaji explícito no popup, isso muda a UI, não o contrato — a leitura já está nos tokens.
3. **`null` único para SFX, vazio e falha** em `translateBatch`. Simplifica o MVP; se você quiser que o player diferencie "música" de "falha", é um enum a mais depois.
4. **Modelo fora da chave de cache.** Reuso máximo, economia máxima, ao custo de explicações não regenerarem sozinhas quando você trocar de modelo. Acho o trade certo; é reversível subindo a versão.
5. **Tradução não derruba o import.** Vídeo sem tradução fica disponível só em japonês. Alternativa seria marcar o vídeo como incompleto — escolhi degradar em vez de bloquear.

---

## Próximos artefatos relacionados

1. **Schema Drizzle** das 13 tabelas — agora pode sair estável, ancorado neste contrato.
2. **Spike de legendas** (seu, a executar) — independente deste contrato; nada aqui fica bloqueado por ele.
3. Os **prompts** em si (texto que implementa este contrato) — derivam destes campos e desta `prompt_version`.
