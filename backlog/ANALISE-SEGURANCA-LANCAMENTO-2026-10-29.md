# Análise de projeto, segurança e milestones de lançamento — 2026-10-29

Terceira onda de análise, depois de [AUDITORIA-2026-07-06](AUDITORIA-2026-07-06.md)
(código), [PRODUCAO-2026-07-06](PRODUCAO-2026-07-06.md) (operação) e
[CORRECOES-PRE-DEPLOY-2026-07-10](CORRECOES-PRE-DEPLOY-2026-07-10.md). Cobre
quatro perguntas: **em que etapa o projeto está**, **como está a segurança**,
**que falhas existem** e **quais milestones levam ao ar**.

**Método.** Leitura integral de `apps/web` (auth, as 29 rotas de API, `lib/`),
`apps/worker`, `packages/{llm,jobs,db}`, `extension/`, compose + Caddy +
Dockerfiles e os workflows; `pnpm install`, `pnpm typecheck` (8/8 verde),
`pnpm test` (tudo verde), `pnpm audit` (14 avisos, 3 em dependências de
produção); busca por segredos no histórico do git. Não houve execução contra
uma instância viva (sem Postgres/Redis nesta sessão) — tudo é leitura de código,
testes unitários e análise de configuração.

---

## 0. Resumo executivo

- **Etapa real:** o código está três meses à frente da documentação. F0 e F1
  concluídas; F2 ~80% (extensão funcional, álbuns, dicionário, frases, stats,
  biblioteca compartilhada, export Anki, exclusão de conta); Portão 1 de
  produção fechado (compose + Caddy/TLS + backups ensaiados + `/api/health` +
  fail-fast de env). Nunca houve release, tag, imagem publicada nem instância
  pública. Atividade parou entre 2026-07-20 e 2026-10-14 (um único PR de deps
  desde então).
- **Segurança:** base sólida — isolamento por usuário em todas as rotas, BYOK
  AES-256-GCM correto e versionado, sem SQL injection nem `innerHTML`, rate
  limits nas superfícies que gastam dinheiro, Postgres/Redis sem porta no host,
  web não-root atrás do Caddy. **Nenhum achado crítico de código.** O risco
  dominante é de **exposição e abuso**, não de bug: registro aberto (qualquer
  conta Google vira usuário e gasta a chave house), sem limite de tamanho de
  requisição, sem proteção anti-clickjacking, segredos entregues a todos os
  containers e um patch de `nodemailer` pendente em produção.
- **Veredito:** pronto para **self-host pessoal** depois do milestone M1
  (1–2 sessões de hardening). **Instância compartilhada** (amigos/comunidade)
  exige M4 (allowlist, admin mínimo, quotas em dinheiro). Cloud paga segue F3,
  só com sinais de demanda.

---

## 1. Em que etapa estamos

### 1.1 Fases do roadmap (ARQUITETURA §10) — estado real

| Fase | Critério de pronto | Estado | Evidência |
|---|---|---|---|
| **F0 — Fundação** | URL colada vira vídeo `done` com tokens, dicionário e tradução | ✅ Concluída | Extensão captura legenda → `POST /api/import` → worker camada 0 (`pipeline.ts`); tradução ficou lazy por chunk (`lib/translate.ts`, DeepL/LLM com fallback) — mudança deliberada em relação ao plano, documentada no código |
| **F1 — MVP usável** | "Dá para estudar 30 min por dia de verdade" + repo publicável | ✅ Concluída (T1.1–T1.9); T1.10 parcial | Player com legendas duplas, popup, explain cache-first, mining, revisão FSRS, settings BYOK, estados vazios/erro, README-landing com GIF, NOTICE, CI. **Falta só publicar** (release, imagens, anúncio) |
| **F2 — Alcance** | Extensão em 1 clique; biblioteca nasce do cache compartilhado | 🟡 ~80% | Extensão MV3 funcional (sem WXT, fora da Web Store); álbuns, dicionário/busca, lista de frases, stats, biblioteca compartilhada, flags por usuário, export Anki — tudo implementado e com E2E. Pendente: decisão de visibilidade do catálogo, publicação da extensão |
| **F3 — Diferenciais** | Só com sinais de demanda | ⚪ Não iniciada | `/kana` existe como página; Listening/Shadowing/Plans são só HTML em `claude-design/`. Módulo cloud: nada — correto |

### 1.2 Portões de produção (PRODUCAO-2026-07-06)

| Portão | Estado |
|---|---|
| **1 — OSS self-host, 1 usuário** | ✅ Fechado pelo PR #19 + ensaio backup→restore OPS-4 (2026-07-20, PASS 8/8) |
| **2 — Instância compartilhada** | 🔴 Aberto: `catalog-visibility-decision` (sem arquivo) + os achados **A1, A2, B1, B4, G1** desta análise |
| **3 — Cloud paga** | ⚪ Deliberadamente vazio |

### 1.3 Saúde do código (medido nesta sessão)

| Verificação | Resultado |
|---|---|
| `pnpm typecheck` | 8/8 pacotes verdes |
| `pnpm test` | web 166 · llm 37 · worker 29 · ui 20 · db 9 — tudo verde |
| E2E (`e2e-all.ts`) | 12 suítes, rodam no CI contra Postgres real |
| `pnpm lint` | script existe (`next lint`) mas **não há config ESLint** e o CI não roda |
| Releases / tags | nenhum; imagens Docker não publicadas |
| Histórico | 55 commits, 24 PRs; nenhum `.env` jamais commitado; nenhum segredo real no histórico |

### 1.4 Drift documental (atrapalha quem entra no repo — e as sessões de IA)

- **`CLAUDE.md` → "Estado atual"** ainda diz "Fase 0 (Fundação)… T0.1–T0.7 e
  T0.9 prontos… Próximo: UI de estudo (F1)". Está três meses atrás do código e
  é o primeiro arquivo que qualquer sessão lê.
- **`ROADMAP_ENGENHARIA.md`** não marca nenhuma tarefa como feita e diz que
  "nada da F2 começa antes da F1 fechar" — F2 já quase fechou.
- **`DEPLOY_CHECKLIST.md` §1** mantém 🔒 em quatro itens resolvidos pelo PR #19.
  Ele, `PRODUCAO` e `CORRECOES` linkam onze arquivos de backlog que foram
  apagados (`deploy-story-missing`, `tls-and-security-headers`,
  `env-validation-fail-fast`, `backups-restore-missing`,
  `extension-hardcoded-origin`, `health-endpoints-missing`,
  `import-jobs-no-retry`, `llm-usage-metering`, `timezone-streaks-decision`,
  `db-pool-config`, `encryption-key-ops`). `catalog-visibility-decision.md` é
  citado como existente e não existe.
- **`extension/README.md`** diz "not yet tested end-to-end" e lista como
  limitação o `ytInitialPlayerResponse` estar stale — ambos já resolvidos
  (interceptação em `inject.js`, validada em browser real segundo o CLAUDE.md).
- **`extension/popup.html`** mostra "build v0.0.4"; o manifest está em 0.0.7.
- **`INVENTARIO_TELAS.md`** marca Shadowing e Quiz de listening como 🟢
  (núcleo) embora sejam F3.

---

## 2. Cibersegurança

### 2.1 O que está bem (verificado linha a linha)

- **Autorização:** todas as 27 rotas autenticadas chamam `auth()` e escopam
  por `session.user.id`; recursos privados (cards, álbuns, flags, saved words,
  settings, account) filtram por `userId` no `WHERE`. Catálogo de vídeos é
  global por decisão (D3). Sem IDOR. Todas as páginas redirecionam para
  `/login` sem sessão.
- **BYOK:** AES-256-GCM, IV aleatório de 12 bytes, tag de 16, prefixo de
  versão `v2:`; a chave nunca volta na API (`hasApiKey` booleano), nunca é
  logada (o `catch` em `explain.ts` loga só o tipo do erro); rotação com
  script dedicado; falha de decifragem degrada para house provider em vez de
  500.
- **Injeção:** Drizzle parametriza tudo; os `sql\`\`` crus usam binds; não há
  `dangerouslySetInnerHTML`/`innerHTML`/`eval` em `apps/` nem em `packages/ui`.
- **Rate limiting:** explain (miss/force), translate, import novo, busca do
  dicionário, magic link (por e-mail **e** por IP), beacon de progresso e
  cliques — tudo em Redis com timeout de 250 ms.
- **Import:** caps em captions (10k), texto (500), título (300), canal (200),
  duração (12h); URL normalizada para `https://www.youtube.com/watch?v=<id>`;
  dedup atômico por `ON CONFLICT`.
- **Sessões:** em banco (revogáveis), cookie `SameSite=Lax`, `AUTH_SECRET` e
  `FUCHINE_ENCRYPTION_KEY` obrigatórios em produção (fail-fast com `exit(1)`).
- **Infra:** Postgres e Redis sem `ports` (só rede interna), Redis com
  `requirepass` + AOF, web só `expose` atrás do Caddy (fecha o bypass do
  `trustHost`), web roda como `nextjs` não-root, HSTS, `nosniff`,
  `Referrer-Policy`, CSP em frames/imagens/objetos, `.dockerignore` exclui
  `.env`, backups nightly com retenção e restore ensaiado.
- **Worker:** `checkEmbeddable` só chama oEmbed do YouTube com `sourceId`
  validado por regex (sem SSRF); o fallback server-side de legendas está
  desligado (retorna `[]`).
- **Extensão:** MV3, `videoId` validado por regex antes de montar a URL, a
  bridge só aceita `postMessage` da própria janela/origem, permissão de host
  para a instância pedida em tempo de execução (não `<all_urls>` fixo).

### 2.2 Achados

Severidade: **Alto** = permite abuso real da instância hoje · **Médio** =
reduz a margem contra um atacante autenticado ou um erro operacional ·
**Baixo** = hardening/robustez · **Info** = anotar, sem ação obrigatória.

| ID | Sev. | Área | Achado | Correção | Esforço |
|---|---|---|---|---|---|
| A1 | **Alto** | Auth | **Registro aberto.** Não há `callbacks.signIn`, allowlist, convite nem `REGISTRATION=closed`. Qualquer conta Google (ou qualquer e-mail, se SMTP ligado) cria usuário na instância | Allowlist por e-mail/domínio via env + modo "fechado" (só usuários existentes) | S |
| A2 | **Alto** | Custo | **Chave house gasta por qualquer usuário.** `explain.ts` cai para `houseProvider()` quando o usuário não tem BYOK; `translate` e o pre-warm do `GET /api/videos/[id]` também usam a chave house. Com A1, o gasto é ilimitado em número de usuários (120 explains/h, 500 chunks/dia, 30 imports/dia **por usuário**) | Resolver A1; teto **global**/dia em tokens ou US$ lido de `llm_usage`; opção `HOUSE_KEY_FOR_BYOK_USERS_ONLY` | S/M |
| B1 | Médio | DoS | **Sem limite de tamanho de requisição.** Caddy não define `request_body max_size`; route handlers do App Router leem `req.json()` sem teto; `POST /api/auth/*` (pré-auth) idem. `notes` e `cardType` em `POST /api/cards` e `PATCH /api/cards/[id]` não têm cap | `request_body { max_size 2MB }` no Caddyfile; cap de `notes` (2 000) e allowlist de `cardType` | S |
| B2 | Médio | Headers | **Sem `frame-ancestors`/`X-Frame-Options`** → clickjacking; CSP sem `default-src`/`script-src`/`form-action` (XSS mitigada só pelo React); sem `Permissions-Policy` | Adicionar `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `Permissions-Policy`, `form-action 'self'`; depois CSP com nonce em Report-Only | S |
| B3 | Médio | Segredos | **`env_file: .env` em todos os serviços**, inclusive `caddy` e `migrate`: `AUTH_SECRET`, `FUCHINE_ENCRYPTION_KEY`, `LLM_API_KEY`, `POSTGRES_PASSWORD` ficam visíveis em `docker inspect` e no ambiente do proxy | Caddy só `SITE_ADDRESS`; web/worker com `environment:` explícito ou `env_file` separados | S |
| B4 | Médio | Deps | **`nodemailer` 10.1.1 em produção** com 3 avisos moderados (parser de endereço; corrigido em ≥ 10.1.4). O override em `pnpm-workspace.yaml` pina `^10.1.1`, então o lock não sobe sozinho. Dev: `storybook` 8.6.18 (2 críticos, patch 8.6.19), `vite` 6.4.3 (1 alto, patch 6.4.4), `@vitest/mocker` (2 moderados). Não há `dependabot.yml` nem `pnpm audit` no CI | Bump + `pnpm audit --prod --audit-level=high` no CI + `dependabot.yml` (npm, github-actions, docker) | S |
| B5 | Médio | Rate limit | **Fail-open no magic link.** Se o Redis cair, `enforceRateLimit` libera tudo — inclusive o envio de e-mail pré-auth (email bombing, custo SMTP). A chave por IP lê o primeiro `x-forwarded-for`: seguro atrás do Caddy (descarta XFF de cliente não confiável), mas spoofável atrás de outro proxy | Fail-**closed** só para `magicLink`; documentar que o proxy deve sobrescrever XFF | S |
| C1 | Baixo | Export | **TSV Anki com `#html:true` sem escape.** `cell()` em `lib/export.ts` injeta texto da legenda, tradução e notas crus. Uma legenda maliciosa importada por A (`<img onerror=…>`) chega ao webview do Anki de B ao exportar | Escapar `& < > "` em `cell()` | XS |
| C2 | Baixo | Robustez | **IDs de rota não validados como UUID.** `/api/videos/abc`, `/api/dictionary?id=abc`, `/api/lines/x/explain`, `/api/cards/x` etc. explodem em `invalid input syntax for type uuid` → 500 não tratado (ruído de log, sondagem por erro) | Guard `isUuid()` → 404/400 em todas as rotas `[id]` | S |
| C3 | Baixo | DoS leve | **`/api/dictionary/browse?q=`** sem cap de tamanho, sem `escapeLike` (`%`/`_` viram curinga) e sem rate limit; `ILIKE '%q%'` em `lemma`/`reading` não tem índice trigram → seq scan de ~298k linhas por tecla | `slice(0,100)` + `escapeLike` + reusar o limite `dictionarySearch`; índice trgm em lemma/reading se a busca ficar | S |
| C4 | Baixo | Auth | **E-mail do magic link monta HTML com a URL sem escape** e o host vem de `trustHost` (já documentado). Só explorável com bypass do proxy, que o compose fecha | Escapar a URL (ou usar o `html()` padrão do Auth.js); manter o aviso no checklist | XS |
| C5 | Baixo | Container | **Worker roda como root**, com toolchain completa (`tsx` + devDependencies) e código-fonte inteiro na imagem; web é não-root e standalone | `USER node`; compilar para JS e instalar só prod no estágio final | M |
| C6 | Baixo | Boot | **`FUCHINE_ENCRYPTION_KEY` só é checada por presença**; uma chave com tamanho errado passa no fail-fast e o primeiro `PATCH /api/settings` com chave dá 500 | Validar base64 de 32 bytes em `instrumentation.ts` | XS |
| C7 | Baixo | Sessão | Sessões de 30 dias sem idle timeout, sem "sair de todos os dispositivos", sem log de eventos de segurança (login, chave salva/removida, conta apagada); linhas expiradas de `sessions`/`verification_tokens` não são purgadas | `maxAge`/`updateAge` explícitos; job de limpeza; log estruturado de eventos | S |
| C8 | Baixo | CSRF | Rotas mutadoras confiam só no cookie `SameSite=Lax` (hoje suficiente). Sem checagem de `Origin`/`Sec-Fetch-Site` como defesa em profundidade | `middleware.ts` que rejeita mutações cross-site; não afrouxar `SameSite` | S |
| D1 | Info | Extensão | `inject.js` instrumenta `fetch`/XHR em **todo** `youtube.com` (mundo MAIN) e guarda corpos de legenda em `window.__fuchine` (legível pela página — são dados da própria página, impacto nulo); `optional_host_permissions: https://*/*` é amplo; distribuição "load unpacked" = banner de aviso do Chrome e **sem auto-update** (correções de segurança não chegam); autenticação por cookie cross-origin depende da permissão de host | WXT + Chrome Web Store; token de API por usuário para `/api/import` (desacopla do cookie); restringir `optional_host_permissions` | M |
| D2 | Info | Cache | Prompt injection via legenda (já anotado em B5 de 2026-07-10) e `force` regenera o cache **compartilhado**: uma explicação envenenada chega a todos | Manter caps; "reportar explicação" + purga admin (ver G1) | — |
| D3 | Info | CI | Actions pinadas por tag maior (`@v4`), não por SHA; sem CodeQL; sem scan de imagem; `tools/spike/captions.mjs:27` contém a chave pública do Innertube do YouTube (não é segredo, mas dispara scanners) | Pinar por SHA, CodeQL, Trivy, comentário/allowlist para a chave pública | S |
| D4 | Info | DCO | Três commits têm `Signed-off-by: Claude <noreply@anthropic.com>` — o DCO é uma certificação de pessoa | Assinar com o mantenedor (`git commit -s`) | XS |
| D5 | Info | Ops | `/api/health` público (intencional); sem CORS (correto); Redis `requirepass` na linha de comando (visível em `ps`) | Nada obrigatório; `--requirepass` pode vir de arquivo | — |

#### Detalhe dos achados de maior impacto

**A1 + A2 — Registro aberto × chave house.** `apps/web/auth.ts` registra os
providers e nenhum `callbacks.signIn`; o evento `createUser` provisiona
`user_settings` para qualquer um. Num VPS com Google OAuth publicado, o
*único* segredo que protege a instância é a URL. Cada novo usuário recebe
sozinho 120 gerações de explicação por hora e 500 chunks de tradução por dia
na **sua** chave (`explain.ts` → `houseProvider()` quando não há BYOK;
`translate.ts` → `houseMtProvider()`), mais o pre-warm de vídeo inteiro
disparado por `GET /api/videos/[id]` (`lib/prewarm.ts`). Os limites são por
usuário, não globais — o teto real de gasto é "número de contas Google no
mundo". Correção mínima: `AUTH_ALLOWED_EMAILS` / `AUTH_ALLOWED_DOMAINS` +
`REGISTRATION=open|invite|closed` checados em `callbacks.signIn`; teto global
diário lido de `llm_usage` (a tabela já existe, migration 0015).

**B1 — Tamanho de requisição.** O Caddyfile tem só `encode gzip` +
`reverse_proxy`; o Next App Router não limita o corpo de route handlers. Um
`POST /api/cards` de 200 MB é lido inteiro em memória antes de qualquer
validação; `notes` entra sem cap no banco. Pré-auth, `POST /api/auth/signin`
sofre o mesmo. Uma linha no Caddyfile resolve a camada de borda.

**B3 — Segredos no Caddy.** `docker-compose.yml` dá `env_file: .env` ao
serviço `caddy`, que só precisa de `SITE_ADDRESS`. Um RCE no proxy (a única
superfície pública) entregaria a chave de cifragem BYOK e o `AUTH_SECRET`
sem precisar tocar na rede interna.

### 2.3 Dependências (pnpm audit, 2026-10-29)

| Pacote | Versão | Patch | Sev. | Escopo |
|---|---|---|---|---|
| nodemailer | 10.1.1 | ≥ 10.1.4 | 3 × moderado | **produção** (`apps/web`) |
| storybook / @storybook/core | 8.6.18 | ≥ 8.6.19 | 2 × crítico, 2 × alto | dev (`packages/ui`) |
| vite | 6.4.3 | ≥ 6.4.4 | 1 alto, 3 moderado, 1 baixo | dev (`packages/ui`) |
| @vitest/mocker | — | — | 2 × moderado | dev (`apps/web`) |

Versões de runtime principais: Next 15.5.28, next-auth 5.0.0-beta.32 (+
`@auth/core` ≥ 0.41.3 via override), drizzle-orm 0.45.2, bullmq 5.78.1,
postgres 3.4.9, react 19.2.7. O PR #24 (2026-10-14) fechou os alertas do
Dependabot da época; os quatro acima surgiram depois — sem `dependabot.yml`
nem `pnpm audit` no CI, a lista volta a crescer em silêncio.

### 2.4 Extensão de browser

Além de D1: a extensão está correta para o que faz. Pontos de atenção para o
lançamento (não são bugs): (1) sem Web Store, cada usuário carrega a pasta em
modo desenvolvedor e vê o banner "desative extensões em modo de desenvolvedor"
a cada abertura do Chrome; (2) sem auto-update, uma correção de segurança no
`inject.js` exige reinstalação manual; (3) o `README` dela desencoraja ao
dizer que nunca foi testada. A migração para WXT já está prevista em
ARQUITETURA §8.

### 2.5 Infra e CI

Compose está bem desenhado (ordem `migrate → web/worker → caddy`,
healthchecks, volumes nomeados, backup opt-in). Faltam: limite de corpo e
rate limit de borda no Caddy,
imagens pinadas por digest (`postgres:16-alpine`, `redis:7-alpine`,
`caddy:2-alpine`, `node:22-alpine`), e um alvo de publicação das imagens
(GHCR) para quem não quer buildar. CI roda typecheck/test/build/E2E/DCO — não
roda lint, audit, CodeQL nem scan de imagem.

---

## 3. Falhas funcionais e de qualidade (não-segurança)

| # | Onde | Problema | Correção |
|---|---|---|---|
| F1 | `packages/ui/.../Player.tsx:745` ↔ `apps/web/app/api/cards/[id]/route.ts` | O **"Undo" da mineração chama `DELETE /api/cards/:id`, que não existe** (a rota só exporta `PATCH`) → 405 engolido pelo `catch`; o card fica criado e o usuário acha que desfez | Adicionar `DELETE` escopado ao usuário (cascade em `review_logs`) + teste |
| F2 | `CLAUDE.md`, `ROADMAP_ENGENHARIA.md`, `DEPLOY_CHECKLIST.md`, `PRODUCAO`, `CORRECOES` | Drift documental de §1.4 (estado "Fase 0", links órfãos, 🔒 em itens feitos) | Reconciliar num único commit `docs:` |
| F3 | `extension/popup.html` / `extension/README.md` | Versão de build e limitações desatualizadas | Sincronizar com `manifest.json` 0.0.7 |
| F4 | `apps/web/package.json` → `lint` | `next lint` sem config; CI não lint | ESLint flat config + `pnpm lint` no CI |
| F5 | Repositório | Sem tag/release/CHANGELOG; sem imagens publicadas | `v0.1.0` + GHCR + Release Notes (ver M3) |
| F6 | `docs/` | Documentação de arquitetura/roadmap/backlog em português para um lançamento OSS internacional (README em inglês) | Pelo menos `docs/ARCHITECTURE.md` e `SELF_HOSTING.md` em inglês antes de M3 |

---

## 4. Milestones para colocar no ar

"No ar" tem três alvos diferentes, com exigências diferentes; os milestones
seguem essa ordem. Esforço em sessões (≈ uma sessão de Claude Code cada
tarefa S; M = 2–3; L = 4+).

### M0 — Verdade do repositório (1 sessão)

- [x] Reescrever "Estado atual" do `CLAUDE.md` com o §1 desta análise (F0/F1
      feitas, F2 ~80%, Portão 1 fechado, próximos = M1/M2).
- [x] Marcar T0.x/T1.x como feitas no `ROADMAP_ENGENHARIA.md`; adicionar M1–M5
      como a nova fila.
- [x] Limpar os links órfãos em `DEPLOY_CHECKLIST`, `PRODUCAO`, `CORRECOES`;
      criar `backlog/catalog-visibility-decision.md`.
- [x] Corrigir **F1** (`DELETE /api/cards/:id`), F3 (extensão), F4 (lint).
- [x] **B4:** bump nodemailer ≥ 10.1.4, storybook ≥ 8.6.19, vite ≥ 6.4.4,
      vitest; `dependabot.yml`; `pnpm audit --prod --audit-level=high` no CI.

**Pronto quando:** `pnpm audit --prod` limpo, CI com lint + audit verde, e um
leitor novo do `CLAUDE.md` sabe em que fase o projeto está.

### M1 — Hardening pré-exposição (1–2 sessões) · bloqueia qualquer instância com IP público

- [x] **A1** allowlist/`REGISTRATION` em `callbacks.signIn` (+ E2E: e-mail
      fora da lista recebe 403 e não cria `users`).
- [x] **A2** teto global diário de tokens/US$ para a chave house, lido de
      `llm_usage`; recusa com 429 e mensagem clara quando estourar.
- [x] **B1** `request_body { max_size 2MB }` no Caddyfile; cap de `notes`;
      allowlist de `cardType`.
- [x] **B2** `frame-ancestors 'none'`, `X-Frame-Options: DENY`,
      `Permissions-Policy`, `form-action 'self'`.
- [x] **B3** Caddy sem `env_file`; segredos só em web/worker/migrate.
- [x] **B5** fail-closed para `magicLink`.
- [x] **C1, C2, C3, C4, C6** (todos XS/S; cabem numa sessão).
- [x] Teste de regressão: um `vitest` que importa cada `route.ts` de
      `app/api` e garante 401 sem sessão (protege contra a próxima rota
      esquecida — hoje não há `middleware.ts`).

**Pronto quando:** checklist acima verde, E2E verdes, e um usuário com conta
Google fora da allowlist não consegue entrar.

### M2 — Primeira instância no ar (self-host do mantenedor, 1 usuário) · 1–2 sessões + o dia do deploy

Executar `docs/DEPLOY_CHECKLIST.md` de ponta a ponta num VPS real:

- [ ] Domínio + `SITE_ADDRESS`; Caddy emite o certificado.
- [ ] Google OAuth com consent screen **publicada** e redirect URI https.
- [ ] (Se magic link) SMTP com SPF/DKIM/DMARC validados; teste em Gmail e
      Outlook.
- [ ] `FUCHINE_ENCRYPTION_KEY` e `AUTH_SECRET` novos, guardados no cofre junto
      do backup; `--profile backup` ligado.
- [ ] Seed JMdict + `backfill:level`; backup pós-seed.
- [ ] Extensão apontada para o domínio: import real, player, explain (miss e
      hit), mine, review, stats.
- [ ] Monitor externo em `/api/health` (UptimeRobot ou similar) com alerta
      para `workerAlive=false`.
- [ ] Medir RSS do worker num import real (kuromoji) e fixar o plano do VPS.

**Pronto quando:** o loop inteiro roda no domínio real por 7 dias, o backup
diário gera arquivos e um restore de amostra passa.

### M3 — Lançamento OSS público (F1 · T1.10) · 2–3 sessões

- [ ] **F6**: `docs/ARCHITECTURE.md` e `docs/SELF_HOSTING.md` em inglês.
- [ ] Release `v0.1.0`: tag, notas, imagens `fuchine-web`/`fuchine-worker` no
      GHCR (workflow de publish), compose apontando para as imagens.
- [ ] Extensão: zip de release no GitHub + submissão à Chrome Web Store (ou
      WXT primeiro, se o tempo permitir — D1).
- [ ] **D3**: pinar actions por SHA, CodeQL, Trivy na imagem.
- [ ] Revisar `SECURITY.md` (adicionar escopo da extensão) e abrir GitHub
      Security Advisories + Dependabot alerts.
- [ ] Anúncio (r/LearnJapanese, comunidades Refold/AJATT) com o GIF.

**Pronto quando:** um estranho sobe uma instância em < 30 min seguindo só o
README, sem `pnpm` no host; a extensão instala da Web Store (ou do zip) e
importa contra ela.

### M4 — Instância compartilhada (amigos/comunidade · Portão 2) · 3–5 sessões

- [ ] Decisão de visibilidade do catálogo escrita (D3: global, hide por
      usuário já existe) + "reportar vídeo/explicação".
- [ ] **G1 — Admin mínimo** (`ADMIN_EMAILS`): listar usuários, bloquear/apagar
      usuário, apagar vídeo (cascade), purgar explicação, ver gasto por
      usuário/dia em `llm_usage`. Sem isso, moderação = `psql`.
- [ ] Quotas por usuário em dinheiro (não só contagem) + painel "Uso" simples
      (a tela "Uso & cota" do inventário).
- [ ] **C7**: logs estruturados (pino) com eventos de segurança, limpeza de
      `sessions`/`verification_tokens`, retenção de `llm_usage`.
- [ ] Rate limit de borda no Caddy (por IP) para `/api/auth/*` e `/api/import`.
- [ ] **C5** worker não-root e sem toolchain.
- [ ] Termos de uso + política de privacidade mínimos (o que é compartilhado:
      catálogo, cache de explicações; o que é privado: cards, stats, chave).
- [ ] Teste de carga leve (k6) em `/api/videos`, `/api/review/queue` e
      `/api/lines/:id/explain` com 20 usuários simultâneos.

**Pronto quando:** 10–20 usuários por 30 dias sem intervenção manual, gasto
de LLM dentro do teto, nenhum 5xx recorrente nos logs.

### M5 — Cloud paga (F3) · só com os sinais de ARQUITETURA §2.3

Stripe + `user_plan` (já no schema) + quotas por plano, LGPD (export e
exclusão completa — exclusão já existe), SLA de backup, pentest externo antes
de cobrar, CSP estrita com nonce, WAF. Fora do escopo desta análise detalhar.

---

## 5. Melhorias propostas (além das correções)

1. **Teste de cobertura de auth por rota** (M1): o único mecanismo que impede
   uma rota nova sem `auth()` é a disciplina — um teste que varre `app/api/**`
   custa uma hora e fecha a classe inteira de bug.
2. **Token de API por usuário para a extensão** (M3/M4): hoje o `POST
   /api/import` cross-origin depende do cookie de sessão + permissão de host.
   Um token revogável em Settings elimina a dependência de `SameSite` e
   permite importar de qualquer cliente (scripts, mobile) sem abrir CSRF.
3. **Observabilidade mínima** (M2/M4): request id por requisição, logs JSON,
   contadores de fila (`waiting`/`failed`) no `/api/health`, alerta de
   `failed` > 0, e um rastreador de erros self-hosted (GlitchTip/Sentry).
4. **Jobs de higiene** (M4): purga de sessões expiradas e tokens de
   verificação, retenção de `llm_usage` (90 dias agregados), `VACUUM` de
   `word_examples` após exclusões de vídeo.
5. **Supply chain** (M3): SHA-pinning, CodeQL, Trivy, SBOM na release,
   `pnpm install --frozen-lockfile` já existe — manter.
6. **CSP estrita com nonce** (M4→M5): hoje a CSP não cobre scripts; o Next
   suporta nonce por requisição via `middleware.ts`. Começar em Report-Only.
7. **Separar "house key para quem não tem BYOK" como opção explícita**
   (M1): é uma decisão de produto que hoje está implícita no `catch` de
   `explain.ts`. Num self-host pessoal é conveniente; numa instância
   compartilhada é o maior custo variável.
8. **Documentação em inglês** (M3): README já é; arquitetura, contrato de IA
   e self-host precisam ser, ou os contribuidores externos não chegam.

---

## 6. Apêndice — evidências

- `pnpm install --frozen-lockfile --ignore-scripts` → ok.
- `pnpm typecheck` → `Tasks: 8 successful, 8 total`.
- `pnpm test` → `@fuchine/web` 21 arquivos / 166 testes; `@fuchine/llm` 5 /
  37; `@fuchine/worker` 6 / 29; `@fuchine/ui` 3 / 20; `@fuchine/db` 2 / 9.
- `pnpm audit` → 14 avisos (2 críticos, 3 altos, 8 moderados, 1 baixo);
  `pnpm audit --prod` → 3 moderados (nodemailer).
- `git log --all --diff-filter=A -- '.env*'` → só `.env.example`.
- Busca por padrões de chave (`sk-…`, `AIza…`, chaves privadas, `ghp_…`) no
  histórico → apenas a chave pública do Innertube em `tools/spike`.
- Rotas de API: 29 arquivos `route.ts`; 27 chamam `auth()`; as duas
  exceções (`/api/health`, `/api/auth/[...nextauth]`) são intencionais.
- Sinks de HTML: nenhum `dangerouslySetInnerHTML`/`innerHTML`/`eval` em
  `apps/` e `packages/ui/src`.
- Fetch de saída no servidor: só `apps/worker/src/embeddable.ts` (oEmbed com
  id validado) e o seed do JMdict (GitHub Releases).

*Manter este arquivo como índice do Portão 2: ao fechar um achado, marcar
aqui e remover o item — como foi feito nos índices anteriores.*
