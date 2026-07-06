# Auditoria de ponta a ponta — 2026-07-06

Varredura de `apps/web`, `apps/worker`, `packages/{core,db,nlp,llm,jobs,ui}` e
`extension/` nas dimensões: desempenho (runtime), custos, performance
(arquitetura), funcionalidade e qualidade. **22 itens novos** + **2 arquivos
existentes atualizados** (o follow-up de segurança do mesmo dia acrescentou
[stats-writers-daily-caps.md](stats-writers-daily-caps.md) e ampliou o item de
rate limit para import, busca do dicionário e magic link). As decisões
travadas (D1–D8, AGPL, BYOK, FSRS,
camadas de custo, degradar-não-quebrar) foram tratadas como premissas — nenhum
achado propõe violá-las.

## Índice por prioridade

| Item | Dimensão | Esforço | Prioridade | Impacto (1 linha) |
|---|---|---|---|---|
| [ai-endpoints-no-rate-limit.md](ai-endpoints-no-rate-limit.md) | Custos / Segurança | S-M | **Alta** | Nenhuma rota tem rate limit: `force`, translate, import, busca e magic link deixam qualquer usuário queimar a house key, envenenar o cache compartilhado e spammar e-mail. |
| [translation-pump-no-circuit-breaker.md](translation-pump-no-circuit-breaker.md) | Custos / Desempenho | S | **Alta** | Provider fora do ar = rajada de requests caros por todos os chunks; pendência já conhecida, contida em um arquivo. |
| [ci-package-tests-missing.md](ci-package-tests-missing.md) | Qualidade / DX | S | **Alta** | CI não roda os testes de worker/llm — regressão no alinhamento 1:1 do contrato de IA passaria verde. |
| [library-dashboard-overfetch.md](library-dashboard-overfetch.md) | Desempenho | S | **Alta** | Badge de review carrega a fila completa e o dashboard puxa a biblioteca inteira para 1 card — em toda navegação. |
| [import-pipeline-batching.md](import-pipeline-batching.md) | Desempenho (worker) | M | **Alta** | Milhares de round trips por import (lookup por lemma repetido + UPDATE por linha); é o gargalo do pipeline. |
| [library-comprehension-full-scan.md](library-comprehension-full-scan.md) | Desempenho | M | **Alta** | Comprehension varre `word_examples` inteiro (cresce com o catálogo global) a cada load da biblioteca; falta índice por vídeo. |
| [stats-unbounded-review-scan.md](stats-unbounded-review-scan.md) | Desempenho | S | Média-alta | Streak carrega todos os `review_logs` da vida em JS; fix natural resolve junto o streak-ignora-imersão. |
| [dictionary-gloss-search-full-scan.md](dictionary-gloss-search-full-scan.md) | Desempenho | M | Média-alta | Busca EN = seq scan de 298k entries com jsonb+ILIKE por consulta; precisa de coluna de glosses + índice trgm. |
| [core-paths-missing-tests.md](core-paths-missing-tests.md) | Qualidade | M | Média-alta | Mineração/review FSRS, explain e import — os caminhos que custam dados ou dinheiro — não têm testes. |
| [review-flow-not-transactional.md](review-flow-not-transactional.md) | Qualidade / Integridade | S | Média | Review em 6 round trips sem transação pode reagendar card sem gravar o log que o FSRS (D6) promete guardar. |
| [import-validation-caps.md](import-validation-caps.md) | Segurança | S | Média | `/api/import` aceita payload sem teto e a corrida do dedup devolve 500 em vez do cache compartilhado. |
| [player-transcript-rerender.md](player-transcript-rerender.md) | Desempenho (client) | S | Média | Transcript inteiro re-mapeado e re-renderizado 4×/segundo durante o playback — CPU/bateria na sessão de imersão. |
| [translate-chunk-race-writes.md](translate-chunk-race-writes.md) | Custos / Desempenho | S-M | Média | Dois requests simultâneos traduzem o mesmo chunk 2×; persistência em 30 UPDATEs paralelos. |
| [translate-fallback-parallel-storm.md](translate-fallback-parallel-storm.md) | Custos | S | Média | Fallback linha-a-linha dispara 40 chamadas paralelas contra um provider que acabou de falhar. |
| [import-jobs-no-retry.md](import-jobs-no-retry.md) | Robustez | S-M | Média | Jobs com 1 tentativa: blip transitório deixa vídeo preso em "processing"; `failed` não guarda motivo legível. |
| [explain-double-generation.md](explain-double-generation.md) | Custos | M | Média | Prefetch do player e pre-warm do worker geram as mesmas linhas em duplicidade no vídeo recém-importado. |
| [prewarm-cost-per-import.md](prewarm-cost-per-import.md) | Custos | M | Média | Pre-warm gera o vídeo inteiro no import (~0,3–0,55M tokens ≈ US$ 0,6–1,2 em tier pago) sem teto nem knob. |
| [llm-usage-metering.md](llm-usage-metering.md) | Custos / Observabilidade | M | Média | `usage` das respostas é descartado — custo por vídeo/linha é chute e a quota da cloud (F3) não tem base. |
| [unpaginated-lists.md](unpaginated-lists.md) | Arquitetura / Desempenho | M | Média | Biblioteca e frases carregam o dataset inteiro; vira problema junto com a biblioteca pública da F2. |
| [review-queue-payload-duplication.md](review-queue-payload-duplication.md) | Desempenho | S | Baixa | `wordEntriesMap` completo repetido em cada card da fila — ~95% do payload da revisão é duplicata. |
| [player-volume-fullscreen-dead.md](player-volume-fullscreen-dead.md) | Funcionalidade | S | Baixa | Botões de volume/fullscreen são no-ops; o comentário que justifica está factualmente errado. |
| [stats-writers-daily-caps.md](stats-writers-daily-caps.md) | Segurança / Integridade | S | Baixa | Beacons e clicks sem teto diário permitem fabricar watch time e marcar o catálogo inteiro como "known". |

## Arquivos existentes atualizados nesta auditoria

- [dictionary-screen-state.md](dictionary-screen-state.md) — §7 escala de
  frequência divergente popup × dicionário; §8 link para a busca EN full scan.
- [summary-screen-uses-mock-data.md](summary-screen-uses-mock-data.md) —
  residual: `cardsReviewed` superconta cards revisados com grades distintas.

## Itens abertos antes da auditoria

> **Atualização (mesmo dia):** o PR #16 ("Backlog sweep") resolveu quase todos
> os itens pré-auditoria que estavam destravados — streak com imersão, telas de
> álbuns, export TSV, flags de vídeo (save/hide), categorias, embed-blocked,
> Dependabot e o seed de frequência (em código). O status de cada um vive no
> próprio arquivo. Continuam com trabalho aberto:
> [daily-goals-not-consumed.md](daily-goals-not-consumed.md) (PARTIAL — falta
> dashboard/onboarding), [frequency-list-not-seeded.md](frequency-list-not-seeded.md)
> (falta rodar o seed no banco) e os residuais de
> [dictionary-screen-state.md](dictionary-screen-state.md).

## Análise complementar

A prontidão de **produção** (deploy, backups, saúde dos processos, conta,
decisões de produto pré-multiusuário) foi analisada em seguida, no mesmo dia,
com índice próprio: **[PRODUCAO-2026-07-06.md](PRODUCAO-2026-07-06.md)**
(+10 itens, organizados por portão de lançamento).

## Recomendação de sequência

1. **Quick wins de uma sessão (alta razão impacto/custo):**
   [ci-package-tests-missing.md] + [library-dashboard-overfetch.md] +
   [translation-pump-no-circuit-breaker.md].
2. ~~Funcionalidade de maior valor: streak com imersão~~ **resolvido pelo
   PR #16 (mesmo dia)**. O que restou dessa dupla é só
   [stats-unbounded-review-scan.md] — e ficou mais simples: com os writers de
   review/mining também alimentando `user_daily_stats`, os dois scans sem
   limite de `review_logs`/`sentence_cards` podem ser removidos por completo
   (ver atualização no item).
3. **Antes de qualquer divulgação/multiusuário:**
   [ai-endpoints-no-rate-limit.md] e [import-validation-caps.md] — são a
   superfície de abuso de custo.
4. **Custo estrutural (quando o provider house deixar de ser free tier):**
   [llm-usage-metering.md] → [prewarm-cost-per-import.md] →
   [explain-double-generation.md], nessa ordem (medir antes de aparar).
