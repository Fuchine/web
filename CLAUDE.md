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
  (`explainLineCached`) e `createProvider()` (só `echo` implementado).
- `apps/web` — Next.js (App Router). Auth.js (NextAuth v5) em `auth.ts`: Google
  OAuth + e-mail (magic link, opcional via SMTP), adapter Drizzle sobre as
  tabelas próprias, sessões em banco, e `createUser` provisiona `user_settings`.
  Rota em `app/api/auth/[...nextauth]`. UI de estudo chega na F1.
- `apps/worker` — Worker BullMQ + pipeline de import. Camada 0 usa `analyzeLine`
  (tokens + dicionário resolvidos). O fetch de legendas do YouTube e a tradução
  real (`translateBatch`) ainda são **stubs/TODOs**.

`docker-compose.yml` sobe Postgres + Redis. Comandos: `pnpm dev`,
`pnpm typecheck`, `pnpm db:generate`, `pnpm db:migrate`.

Progresso no roadmap: **T0.1, T0.2, T0.3, T0.4, T0.5, T0.6 prontos**. T0.8/T0.9
têm o esqueleto compilando, mas ainda não cumprem o "Pronto quando" (fetch de
legendas e `translateBatch` reais continuam stub).

Próxima tarefa não bloqueada (ver `docs/ROADMAP_ENGENHARIA.md`): T0.9 (provider
LLM real + `translateBatch` com alinhamento 1:1). T0.7/T0.8 dependem do spike
de legendas (tarefa do dono do projeto, não do Claude Code).
