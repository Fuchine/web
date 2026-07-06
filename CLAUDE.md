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
- `docs/ROADMAP_ENGENHARIA.md` — companheiro executável da arquitetura: tarefas
  tamanho-sessão (T0.x, T1.x), em ordem de dependência, com "Pronto quando".
  **É a fila de trabalho.**
- `docs/CONTRATO_IA.md` — formato de entrada/saída das funções de IA
  (`translateBatch`, `explainLine`) e o contrato de cache. Ancora a coluna
  `ai_explanations.content` e o campo `text_translation`.
- `docs/INVENTARIO_TELAS.md` e `docs/PROMPT_PACK_TELAS.md` — telas do produto
  (o design em si é gerado fora, no Claude Design).
- `screens.md` — guia para gerar telas (handoff para IA): sistema visual,
  fluxo component-first, tokens/utilitários, componentes prontos em
  `@fuchine/ui` e os shapes de API por tela.
- `packages/db/src/schema.ts` — schema Drizzle das 13 tabelas (já verificado).

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

Fase 0 (Fundação). Monorepo pnpm + Turborepo montado e compilando
(`pnpm typecheck` verde nos 6 pacotes; `apps/web` builda no Next 15).

Pacotes e seus pontos de entrada:

- `packages/db` — schema Drizzle (13 tabelas de conteúdo + 3 do adapter Auth.js:
  `accounts`, `sessions`, `verification_tokens`) + tipos jsonb (`Token`,
  `Explanation`, `Definition`, `DailyGoals`) + `createDb()` + `ensureUserSettings`.
  Migrations em `drizzle/` (`0000_init`, `0001_word_entries_unique`,
  `0002_auth_tables`) com meta journal (`pnpm db:migrate`). Seed JMdict +
  frequência em `src/seed/` (`pnpm --filter @fuchine/db seed`; fixture em
  `seeds/fixtures/`).
- `packages/core` — serviço FSRS (`newCardState`, `reviewCard`,
  `previewIntervals`) sobre `ts-fsrs`, mapeado 1:1 às colunas de cards/logs.
- `packages/nlp` — interfaces `Tokenizer`/`DictionaryProvider`, adapter `ja/`,
  `getTokenizer`/`getDictionary` e `analyzeLine` (tokeniza + resolve dicionário).
  `JaTokenizer` usa **kuromoji.js** (IPADIC) — surface/lemma/leitura/pos;
  `JaDictionary` consulta `word_entries`; `resolveWordEntries` preenche
  `wordEntryId`. Upgrade para SudachiPy fica atrás da mesma interface.
- `packages/llm` — contrato (`LlmProvider`, `SubtitleLineCtx`, `PROMPT_VERSION`
  = 1), erros, cifragem BYOK (AES-256-GCM em `crypto.ts`), cache cache-first
  (`explainLineCached`). Provider real **OpenAI-compatible** (`minimax` →
  `api.minimax.io/v1`/`minimax-m3`, `openai`, `openai-compatible`) com
  `translateBatch` (alinhamento 1:1, chunking, fallback) e `explainLine`
  (JSON coerce, ≤4 pontos). `resolveUserProvider` decifra a chave BYOK de
  `user_settings`. `echo` segue para dev sem chave.
- `apps/web` — Next.js (App Router). Auth.js (NextAuth v5) em `auth.ts`: Google
  OAuth + e-mail (magic link, opcional via SMTP), adapter Drizzle sobre as
  tabelas próprias, sessões em banco, e `createUser` provisiona `user_settings`.
  Rotas: `app/api/auth/[...nextauth]`, `POST /api/import` (T0.7) e a API de
  estudo (F1, completa): `GET /api/videos` (biblioteca), `GET /api/videos/[id]`
  (payload do player), `POST /api/cards` (minerar, dedup), `GET
  /api/review/queue` + `POST /api/review/[cardId]` (FSRS), `GET /api/dictionary`
  (por id ou busca), `POST /api/lines/[id]/explain` (camada 2, cache-first +
  BYOK) e álbuns (F2): `GET/POST /api/albums`, `PATCH/DELETE /api/albums/[id]`,
  `POST/DELETE /api/albums/[id]/videos` (list com contagem de vídeos, dedup por
  PK composta, ownership por usuário; na biblioteca, "Add to album" abre modal
  com criação inline; E2E em `scripts/e2e-albums.ts`). **Writers de atividade**
  (`lib/progress.ts`): `POST /api/videos/[id]/progress` (beacon do player a
  cada 15s: ms assistidos + linhas vistas → `user_daily_stats` +
  `user_word_stats.views`) e `POST /api/dictionary/[id]/click` (popup →
  `clicks`); minerar/revisar incrementam `cards_created`/`reviews_done` e
  `reviews_ok/total` por palavra da linha. Comprehension por vídeo/usuário
  (`getComprehensionByVideo` em `lib/study.ts`: % de palavras distintas
  conhecidas — reviewsOk≥1 ou views≥5 — via `word_examples`⋈`user_word_stats`,
  mínimo 10 palavras) alimenta a biblioteca; o StatBar da biblioteca usa
  horas/palavras/streak reais de `getStats`. Metas diárias: `PATCH
  /api/settings` aceita `dailyGoals` (validado com teto por campo, merge
  parcial no jsonb); o stepper "New cards per day" em `/settings` persiste
  `newCardsPerDay`. E2E: `e2e-progress.ts`, `e2e-comprehension.ts`. Lógica testável em
  `lib/` (`import`, `study`, `cards`, `dictionary`, `explain`, `albums`,
  `progress`, `translate` — chunk lazy com `houseMtProvider()`: MT dedicado via
  env `MT_PROVIDER`/`MT_API_KEY` (DeepL recomendado) com `FallbackProvider`
  caindo para o LLM house; o Player traduz o vídeo inteiro em background ao
  abrir); fila lazy em `lib/queue.ts`. UI: Tailwind v4 (`app/globals.css`
  importa `@fuchine/ui/theme-map.css` + `@source` dos componentes); `/login`
  (composição `Login`) e `/` (Home/Library: `AppShell` + `VideoCard` sobre
  `listVideos`, com gate de auth → `/login`). Demais telas a integrar.
- `apps/worker` — Worker BullMQ + pipeline de import. Enriquece as legendas
  enviadas pela extensão: camada 0 (`analyzeLine` → tokens + dicionário).
  Pós-import, enfileira **pre-warm de explicações** (fila `explain`): gera a
  camada 2 do vídeo inteiro em background via provider house
  (`prewarmVideoExplanations` em `@fuchine/llm` — cache-first, idempotente,
  pool interno de 2; pulado se o provider for `echo`). `backfill:explain`
  cobre vídeos antigos. No fim do import, `estimateVideoLevel` grava
  `videos.level_estimate` (mediana do frequency_rank das palavras distintas;
  `src/level.ts`, mínimo 20 palavras ranqueadas; `backfill:level` para vídeos
  antigos). **Frequência:** `frequency_rank` é derivado dos tags `nfXX` do
  próprio JMdict no seed (`mapper.ts` `nfRankFromTags` — bandas de 500,
  license-clean, sem lista externa); uma lista TSV opcional ainda sobrepõe se
  fornecida. O banco de dev precisa re-rodar o `seed` + `backfill:level` para
  popular os ranks. Fetch server-side é só fallback (gated).

`docker-compose.yml` sobe Postgres + Redis. Comandos: `pnpm dev`,
`pnpm typecheck`, `pnpm db:generate`, `pnpm db:migrate`.

Progresso no roadmap: **T0.1–T0.7 e T0.9 prontos**. O spike de legendas
(`tools/spike/`, automatizado em GitHub Actions) deu veredito **server-side
gated** em IP de datacenter e residencial: os metadados da legenda aparecem mas
o conteúdo (timedtext) exige sessão de browser/PO token. **Decisão: a extensão
de browser é a ingestão primária** (sobe da F2 para a F0); ela captura a legenda
no contexto autenticado do usuário e POSTa em `/api/import`. Fetch server-side
fica como fallback.

T0.7 (API de import) está pronto e testado E2E (validação, dedup/cache, fila,
worker enriquecendo tokens+tradução). A **extensão** (`extension/`, MV3 sem
build) está **validada em browser real**: re-buscar a legenda pelo servidor é
gated (0 bytes), mas interceptar a requisição do próprio player (mundo MAIN,
`inject.js`) capturou 55 linhas de uma faixa JP manual. Ela POSTa em
`/api/import`. Falta o round-trip ao vivo (app rodando localmente) e a migração
para WXT (F2). Próximo: UI de estudo (F1). T0.8 (fetch server-side) é fallback.
