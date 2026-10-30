# Fuchine

Plataforma open core de aprendizado de japonês por imersão em vídeo. O usuário
importa vídeos do YouTube, estuda com legendas duplas inteligentes (tokenização,
dicionário pop-up, explicações de IA por linha), minera frases em um clique e
revisa com SRS baseado em clipes do vídeo original.

O nome vem de 淵 (*fuchi*), "as profundezas" — mergulhar no idioma. Todo texto de
UI é em inglês.

## Documentos de referência (leia antes de decisões estruturais)

- `docs/ARQUITETURA.md` — visão, modelo open core, decisões travadas (D1–D8),
  arquitetura do sistema, stack, roadmap por fases. **Fonte da verdade.**
- `docs/ROADMAP_ENGENHARIA.md` (v0.2) — companheiro executável da arquitetura:
  tarefas tamanho-sessão (T0.x–T3.x), em ordem de dependência, com "Pronto
  quando". **É a fila de trabalho**; hoje a fila é a Fase 2 ("Lançar", M0–M3).
- `docs/CONTRATO_IA.md` — formato de entrada/saída das funções de IA
  (`translateBatch`, `explainLine`) e o contrato de cache. Ancora a coluna
  `ai_explanations.content` e o campo `text_translation`.
- `docs/ANALISE_CUSTOS.md` — modelo de custo unitário e base de precificação
  da cloud (foco: clientes pagantes em dólar; Pro US$ 8/mês a lápis).
  Estimativas pré-medição; validar com os dados reais de `llm_usage`.
- `docs/PESQUISA_MERCADO-2026-10-29.md` — concorrentes (HayaiLearn, Migaku,
  Language Reactor…), necessidades do aluno, faixa de preço, o que adicionar e
  o que inovar. Origem das Fases 3–4 do roadmap. Números com † vêm de snippet,
  não de página primária.
- `backlog/ANALISE-SEGURANCA-LANCAMENTO-2026-10-29.md` — estado real do projeto,
  achados de segurança (A1…G1) e milestones de lançamento M0–M5. Origem da
  Fase 2 do roadmap.
- `backlog/AUDITORIA-2026-07-06.md`, `backlog/PRODUCAO-2026-07-06.md` e
  `backlog/CORRECOES-PRE-DEPLOY-2026-07-10.md` — ondas anteriores (auditoria de
  código, portões de produção, correções pré-deploy). Itens fechados saem do
  backlog; o histórico fica no git.
- `docs/DEPLOY_CHECKLIST.md` — runbook do dia do deploy (env, auth, sequência,
  smoke test, ensaio de backup → restore).
- `docs/plans/` — specs e planos de implementação por feature
  (`AAAA-MM-DD-<feature>-spec.md` + `AAAA-MM-DD-<feature>.md`).
- `docs/INVENTARIO_TELAS.md` e `docs/PROMPT_PACK_TELAS.md` — telas do produto
  (o design em si é gerado fora, no Claude Design).
- `screens.md` — guia para gerar telas (handoff para IA): sistema visual,
  fluxo component-first, tokens/utilitários, componentes prontos em
  `@fuchine/ui` e os shapes de API por tela.
- `packages/db/src/schema.ts` — schema Drizzle: 21 tabelas (18 do app + 3 do
  adapter Auth.js).

## Decisões que NÃO podem ser violadas

- **Licença AGPL-3.0** no repositório inteiro.
- **Nunca armazenar vídeo ou áudio.** Clipes tocam via player oficial do YouTube
  (IFrame API) com start/end; o banco guarda só texto de legenda e timestamps.
- **Processamento de IA em camadas por custo:** camada 0 local e grátis
  (tokenização Sudachi/kuromoji + dicionário JMdict + leituras + frequência),
  camada 1 barata no import (tradução em lote), camada 2 cara sob demanda
  (explicação da linha, gerada no clique e cacheada para sempre).
- **Cache de IA compartilhado e versionado** por
  (subtitle_line_id, kind, explanation_language, prompt_version).
- **FSRS** como algoritmo de SRS (não SM-2). Use `ts-fsrs`.
- **Multilíngue por design:** campo `language` em todas as entidades de conteúdo;
  japonês é o primeiro idioma, não o único. Interfaces `Tokenizer` e
  `DictionaryProvider` por idioma.
- **BYOK:** chaves de API do usuário cifradas (AES-GCM), nunca em texto puro,
  nunca em logs.
- **Idioma:** todo texto de UI em inglês.

## Stack

- Next.js + TypeScript (web + API), monorepo com `packages/`.
- Postgres + Drizzle. Redis + BullMQ para o worker de import assíncrono.
- kuromoji.js no início → microserviço Python SudachiPy depois.
- jmdict-simplified para o dicionário. ts-fsrs para o SRS.
- YouTube IFrame Player API no player. Auth.js para autenticação.

## Estrutura do monorepo (alvo)

- `apps/web` — Next.js (UI + API routes)
- `apps/worker` — consumidores BullMQ (pipeline de import)
- `packages/core` — domínio: entidades, serviços, FSRS
- `packages/db` — schema Drizzle + migrations + seeds (JMdict, frequência)
- `packages/nlp` — interfaces Tokenizer/Dictionary + adapter ja/
- `packages/llm` — providers de LLM + resolução de chave + cache
- `packages/jobs` — contrato da fila BullMQ (nome + tipo do job + conexão Redis),
  compartilhado entre web (produtor) e worker (consumidor)
- `packages/ui` — design system (handoff do Claude Design): componentes React +
  Tailwind v4 (tokens 藍 em `src/styles/`) documentados no Storybook. Abordagem
  component-first: cada componente validado no Storybook antes de compor telas.
- `extension` — extensão de browser (ingestão primária); fora do workspace pnpm

## Convenções

- Antes de mexer em algo estrutural, confira o doc de arquitetura.
- Mudanças de schema saem do `CONTRATO_IA.md` e do ERD — não improvise colunas.
- Falha de IA degrada, não quebra (vídeo sem tradução ainda é estudável).

## Estado atual do repositório

*Revisado em 2026-10-30 (T2.1).*

**Fase:** F0 (Fundação) e F1 (MVP usável) concluídas; F2 (Alcance, na
numeração da ARQUITETURA §10) ~80% construída — extensão funcional (popup +
bridge in-app), álbuns, dicionário/busca, lista de frases, stats, biblioteca
compartilhada com flags por usuário, export Anki (TSV), exclusão de conta,
`/api/health`, backups, compose + Caddy/TLS, rate limits e metering em
`llm_usage`. **Portão 1 de produção (self-host, 1 usuário) fechado** pelo PR #19
+ ensaio backup → restore de 2026-07-20 (PASS 8/8). Nunca houve release, tag,
imagem publicada nem instância pública. **Fila atual:** Fase 2 ("Lançar",
M0–M3) do `docs/ROADMAP_ENGENHARIA.md` v0.2 — prontos T2.1 (docs), T2.2
(DELETE de card, caps de entrada, ESLint + `pnpm audit --prod` no CI,
Dependabot), T2.3 (registro controlado), T2.4 (teto da chave da casa), T2.5
(body ≤ 2 MB no Caddy, `frame-ancestors`/`X-Frame-Options`/`Permissions-Policy`
com `microphone=(self)`, segredos fora do Caddy, magic link fail-closed) e T2.6
(`isUuid` em toda rota com id, `middleware.ts` rejeitando mutação cross-site
exceto `/api/auth/*` e `/api/import`, escape no export e no e-mail,
`apps/web/app/api/auth-coverage.test.ts` exigindo 401 sem sessão em toda rota).
Da Fase 3 já entraram T3.5 (default **10** cards novos/dia aplicado na leitura —
`dailyGoals` sem o campo = 10, nunca gravado; `lib/srs-defaults.ts`; projeção
"amanhã" em `lib/goals.ts`), T3.8 (modo de escuta Primed, ocultar JP/tradução,
cores por status de palavra — regra única em `lib/word-status.ts`), T3.11
(modos de revisão Listen first / Cloze / Shadow sobre o clipe, gravação só em
memória) e T3.12 (harness `pnpm --filter @fuchine/llm eval:explain`, gold set
semente de 36 itens **não revisado**, trava `prompt-version.lock.json` que
exige bump de `PROMPT_VERSION` ao mudar `prompts.ts`, rótulo "AI-generated ·
prompt vN"). Próximo: T2.7 (deploy do mantenedor) e a onda 2 da Fase 3.
`next dev` voltou a funcionar (corpo Node do boot em `instrumentation-node.ts`).

Monorepo pnpm + Turborepo: `pnpm typecheck` e `pnpm test` verdes nos 8
pacotes (`apps/web`, `apps/worker`, `packages/{core,db,nlp,llm,jobs,ui}`);
`apps/web` builda no Next 15. CI (`.github/workflows/`): `ci.yml` (audit, typecheck,
lint, test, build), `e2e.yml` (migrate + suítes E2E contra Postgres real), `dco.yml`
(Signed-off-by) e `spike-captions.yml`.

Pacotes e seus pontos de entrada:

- `packages/db` — schema Drizzle com 21 tabelas: 18 do app (`users`,
  `user_settings`, `invites`, `videos`, `subtitle_lines`,
  `subtitle_translation_chunks`, `word_entries`, `word_examples`,
  `sentence_cards`, `review_logs`, `ai_explanations`, `albums`, `album_videos`,
  `user_video_flags`, `user_word_stats`, `saved_words`, `user_daily_stats`,
  `llm_usage`) + 3 do adapter Auth.js (`accounts`, `sessions`,
  `verification_tokens`). Tipos jsonb (`Token`, `Explanation`, `Definition`,
  `DailyGoals`) + `createDb()` (pool configurável, `DB_POOL_MAX`) +
  `ensureUserSettings` + helpers de convite (`invites.ts`) e `normalizeEmail`.
  Exporta também `Transaction`/`DbOrTx` (handle de transação do Drizzle) para
  helpers que rodam tanto standalone quanto dentro de `db.transaction(...)`.
  Migrations em `drizzle/` de `0000_init` a `0017` com meta journal
  (`pnpm db:migrate`; a `0013` cria a extensão `pg_trgm`). Seed JMdict +
  frequência em `src/seed/` (`pnpm --filter @fuchine/db seed`/`seed:jmdict`;
  fixture em `seeds/fixtures/`).
- `packages/core` — serviço FSRS (`newCardState`, `reviewCard`,
  `previewIntervals`) sobre `ts-fsrs`, mapeado 1:1 às colunas de cards/logs;
  também `freqTier` (`freq.ts`, compartilhado entre popup e dicionário).
- `packages/nlp` — interfaces `Tokenizer`/`DictionaryProvider`, adapter `ja/`,
  `getTokenizer`/`getDictionary`, `analyzeLine` e `analyzeLines` (lote: tokeniza
  todas as linhas e resolve os lemas distintos do vídeo numa query só, via
  `lookupMany`). `JaTokenizer` usa **kuromoji.js** (IPADIC) —
  surface/lemma/leitura/pos; `JaDictionary` consulta `word_entries`;
  `resolveWordEntries` preenche `wordEntryId`. Upgrade para SudachiPy fica atrás
  da mesma interface.
- `packages/llm` — contrato (`LlmProvider`, `SubtitleLineCtx`, `PROMPT_VERSION`
  = 2), erros, cifragem BYOK (AES-256-GCM em `crypto.ts`, ciphertext versionado
  `v2:`; rotação com `pnpm --filter @fuchine/worker rotate:key`), cache
  cache-first (`explainLineCached`, single-flight por advisory lock no miss).
  Provider real **OpenAI-compatible** (`minimax` → `api.minimax.io/v1`/`minimax-m3`,
  `openai`, `openai-compatible`) com `translateBatch` (alinhamento 1:1, chunking,
  fallback) e `explainLine` (JSON coerce, ≤4 pontos); `deepl` para MT e
  `FallbackProvider`. O usuário só escolhe `minimax`/`openai` em Settings.
  `resolveUserProvider` decifra a chave BYOK de `user_settings`. Metering: cada
  chamada grava em `llm_usage` (`usage.ts`/`usage-db.ts`, nunca chave nem
  conteúdo). `echo` segue para dev sem chave.
- `apps/web` — Next.js (App Router). Auth.js (NextAuth v5) em `auth.ts`: Google
  OAuth + e-mail (magic link, opcional via SMTP), adapter Drizzle sobre as
  tabelas próprias, sessões em banco, e um `createUser` próprio
  (`lib/auth-registration.ts`) consome o convite e provisiona `user_settings` na
  mesma transação. **Registro controlado** (T2.3): `REGISTRATION=open|invite|closed`
  (default `invite` em produção), allowlists `AUTH_ALLOWED_EMAILS`/
  `AUTH_ALLOWED_DOMAINS`, convites vinculados a e-mail na tabela `invites` (CLI
  `pnpm --filter @fuchine/worker invite add|list|revoke`); política pura em
  `lib/registration.ts`; negação sem enumeração (magic link negado responde
  igual ao sucesso, sem enviar). E2E: `e2e-registration.ts`.
  **Teto da chave da casa** (T2.4): `HOUSE_DAILY_TOKEN_BUDGET` (tokens/dia local,
  somados de `llm_usage` com `key_source='house'`, cache de 30 s por processo,
  `createHouseBudget` em `@fuchine/llm`) pausa explain sem BYOK e tradução em
  cache miss (429 `house_budget`) e o pre-warm do worker; cache e BYOK seguem.
  `HOUSE_EXPLAIN_FALLBACK=false` = explicação nova só com BYOK (403
  `byok_required`); o Player mostra a mensagem do servidor. `/api/health` expõe
  `houseBudget`; CLI `pnpm --filter @fuchine/worker usage`. E2E: `e2e-house-budget.ts`.
  Boot: `instrumentation.ts` aborta (fail-fast) se faltar env obrigatória
  (`DATABASE_URL`, `AUTH_SECRET`, `FUCHINE_ENCRYPTION_KEY`, registro/teto
  inválidos). Security headers + CSP em `next.config.ts`. Rate limits por
  usuário/IP em Redis (`lib/rate-limit.ts`: explain miss/force, translate miss,
  import novo, busca do dicionário, magic link, beacon, click).
  Rotas (29): `app/api/auth/[...nextauth]`, `POST /api/import` (T0.7) e a API de
  estudo (F1, completa): `GET /api/videos` (biblioteca), `GET /api/videos/[id]`
  (payload do player), `POST /api/cards` (minerar, dedup), `GET
  /api/review/queue` + `POST /api/review/[cardId]` (FSRS), `GET /api/dictionary`
  (por id ou busca), `POST /api/lines/[id]/explain` (camada 2, cache-first +
  BYOK) e álbuns (F2): `GET/POST /api/albums`, `PATCH/DELETE /api/albums/[id]`,
  `POST/DELETE /api/albums/[id]/videos` (list com contagem de vídeos, dedup por
  PK composta, ownership por usuário; na biblioteca, "Add to album" abre modal
  com criação inline; E2E em `scripts/e2e-albums.ts`). Também: `GET
  /api/phrases`, `PATCH /api/cards/[id]` (não há `DELETE` ainda — T2.2), flags por
  usuário `POST/DELETE /api/videos/[id]/flags` (`saved`/`hidden`/
  `not_interested` em `user_video_flags`), tradução lazy `POST
  /api/videos/[id]/translate`, dicionário (`browse`, `collection`, `grammar`,
  `saved`, `[id]/examples`, `[id]/saved` — palavras salvas em `saved_words`),
  export Anki `GET /api/export/deck`
  (TSV texto-só, clipe como deep link do YouTube — D2), `DELETE /api/account`
  (cascade), `POST /api/onboarding`, `PATCH /api/settings` e `GET /api/health`
  (`db`/`redis`/`workerAlive`/`houseBudget`). Biblioteca e phrases são
  cursor-paginated com **busca/filtro/sort server-side** (`q`/`category`|`status`/
  `sort` nas rotas paginadas; keyset por sort — valor do sort + id no cursor,
  `lib/list-query.ts` — e contadores reais: `total` da biblioteca e `counts` por
  status das phrases na 1ª página; `usePaginatedList` refaz a página 1 quando os
  params mudam, com epoch guard contra respostas velhas). Exceção deliberada: o
  sort "Most comprehensible" é client-side sobre as páginas carregadas
  (comprehension é agregado por usuário, catalog-sized). **Writers de atividade**
  (`lib/progress.ts`): `POST /api/videos/[id]/progress` (beacon do player a
  cada 15s: ms assistidos + linhas vistas → `user_daily_stats` +
  `user_word_stats.views`) e `POST /api/dictionary/[id]/click` (popup →
  `clicks`); minerar/revisar incrementam `cards_created`/`reviews_done` e
  `reviews_ok/total` por palavra da linha. **Minerar e revisar são transacionais**
  (`db.transaction` em `lib/cards.ts`): o `reviewCardById` grava update do card +
  `review_logs` + bumps de stats atomicamente (card reagendado nunca fica sem log,
  D6), com os tokens da linha vindo no select inicial (join). Comprehension por
  vídeo/usuário (`getComprehensionByVideo` em `lib/study.ts`: % de palavras
  distintas conhecidas — reviewsOk≥1 ou views≥5 — via
  `word_examples`⋈`user_word_stats`, mínimo 10 palavras) alimenta a biblioteca; o
  StatBar da biblioteca usa horas/palavras/streak reais de `getStats` (dias ativos
  vêm só de `user_daily_stats` — 1 linha/dia, sem scan de histórico). O badge de
  review (dashboard/biblioteca) usa `countDueCards` e o "Continue watching" usa
  `getLatestVideo` — em vez de montar a fila/biblioteca inteira só para um número. Metas diárias: `PATCH
  /api/settings` aceita `dailyGoals` (validado com teto por campo, merge
  parcial no jsonb); o stepper "New cards per day" em `/settings` persiste
  `newCardsPerDay`. E2E: `e2e-progress.ts`, `e2e-comprehension.ts`. Lógica testável em
  `lib/` (`import`, `study`, `cards`, `dictionary`, `explain`, `albums`,
  `progress`, `translate` — chunk lazy com `houseMtProvider()`: MT dedicado via
  env `MT_PROVIDER`/`MT_API_KEY` (DeepL recomendado) com `FallbackProvider`
  caindo para o LLM house; o Player traduz o vídeo inteiro em background ao
  abrir — com backoff exponencial + circuit breaker no pump: após 3 falhas
  seguidas para de martelar o provider e o toggle de tradução sinaliza; um fetch
  focal com sucesso rearma); fila lazy em `lib/queue.ts`; `lib/prewarm.ts`
  enfileira no primeiro open do player o pre-warm do resto do vídeo. UI:
  Tailwind v4 (`app/globals.css` importa `@fuchine/ui/theme-map.css` + `@source`
  dos componentes). Telas integradas com dados reais: `/login`, `/onboarding`,
  `/` (dashboard: revisões do dia, metas, "Continue watching"), `/library`,
  `/import` (cola URL → bridge da extensão), `/videos/[id]` (player),
  `/review` + `/summary` (sessão FSRS e resumo), `/phrases`, `/dictionary`,
  `/albums`, `/stats`, `/settings`, `/extension` e `/kana`, mais
  `error`/`global-error`/`not-found`. E2E em `apps/web/scripts/e2e-*.ts`
  (runner `e2e-all.ts`; `e2e-restore-verify.ts` é o verificador manual do
  ensaio de restore).
- `apps/worker` — Worker BullMQ + pipeline de import. Enriquece as legendas
  enviadas pela extensão: camada 0 (`analyzeLines` em lote → tokens +
  dicionário). Jobs com 3 tentativas e backoff exponencial (`@fuchine/jobs`);
  no boot, `reconcileStuckImports` re-enfileira vídeos presos em `processing`;
  a causa de falha vai para `videos.status_reason`. Pós-import, enfileira
  **pre-warm de explicações** (fila `explain`): gera a camada 2 em background
  via provider house — as primeiras `PREWARM_MAX_LINES` (default 150) no import,
  o resto quando o player abre pela primeira vez (`scope: "full"`)
  (`prewarmVideoExplanations` em `@fuchine/llm` — cache-first, idempotente,
  pool interno de 2; pulado se o provider for `echo` ou se o teto da casa
  estourou). O summary do job inclui
  o **spend cumulativo do vídeo** (`getVideoExplainSpend`: soma
  `in_tokens`/`out_tokens`/calls de `llm_usage`, fn `explainLine`) e o worker
  o loga junto de generated/cached/failed. `backfill:explain`
  cobre vídeos antigos. No fim do import, `estimateVideoLevel` grava
  `videos.level_estimate` (mediana do frequency_rank das palavras distintas;
  `src/level.ts`, mínimo 20 palavras ranqueadas; `backfill:level` para vídeos
  antigos). `backfill:daily-stats` semeia `user_daily_stats` com reviews/mineração
  anteriores aos writers (idempotente, reconcilia das tabelas-fonte por dia local,
  não toca em `ms_watched`/`lines_seen`). **Frequência:** `frequency_rank` é derivado dos tags `nfXX` do
  próprio JMdict no seed (`mapper.ts` `nfRankFromTags` — bandas de 500,
  license-clean, sem lista externa); uma lista TSV opcional ainda sobrepõe se
  fornecida. O banco de dev precisa re-rodar o `seed` + `backfill:level` para
  popular os ranks. Outros CLIs do worker: `rotate:key`, `invite`, `usage`.
- `packages/jobs` — nomes das filas (`import`, `explain`), tipos dos jobs,
  conexão Redis e `defaultJobOptions` (retry/backoff).
- `packages/ui` — componentes React + Tailwind v4 documentados no Storybook
  (`AppShell`, `VideoCard`, `Player`, `Login`, …); `src/lib/errors.ts` traduz
  os códigos de erro do servidor (`house_budget`, `byok_required`) em texto de UI.
- `extension/` — MV3 sem build (versão em `manifest.json`, hoje 0.0.7). A
  ingestão primária: o spike de legendas (`tools/spike/`, em GitHub Actions)
  provou que o conteúdo do `timedtext` é **gated** fora de uma sessão de browser
  (exige PO token), então `inject.js` (mundo MAIN) intercepta a legenda que o
  próprio player baixa — validado em browser real (55 linhas de uma faixa JP
  manual; re-fetch pelo servidor deu 0 bytes). Dois caminhos: popup no YouTube
  e bridge in-app (`bridge.js` + `background.js`: o app em `/import` pede, a
  extensão abre a aba, liga o CC, captura, importa e responde). Instância
  configurável no popup, permissão de origin em runtime. Falta: rodar contra
  uma instância https ao vivo, token de API (T2.11), WXT + Web Store (T2.10).
  Fetch server-side (T0.8) segue só como fallback.

**Operação.** `docker-compose.yml` sobe `postgres` e `redis` (sem porta no
host, senhas por env), `migrate`, `web`, `worker`, `caddy` (TLS automático com
`SITE_ADDRESS`, `Caddyfile`) e, no profile `backup`, `db-backup`
(`scripts/pg-backup.sh`; restore com `scripts/pg-restore.sh`, ensaiado em
2026-07-20). Imagens em `apps/web/Dockerfile` e `apps/worker/Dockerfile` (ao
atualizar o repo, `docker compose up -d --build`). `TZ` fixa por instância,
igual em web e worker (define o "hoje" dos streaks). Runbook em
`docs/DEPLOY_CHECKLIST.md`.

Comandos: `pnpm dev`, `pnpm typecheck`, `pnpm test` (turbo `test` — roda os
testes de todos os pacotes; o CI usa este, não só o web), `pnpm build`,
`pnpm db:generate`, `pnpm db:migrate`; E2E com
`pnpm --filter @fuchine/web e2e:run` (precisa de Postgres).

**Lacunas conhecidas** (todas na fila do roadmap): sem `DELETE /api/cards/:id`
nem ESLint no CI (T2.2); sem limite de tamanho de requisição nem
`frame-ancestors` (T2.5); sem release/tag/imagem publicada (T2.9); sem admin
nem denúncia de conteúdo, ver `backlog/catalog-visibility-decision.md` (T2.13).
