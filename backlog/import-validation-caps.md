# backlog: POST /api/import sem teto de payload e com corrida no dedup

**Date:** 2026-07-06
**Feature:** Import (API, T0.7)
**Status:** DONE (2026-07-07)

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

## Resolução (2026-07-07)

Em `apps/web/lib/import.ts`, extraído `validateImportRequest(req)` puro e
testável, usado pelo `createImport`:

1. **Caps.** `captions.length ≤ CAPTIONS_MAX (10_000)` → 400 com motivo. `text`
   truncado a `TEXT_MAX (500)` por linha (degrada em vez de rejeitar o vídeo
   inteiro por uma legenda ruim). `title` truncado a 300. `durationS` fora de
   `[0, 43_200]` → `null` (tolerante, como hoje).
2. **Timestamps.** `endMs < startMs` agora faz **swap** (`min`/`max`) em vez de
   passar um span negativo; clamp `≥ 0` mantido.
3. **Dedup atômico.** O `insert(videos)` ganhou
   `onConflictDoNothing({ target: [videos.source, videos.sourceId] })`. Quando a
   corrida de dois POSTs simultâneos do mesmo `sourceId` não devolve linha, faz
   re-select e responde como **cache hit** (mesmo shape do caminho `existing`),
   em vez do 500 não tratado. Só cai no 500 genérico se nem o re-select achar.

O check de captions vazias segue **depois** do lookup de cache (re-POST de um
vídeo já existente continua servindo o cache, não 422).

Testes novos (`lib/import.test.ts`, 9): url/YouTube inválidos, cap de captions
(no limite e acima), truncagem de texto, swap de timestamps, trim/descarte de
vazias, defaults de idx/language, clamp de durationS. O dedup atômico depende de
Postgres (coberto pelo E2E de import, não rodado aqui). `pnpm test` (133 web) +
`pnpm typecheck` (8/8) verdes.

## Esforço / prioridade

**S · média.** Endurece a porta de entrada primária do produto; fixes locais
em um arquivo já coberto pelo E2E de import.

## Referências

- `apps/web/lib/import.ts:41-101`, `app/api/import/route.ts`
- Padrão de caps: `apps/web/lib/progress.ts:18-60`
- Relacionado: [import-jobs-no-retry.md]
