# backlog: Pre-warm de explicações gera o vídeo inteiro — custo por import sem teto

**Date:** 2026-07-06
**Feature:** Custos de IA (worker, camada 2)
**Status:** PARTIAL (2026-07-11) — **itens 1 e 2 feitos**. Item 1
(`PREWARM_MAX_LINES`, default 150) limita o pre-warm ansioso às primeiras N
linhas em ordem de watch; o resto é coberto sob demanda pelo prefetch do player.
`scopePrewarm` (puro, testado) fatia o escopo com vizinhos corretos; `total` do
summary passa a ser o escopo. **Item 2 feito (2026-07-11):** `GET
/api/videos/[id]` enfileira, no open, um job de pre-warm `scope: "full"` (fila
`explain`) que aquece a **cauda** do vídeo — o head já está em cache, então o
job cache-first só paga o resto. `ExplainJob` ganhou `scope: "head" | "full"`
(default `head`); o worker mapeia o escopo → cap com `prewarmMaxLinesForScope`
(puro, testado) e gateia em `echo` via `hasHouseLlm`. Dedup por `jobId` estável
(`fullPrewarmJobId`, completed retido 24h), fail-open, nunca bloqueia o payload.
**Item 3** (tokens no summary, depende de [[llm-usage-metering]]) segue aberto.

---

## Problema

Todo import enfileira o pre-warm da camada 2 do **vídeo inteiro** em inglês
(`apps/worker/src/index.ts:24-30` → `prewarmVideoExplanations`,
`packages/llm/src/prewarm.ts:92-141`), mesmo que ninguém nunca abra o vídeo.

Custo marginal por import (ordem de grandeza, premissas explícitas):

- Por linha explicada: prompt de sistema (~350 tokens) + linha/vizinhos/tokens
  (~150) + saída (~250) ≈ **700–900 tokens**.
- Vídeo de 400–600 linhas ≈ **0,3–0,55M tokens por import**.
- Em provider pago classe intermediária (~US$ 1/M in, US$ 5/M out):
  **~US$ 0,6–1,2 por vídeo**. No MiniMax M3 atual: ~US$ 0,15–0,25 (hoje free
  tier → US$ 0, mas o custo é estrutural e ninguém o mede — ver
  [llm-usage-metering.md]).

D2/D3 não são violados (cache compartilhado, cada linha gerada uma única vez —
na cloud isso é investimento herdado por todos os viewers). Mas o desenho
"camada 2 cara **sob demanda**" virou "cara **no import**", sem teto nem knob.
O pre-warm foi a solução certa para a latência do painel Explain; o que falta é
limitá-lo.

## Proposta

1. **Teto no import:** pre-warm apenas das primeiras ~150 linhas (o começo do
   vídeo, onde o viewer chega primeiro), configurável por env
   (`PREWARM_MAX_LINES`).
2. **Resto no primeiro open:** ✅ feito (2026-07-11). Ao abrir o player
   (`GET /api/videos/[id]`, só para vídeos `done`), enfileirar o pre-warm do
   restante — sinal barato de que o vídeo tem audiência; o prefetch do player
   (3 slots) cobre o intervalo até o worker alcançar. Implementado como job
   `scope: "full"` (uncapped) na fila `explain`, dedup por `jobId` estável.
3. Registrar tokens gastos por vídeo no summary do job (já loga
   generated/cached/failed — anexar tokens quando a medição existir).

## Esforço / prioridade

**M · média.** Hoje o gasto real é ~zero (free tier); vira alta no dia em que o
provider house for pago ou o volume de imports crescer. Barato de aparar agora.

## Referências

- `apps/worker/src/index.ts:24-30`, `packages/llm/src/prewarm.ts`
- `docs/ARQUITETURA.md` §6.4 (ordem de custo por camada)
- **Modelo de custo completo e cenários: `docs/ANALISE_CUSTOS.md`** — mostra
  que na política atual + tier médio o usuário pesado consome a assinatura
  inteira (~US$ 10,50/mês); o cap é pré-condição econômica da cloud.
- Relacionados: [llm-usage-metering.md], [explain-double-generation.md]
