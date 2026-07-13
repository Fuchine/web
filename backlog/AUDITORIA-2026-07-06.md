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
> **Reconciliação (2026-07-13):** vários itens estavam de fato prontos ou foram
> fechados hoje:
> - `daily-goals-not-consumed` — fechou (fila + `maxReviewsPerDay` + dashboard +
>   onboarding); removido.
> - `unpaginated-lists` — fechou (queries/rotas cursor-paginated + `GET /api/phrases`
>   novo + infinite scroll `usePaginatedList`); restou só a limitação de escopo
>   da busca, filada em [list-search-covers-loaded-only.md](list-search-covers-loaded-only.md)
>   (baixa, F2).
> - `dictionary-screen-state` §8 — já estava resolvido (índice trgm + `glosses_text`,
>   migration 0013); sem bug acionável.
> - `prewarm-cost-per-import` — item 2 (tail no primeiro open) fechou; sobra o item 3.
> - `llm-usage-metering` — fechou: tabela `llm_usage` por request (migration 0015),
>   sink DB no web+worker, atribuição por vídeo/usuário. Desbloqueia o item 3 do prewarm.
>
> **Restam 3 itens de auditoria:** [prewarm-cost-per-import.md] (item 3, baixa),
> [list-search-covers-loaded-only.md] (F2, baixa) e `catalog-visibility-decision`
> (Portão 2, decisão de produto, sem arquivo).

## Índice por prioridade

| Item | Dimensão | Esforço | Prioridade | Impacto (1 linha) |
|---|---|---|---|---|
| [prewarm-cost-per-import.md](prewarm-cost-per-import.md) | Custos | S | Baixa (PARTIAL) | Itens 1 e 2 feitos; **sobra só o item 3** (tokens no summary do job) — agora **desbloqueado** pelo metering. |
| [list-search-covers-loaded-only.md](list-search-covers-loaded-only.md) | Arquitetura / Desempenho | M | Baixa (F2) | Sucessor do `unpaginated-lists` (paginação feita): busca/sort da library e phrases cobre só as páginas carregadas. |

## Arquivos existentes atualizados nesta auditoria

- [dictionary-screen-state.md](dictionary-screen-state.md) — §7 (escala de
  frequência) e §8 (busca EN full scan) **ambos resolvidos**. Os residuais
  §4/§5/§6 são recortes de UI/limitações aceitas por design, não bugs abertos.

## Itens abertos antes da auditoria

O PR #16 ("Backlog sweep") resolveu quase todos os itens pré-auditoria
destravados (removidos do backlog). `daily-goals-not-consumed` fechou em
2026-07-13; `dictionary-screen-state` não tem mais bug acionável (§8 resolvido
2026-07-13, verificado em código). `frequency-list-not-seeded` foi resolvido em
código (falta só rodar o seed) e removido do backlog. **Nada pré-auditoria em
aberto.**

## Análise complementar

A prontidão de **produção** (deploy, backups, saúde dos processos, conta,
decisões de produto pré-multiusuário) foi analisada em seguida, no mesmo dia,
com índice próprio: **[PRODUCAO-2026-07-06.md](PRODUCAO-2026-07-06.md)**
(+10 itens, organizados por portão de lançamento).

## Recomendação de sequência (do que restou)

1. **Custo estrutural:** `llm-usage-metering` **resolvido 2026-07-13** (tabela
   `llm_usage` por request, sink DB no web+worker, atribuição por vídeo/usuário).
   Sobra fechar [prewarm-cost-per-import.md] item 3 (anexar tokens ao summary do
   job — agora tem fonte).
2. **Desempenho restante:** [list-search-covers-loaded-only.md] quando a F2 chegar.

> `catalog-visibility-decision.md` (Portão 2) é citado como aberto mas **ainda
> não tem arquivo próprio** — filá-lo é trabalho pendente de backlog. É decisão
> de produto (ver [PRODUCAO-2026-07-06.md]).
