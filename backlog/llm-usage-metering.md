# backlog: Nenhuma medição de tokens/custo de IA — custo por vídeo é chute

**Date:** 2026-07-06
**Feature:** Custos de IA / Observabilidade
**Status:** OPEN

---

## Problema

Nenhum ponto do código registra consumo:

- `defaultChat` (`packages/llm/src/providers/openai-compatible.ts:153-160`) lê
  `choices[0].message.content` e **descarta o campo `usage`** que o provider
  devolve na mesma resposta.
- O provider DeepL não contabiliza caracteres enviados
  (`packages/llm/src/providers/deepl.ts:85-120`) — e o free tier é uma cota
  mensal de 500k chars que hoje só se descobre estourada via erro 456.

Consequências: perguntas centrais do modelo de custo ("quanto custa importar um
vídeo?", "quanto custa uma linha explicada?", "quantos vídeos cabem no free
tier do DeepL?") não têm resposta em dados — só estimativas de prompt. E a
cloud (F3) exige "custo medido por usuário desde o primeiro dia"
(ARQUITETURA §11); sem um ponto de medição, esse requisito nasce órfão.

## Proposta

Começar **sem** mudança de schema:

1. Log estruturado (JSON) por chamada de provider:
   `{ fn: "explainLine"|"translateBatch", provider, model, videoId?, lineId?,
   inTokens, outTokens, chars?, ms, ok }` — emitido em `defaultChat` /
   `DeepLProvider.call` com contexto passado pelos chamadores. **Nunca** logar
   chave nem conteúdo (CONTRATO §6.3).
2. Somar no summary do pre-warm (o job já loga generated/cached/failed).
3. Depois, se a cloud vier: tabela agregada por dia/usuário (decisão de ERD,
   não improvisar agora).

## Esforço / prioridade

**M · média.** Não muda comportamento; transforma toda a discussão de custo
(pre-warm, MT, force) de estimativa em medida. Pré-requisito prático para
[prewarm-cost-per-import.md] virar decisão informada.

## Referências

- `packages/llm/src/providers/openai-compatible.ts:121-162`,
  `providers/deepl.ts:85-121`
- `docs/ARQUITETURA.md` §11 (custo medido por usuário na cloud)
- **`docs/ANALISE_CUSTOS.md`** — a análise de precificação inteira depende
  deste item para sair de estimativa (±50%) e virar fato; é condição nº 1
  para travar preço.
- Relacionados: [prewarm-cost-per-import.md], [ai-endpoints-no-rate-limit.md]
