# backlog: POST /api/import sem teto de payload e com corrida no dedup

**Date:** 2026-07-06
**Feature:** Import (API, T0.7)
**Status:** OPEN

---

## Problema

`createImport` (`apps/web/lib/import.ts:41-101`) confia demais no payload da
extensão (que roda na máquina do usuário — é input de usuário):

1. **Sem caps.** Nenhum limite de quantidade de captions nem de tamanho de
   `text` (`import.ts:62-70`). Um POST autenticado pode inserir centenas de
   milhares de linhas ou textos de MBs — infla `subtitle_lines`, trava o
   pipeline de camada 0 (que processa linha a linha) e o pre-warm herda o
   volume. Contraste: o beacon de progresso tem caps explícitos
   (`lib/progress.ts:20-22`).
2. **Sem sanidade de timestamps:** `endMs < startMs` passa direto (o clamp é
   só `>= 0`).
3. **Corrida no dedup.** Check `findFirst` + INSERT separados
   (`import.ts:52-91`): dois POSTs simultâneos do mesmo `sourceId` (usuário
   clica 2× na extensão) → o segundo estoura o unique
   `videos_source_source_id_uq` → **500 não tratado** em vez do
   comportamento de cache compartilhado (retornar o existente).

## Proposta

1. Caps na validação: ex. `captions.length ≤ 10_000`, `text.length ≤ 500`,
   `durationS ≤ 43_200`, `endMs ≥ startMs` (senão swap ou descarta) — rejeitar
   com 400 e motivo legível.
2. Dedup atômico: `INSERT ... ON CONFLICT (source, source_id) DO NOTHING
   RETURNING`; sem linha de volta → re-select e responder como cache hit (o
   mesmo shape do caminho `existing` atual).

## Esforço / prioridade

**S · média.** Endurece a porta de entrada primária do produto; fixes locais
em um arquivo já coberto pelo E2E de import.

## Referências

- `apps/web/lib/import.ts:41-101`, `app/api/import/route.ts`
- Padrão de caps: `apps/web/lib/progress.ts:18-60`
- Relacionado: [import-jobs-no-retry.md]
