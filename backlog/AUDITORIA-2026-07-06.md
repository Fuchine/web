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
>
> **Limpeza (2026-07-10):** os PRs #19 e #20 marcaram vários itens como
> `RESOLVED` mas **não deletaram os arquivos** (ficaram órfãos no merge).
> Removidos agora — do #20: re-render do transcript, volume/fullscreen do player,
> corrida no translateChunk, single-flight do explain, índice trgm da busca EN,
> testes de caminhos críticos; do #19: todo o Portão 1 de produção (ver
> [PRODUCAO-2026-07-06.md]) mais `stats-writers-daily-caps`,
> `frequency-list-not-seeded` e `summary-screen-uses-mock-data`.
>
> **Reconciliação (2026-07-12):** três itens estavam de fato prontos e só o
> backlog estava desatualizado. `import-pipeline-batching` fechou (item 2,
> lookup em lote, feito hoje); `import-jobs-no-retry` fechou (item 3,
> `status_reason` via migration 0014, feito depois da nota); `ai-endpoints-no-rate-limit`
> fechou (magic link A1 desde 2026-07-10). Removidos do backlog (histórico e as
> notas de resolução no `git log`).
>
> **Reconciliação (2026-07-13):** `daily-goals-not-consumed` fechou (fila +
> `maxReviewsPerDay`, dashboard e onboarding de metas — todos os subitens feitos)
> e foi removido do backlog. **Restam 6 itens** (2 abertos + 1 parcial +
> 3 referenciados sem arquivo, abaixo).
>
> **Reconciliação (2026-07-13):** `unpaginated-lists` fechou — as queries e as
> rotas (`GET /api/videos`, novo `GET /api/phrases`) são cursor-paginated e a UI
> ganhou infinite scroll (`usePaginatedList`). Restou só a limitação de escopo
> da busca/sort (cobre páginas carregadas), filada como
> [list-search-covers-loaded-only.md](list-search-covers-loaded-only.md) (baixa,
> F2). Também **item 2 do prewarm** fechou (tail no primeiro open).

## Índice por prioridade

| Item | Dimensão | Esforço | Prioridade | Impacto (1 linha) |
|---|---|---|---|---|
| [prewarm-cost-per-import.md](prewarm-cost-per-import.md) | Custos | M | Média (PARTIAL) | Teto de linhas (`PREWARM_MAX_LINES`) feito; **sobra** o warm do tail sob demanda e o log de tokens (depende do metering). |
| [llm-usage-metering.md](llm-usage-metering.md) | Custos / Observabilidade | M | Média | `usage` das respostas é descartado — custo por vídeo/linha é chute e a quota da cloud (F3) não tem base. |
| [list-search-covers-loaded-only.md](list-search-covers-loaded-only.md) | Arquitetura / Desempenho | M | Baixa (F2) | Sucessor do `unpaginated-lists` (paginação feita): busca/sort da library e phrases cobre só as páginas carregadas. |

## Arquivos existentes atualizados nesta auditoria

- [dictionary-screen-state.md](dictionary-screen-state.md) — §7 escala de
  frequência divergente popup × dicionário; §8 link para a busca EN full scan.

## Itens abertos antes da auditoria

O PR #16 ("Backlog sweep") resolveu quase todos os itens pré-auditoria
destravados (removidos do backlog). Continua com trabalho aberto apenas os
residuais de [dictionary-screen-state.md](dictionary-screen-state.md)
(`daily-goals-not-consumed` fechou em 2026-07-13). `frequency-list-not-seeded`
foi resolvido em código (falta só rodar o seed) e removido do backlog.

## Análise complementar

A prontidão de **produção** (deploy, backups, saúde dos processos, conta,
decisões de produto pré-multiusuário) foi analisada em seguida, no mesmo dia,
com índice próprio: **[PRODUCAO-2026-07-06.md](PRODUCAO-2026-07-06.md)**
(+10 itens, organizados por portão de lançamento).

## Recomendação de sequência (do que restou)

1. **Custo estrutural (quando o provider house deixar de ser free tier):**
   [llm-usage-metering.md] → [prewarm-cost-per-import.md] (fechar o tail +
   log de tokens), nessa ordem (medir antes de aparar).
2. **Desempenho restante:** [list-search-covers-loaded-only.md] quando a F2 chegar.

> `llm-usage-metering.md` e `catalog-visibility-decision.md` (Portão 2) são
> citados como abertos mas **ainda não têm arquivo próprio** — filá-los é
> trabalho pendente de backlog.
