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
> `frequency-list-not-seeded` e `summary-screen-uses-mock-data`. **Restam 10
> itens** (4 abertos + 5 parciais + o doc-vivo `dictionary-screen-state`).

## Índice por prioridade

| Item | Dimensão | Esforço | Prioridade | Impacto (1 linha) |
|---|---|---|---|---|
| 🟡 [ai-endpoints-no-rate-limit.md](ai-endpoints-no-rate-limit.md) | Custos / Segurança | S-M | **Alta** (PARTIAL) | Limiter Redis + 5 superfícies autenticadas feitos; **sobra o magic link** pré-auth (precisa de middleware). |
| 🟡 [import-pipeline-batching.md](import-pipeline-batching.md) | Desempenho (worker) | M | **Alta** (PARTIAL) | Cache por vídeo + write em transação feitos; **sobra a query única** (`WHERE lemma = ANY(...)`), que precisaria estender a interface. |
| [import-jobs-no-retry.md](import-jobs-no-retry.md) | Robustez | S-M | Média | Jobs com 1 tentativa: blip transitório deixa vídeo preso em "processing"; `failed` não guarda motivo legível. |
| [prewarm-cost-per-import.md](prewarm-cost-per-import.md) | Custos | M | Média (PARTIAL) | Teto de linhas (`PREWARM_MAX_LINES`) feito; **sobra** o warm do tail sob demanda e o log de tokens (depende do metering). |
| [llm-usage-metering.md](llm-usage-metering.md) | Custos / Observabilidade | M | Média | `usage` das respostas é descartado — custo por vídeo/linha é chute e a quota da cloud (F3) não tem base. |
| [unpaginated-lists.md](unpaginated-lists.md) | Arquitetura / Desempenho | M | Média | Biblioteca e frases carregam o dataset inteiro; vira problema junto com a biblioteca pública da F2. |

## Arquivos existentes atualizados nesta auditoria

- [dictionary-screen-state.md](dictionary-screen-state.md) — §7 escala de
  frequência divergente popup × dicionário; §8 link para a busca EN full scan.

## Itens abertos antes da auditoria

O PR #16 ("Backlog sweep") resolveu quase todos os itens pré-auditoria
destravados (removidos do backlog). Continuam com trabalho aberto:
[daily-goals-not-consumed.md](daily-goals-not-consumed.md) (PARTIAL — falta
dashboard/onboarding) e os residuais de
[dictionary-screen-state.md](dictionary-screen-state.md). `frequency-list-not-seeded`
foi resolvido em código (falta só rodar o seed) e removido do backlog.

## Análise complementar

A prontidão de **produção** (deploy, backups, saúde dos processos, conta,
decisões de produto pré-multiusuário) foi analisada em seguida, no mesmo dia,
com índice próprio: **[PRODUCAO-2026-07-06.md](PRODUCAO-2026-07-06.md)**
(+10 itens, organizados por portão de lançamento).

## Recomendação de sequência (do que restou)

1. **Fechar as caudas dos parciais:** magic link em
   [ai-endpoints-no-rate-limit.md] (middleware) e a query única de
   [import-pipeline-batching.md].
2. **Custo estrutural (quando o provider house deixar de ser free tier):**
   [llm-usage-metering.md] → [prewarm-cost-per-import.md] (fechar o tail +
   log de tokens), nessa ordem (medir antes de aparar).
3. **Desempenho restante:** [unpaginated-lists.md] quando a F2 chegar.
