# Auditoria de ponta a ponta — 2026-07-06

Varredura de `apps/web`, `apps/worker`, `packages/{core,db,nlp,llm,jobs,ui}` e
`extension/` nas dimensões: desempenho (runtime), custos, performance
(arquitetura), funcionalidade e qualidade. A auditoria original levantou 22
itens; as decisões travadas (D1–D8, AGPL, BYOK, FSRS, camadas de custo,
degradar-não-quebrar) foram tratadas como premissas — nenhum achado propôs
violá-las.

> **Limpeza (2026-07-07):** os itens **concluídos** foram removidos do backlog
> (histórico em `git log`). O que sobra abaixo é só o **aberto** e o **parcial**.
> Fechados e removidos nesta leva: circuit breaker do pump, testes de CI
> multi-pacote, overfetch de dashboard/biblioteca, comprehension indexada+escopada,
> scan O(histórico) de stats, review transacional, caps + dedup de import,
> fallback de tradução limitado, e a duplicação do payload de review. Ainda em
> andamento (parciais): rate limit, batching do import e clamp de stats.

## Índice por prioridade

| Item | Dimensão | Esforço | Prioridade | Impacto (1 linha) |
|---|---|---|---|---|
| 🟡 [ai-endpoints-no-rate-limit.md](ai-endpoints-no-rate-limit.md) | Custos / Segurança | S-M | **Alta** (PARTIAL) | Limiter Redis + 5 superfícies autenticadas feitos; **sobra o magic link** pré-auth (precisa de middleware). |
| 🟡 [import-pipeline-batching.md](import-pipeline-batching.md) | Desempenho (worker) | M | **Alta** (PARTIAL) | Cache por vídeo + write em transação feitos; **sobra a query única** (`WHERE lemma = ANY(...)`), que precisaria estender a interface. |
| [dictionary-gloss-search-full-scan.md](dictionary-gloss-search-full-scan.md) | Desempenho | M | Média-alta | Busca EN = seq scan de 298k entries com jsonb+ILIKE por consulta; precisa de coluna de glosses + índice trgm. |
| [core-paths-missing-tests.md](core-paths-missing-tests.md) | Qualidade | M | Média-alta | Mineração/review FSRS, explain e import — os caminhos que custam dados ou dinheiro — não têm testes. |
| [player-transcript-rerender.md](player-transcript-rerender.md) | Desempenho (client) | S | Média | Transcript inteiro re-mapeado e re-renderizado 4×/segundo durante o playback — CPU/bateria na sessão de imersão. |
| [translate-chunk-race-writes.md](translate-chunk-race-writes.md) | Custos / Desempenho | S-M | Média | Dois requests simultâneos traduzem o mesmo chunk 2×; persistência em 30 UPDATEs paralelos. |
| [import-jobs-no-retry.md](import-jobs-no-retry.md) | Robustez | S-M | Média | Jobs com 1 tentativa: blip transitório deixa vídeo preso em "processing"; `failed` não guarda motivo legível. |
| [explain-double-generation.md](explain-double-generation.md) | Custos | M | Média | Prefetch do player e pre-warm do worker geram as mesmas linhas em duplicidade no vídeo recém-importado. |
| [prewarm-cost-per-import.md](prewarm-cost-per-import.md) | Custos | M | Média | Pre-warm gera o vídeo inteiro no import (~0,3–0,55M tokens ≈ US$ 0,6–1,2 em tier pago) sem teto nem knob. |
| [llm-usage-metering.md](llm-usage-metering.md) | Custos / Observabilidade | M | Média | `usage` das respostas é descartado — custo por vídeo/linha é chute e a quota da cloud (F3) não tem base. |
| [unpaginated-lists.md](unpaginated-lists.md) | Arquitetura / Desempenho | M | Média | Biblioteca e frases carregam o dataset inteiro; vira problema junto com a biblioteca pública da F2. |
| 🟡 [stats-writers-daily-caps.md](stats-writers-daily-caps.md) | Segurança / Integridade | S | Baixa (PARTIAL) | Clamp de 24h feito; frequência de beacon/dedup de clicks agora destravados pelo limiter, falta ligar. |
| [player-volume-fullscreen-dead.md](player-volume-fullscreen-dead.md) | Funcionalidade | S | Baixa | Botões de volume/fullscreen são no-ops; o comentário que justifica está factualmente errado. |

## Arquivos existentes atualizados nesta auditoria

- [dictionary-screen-state.md](dictionary-screen-state.md) — §7 escala de
  frequência divergente popup × dicionário; §8 link para a busca EN full scan.
- [summary-screen-uses-mock-data.md](summary-screen-uses-mock-data.md) —
  residual: `cardsReviewed` superconta cards revisados com grades distintas.

## Itens abertos antes da auditoria

O PR #16 ("Backlog sweep") resolveu quase todos os itens pré-auditoria
destravados (removidos do backlog). Continuam com trabalho aberto:
[daily-goals-not-consumed.md](daily-goals-not-consumed.md) (PARTIAL — falta
dashboard/onboarding), [frequency-list-not-seeded.md](frequency-list-not-seeded.md)
(falta rodar o seed no banco) e os residuais de
[dictionary-screen-state.md](dictionary-screen-state.md).

## Análise complementar

A prontidão de **produção** (deploy, backups, saúde dos processos, conta,
decisões de produto pré-multiusuário) foi analisada em seguida, no mesmo dia,
com índice próprio: **[PRODUCAO-2026-07-06.md](PRODUCAO-2026-07-06.md)**
(+10 itens, organizados por portão de lançamento).

## Recomendação de sequência (do que restou)

1. **Fechar as caudas dos parciais:** magic link em
   [ai-endpoints-no-rate-limit.md] (middleware) e a query única de
   [import-pipeline-batching.md]; ligar os writers de
   [stats-writers-daily-caps.md] no limiter que já existe.
2. **Custo estrutural (quando o provider house deixar de ser free tier):**
   [llm-usage-metering.md] → [prewarm-cost-per-import.md] →
   [explain-double-generation.md], nessa ordem (medir antes de aparar).
3. **Desempenho restante:** [dictionary-gloss-search-full-scan.md] (índice trgm)
   e [player-transcript-rerender.md]; [unpaginated-lists.md] quando a F2 chegar.
