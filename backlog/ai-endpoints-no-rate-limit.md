# backlog: Endpoints que gastam IA sem rate limit — force regenerate ilimitado

**Date:** 2026-07-06
**Feature:** Segurança / Custos de IA (API)
**Status:** PARTIAL (5 superfícies autenticadas feitas em 2026-07-07; magic link adiado)

---

## Problema

Nenhuma rota do app tem rate limiting, e duas delas gastam dinheiro da *house
key* sob controle do cliente:

1. **`POST /api/lines/[id]/explain` com `{ force: true }`**
   (`app/api/lines/[id]/explain/route.ts:19`): qualquer usuário autenticado
   regenera qualquer linha, quantas vezes quiser. `force` pula o cache
   (`lib/explain.ts:45-47`) e **sobrescreve** a entrada compartilhada
   (`packages/llm/src/cache.ts:59-67`). Duas consequências: queima de tokens
   sem teto (a house key cobre quem não tem BYOK) e *cache poisoning* — um
   usuário regenerando substitui, para todos, uma explicação boa por uma
   eventualmente pior.
2. **`POST /api/videos/[id]/translate`**: iterar `chunkIdx` sobre o catálogo
   inteiro drena a cota do DeepL/LLM house. O cache de chunk protege o que já
   foi traduzido, mas todo o não-traduzido é gasto disparável à vontade.

No self-host single-user o risco é acadêmico; em qualquer instância
multi-usuário (e na cloud da F3, que exige quota por plano desde o dia 1 —
ARQUITETURA §11) é a exposição de custo mais direta do app.

## Proposta

1. **Restringir `force`:** orçamento por usuário (ex.: 20 regenerações/dia,
   contador em Redis — a infra já está de pé para o BullMQ). O caso legítimo
   ("a explicação veio ruim") é raro por natureza.
2. **Limiter genérico nos endpoints de gasto** (explain miss, translate miss,
   import): token bucket por usuário em Redis, limites generosos (ex.: 120
   misses de explain/h) que um estudante real nunca encosta.
3. Responder `429` com mensagem honesta ("Too many regenerations today").

## Esforço / prioridade

**S-M · alta.** É a combinação exposição-de-custo + integridade do cache
compartilhado; o limiter é pequeno e reaproveitável.

## Referências

- `apps/web/app/api/lines/[id]/explain/route.ts:16-20`, `lib/explain.ts:45-47`
- `packages/llm/src/cache.ts:42-68` (`saveExplanation` sobrescreve)
- `apps/web/app/api/videos/[id]/translate/route.ts`
- Relacionados: [prewarm-cost-per-import.md], [translate-chunk-race-writes.md]

---

## Ampliação (2026-07-06) — superfícies adicionais para o mesmo limiter

Levantamento complementar da mesma auditoria. O escopo do item passa a cobrir:

3. **`POST /api/import` — a chamada mais cara do sistema.** Cada import novo
   dispara camada 0 + pre-warm do vídeo inteiro (~US$ 0,6–1,2/vídeo em tier
   pago — [prewarm-cost-per-import.md]) e escreve nas tabelas compartilhadas
   (`subtitle_lines`, `word_examples`). Importar em loop é trivial. Dedup/cache
   hit não conta para o limite.
4. **Busca EN do dicionário** (`GET /api/dictionary?q=...&mode=en`): cada
   request força seq scan de ~298k linhas
   ([dictionary-gloss-search-full-scan.md]); sem throttle é o vetor mais barato
   de esgotar CPU do Postgres — vale mesmo depois do índice trgm.
5. **Magic link (Auth.js e-mail provider)**: o NextAuth não limita envio;
   `POST /api/auth/signin/email` permite spammar qualquer endereço com
   e-mails de verificação. Único caso pré-auth da lista — o bucket aqui é por
   e-mail alvo e por IP, não por userId.

Tabela de referência (limites generosos — um estudante real nunca encosta):

| Ação | Limite sugerido |
|---|---|
| Explain miss (geração nova) | 120/h por usuário |
| Explain `force` | 20/dia por usuário |
| Translate miss (chunk novo) | 500/dia por usuário |
| Import novo (não-cacheado) | 30/dia por usuário |
| Busca de dicionário | 60/min por usuário |
| Magic link | 5/h por e-mail alvo e por IP |

Os writers de stats (beacon/click) ficam de fora deste item — o dano lá é ao
próprio usuário e o tratamento é clamp diário, não limiter:
[stats-writers-daily-caps.md].

---

## Resolução parcial (2026-07-07)

Limiter reaproveitável em `apps/web/lib/rate-limit.ts`: **contador de janela
fixa** em Redis (`INCR` + `EXPIRE` no primeiro hit), reusando a infra do BullMQ.
Núcleo puro `checkRateLimit(store, action, id)` sobre um `RateStore` injetável —
testado sem Redis (`lib/rate-limit.test.ts`, 4: sob/limite/acima, `remaining`,
buckets independentes, **fail-open**). O caminho de request **falha aberto**
(store erra/trava → libera; um blip do Redis nunca derruba o endpoint) e tem
timeout de 250ms por checagem. Conexão dedicada `createRequestRedis` em
`@fuchine/jobs` (fail-fast: `enableOfflineQueue:false`, `maxRetriesPerRequest:1`,
`connectTimeout:500`) — a do BullMQ (`maxRetriesPerRequest:null`) enfileiraria
comandos e travaria o request. Limites = a tabela de referência acima
(`RATE_LIMITS`). Denied → `429` + header `Retry-After`.

**Superfícies ligadas (5):**

1. **Explain `force`** (`explainForce` 20/dia) e **explain miss**
   (`explainMiss` 120/h) — em `lib/explain.ts`, no seam pós-cache: hit nunca
   conta; `force` (que sobrescreve o cache compartilhado) tem o orçamento mais
   apertado.
2. **Translate miss** (`translateMiss` 500/dia) — `translateChunk` ganhou dep
   opcional `checkRateLimit`, chamada só no miss (chunk cacheado = grátis).
3. **Import novo** (`importNew` 30/dia) — `createImport` ganhou
   `opts.checkRateLimit`, chamada depois dos checks de cache/vazio (só import
   realmente novo conta).
4. **Busca de dicionário** (`dictionarySearch` 60/min) — só o path `q`
   (o scan); lookup por `id` (popup) fica livre.

As rotas passam `session.user.id` como chave.

**Adiado — magic link (item 5, único pré-auth).** Precisa de chave por
IP **e** por e-mail alvo; o `sendVerificationRequest` do Auth.js não recebe o
IP e o provider de produção usa o envio padrão (sobrescrever exigiria
reimplementar o mailer). O caminho correto é **middleware** em
`POST /api/auth/signin/email` (IP + e-mail do body) — mas middleware roda no
edge, onde o ioredis não conecta; exige runtime nodejs no middleware ou um
mailer custom. Fica para uma sessão dedicada. A constante `magicLink` (5/h) já
está em `RATE_LIMITS`.

**Também destravado:** os itens 2–3 de [stats-writers-daily-caps.md] (frequência
de beacon, dedup de clicks) agora têm o limiter de que dependiam — ainda não
ligados.

Verificado: `pnpm typecheck` (8/8) + `pnpm test` (141 web) verdes. O caminho
Redis em si depende de infra (não exercido aqui; protegido por fail-open).
