# Fuchine — Roadmap de engenharia

**Versão 0.2 · 29 de outubro de 2026** (v0.1: 13 de junho de 2026)

Este é o companheiro executável do `ARQUITETURA.md`. A arquitetura diz **o quê
e por quê**; este roadmap diz **o que fazer em seguida**, quebrado em tarefas
tamanho-sessão, na ordem das dependências, cada uma com uma definição de pronto
verificável.

> **Revisão 0.2.** Fases 0 e 1 concluídas; Fase 2 ~80% construída mas nunca
> lançada. A fila foi refeita a partir de dois documentos de 2026-10-29:
> [`backlog/ANALISE-SEGURANCA-LANCAMENTO-2026-10-29.md`](../backlog/ANALISE-SEGURANCA-LANCAMENTO-2026-10-29.md)
> (achados A1–D5, bugs F1–F6, milestones M0–M5) e
> [`docs/PESQUISA_MERCADO-2026-10-29.md`](PESQUISA_MERCADO-2026-10-29.md)
> (o que adicionar, o que inovar, o que rejeitar). Cada tarefa cita os ids que
> fecha; o mapa de rastreabilidade no fim garante que nenhum achado ficou sem
> tarefa.

## Como usar com o Claude Code

Cada tarefa abaixo é aproximadamente **uma sessão de Claude Code**. O fluxo: você
abre uma sessão, passa a tarefa (o id + a descrição), aponta os documentos
relevantes, e usa a coluna **"Pronto quando"** como critério de aceite — só fecha
a tarefa quando aquilo for verdade. As decisões de fundo estão no `CLAUDE.md` e
nos docs de `docs/`; não repita, referencie. Esforço: **S** = 1 sessão, **M** =
2–3, **L** = 4+ (quebre na hora se passar de uma sessão).

## Princípios deste roadmap

- **Construa na vertical, não na horizontal.** Um vídeo estudável de ponta a
  ponta antes de qualquer largura. Vale igual para a Fase 3: um laço fechado
  (assistir → conhecer → escolher → minerar → revisar → recalibrar) antes de
  qualquer feature nova.
- **Lançar antes de inovar.** A Fase 2 (hardening + instância + release) vem
  antes da Fase 3 inteira. Nada de produto novo entra numa instância que
  qualquer conta Google consegue usar de graça com a chave da casa.
- **Só BYOK até a Fase 4.** O módulo cloud (billing, cotas, chaves gerenciadas)
  não existe antes dos sinais de demanda (`ARQUITETURA.md` §2.3).
- **A lista de rejeitados é contrato.** O que a pesquisa de mercado rejeitou
  (§5 "Rejeitado e por quê") não entra sem revisar aquele documento primeiro.
- **Mudança de schema passa pelo ERD.** Tarefas marcadas 🗄️ alteram o schema;
  registrar a coluna/tabela no `CONTRATO_IA.md`/ERD na mesma sessão.

## Portão de risco (resolvido)

O spike de legendas (`tools/spike/`) deu veredito **server-side gated**: a
extensão de browser é a ingestão primária e captura a requisição do próprio
player (PO token). O fallback server-side (T0.8) é best-effort e pode quebrar
sem aviso — nunca o promova a caminho principal.

---

## Fase 0 — Fundação ✅ concluída

**Meta:** colar uma URL resulta num vídeo totalmente processado no banco.
Todas as tarefas abaixo estão feitas; a tradução migrou do import para chunks
lazy no player (`lib/translate.ts`), mudança deliberada documentada no código.

| # | Tarefa | Estado |
|---|---|---|
| T0.1 | Esqueleto do monorepo | ✅ |
| T0.2 | Dev local + licença | ✅ |
| T0.3 | Pacote db + primeira migration | ✅ (16 migrations hoje) |
| T0.4 | Seed do JMdict + frequência | ✅ (`frequency_rank` derivado dos tags `nfXX`) |
| T0.5 | Autenticação | ✅ (Google + magic link, sessões em banco) |
| T0.6 | Pacote nlp (camada 0) | ✅ (kuromoji/IPADIC) |
| T0.7 | API de import + registro de vídeo | ✅ (captions vêm da extensão) |
| T0.8 | Worker — job da camada 0 | ✅ (fallback server-side desligado) |
| T0.9 | Pacote llm + camada 1 | ✅ (lazy por chunk; DeepL/LLM com fallback) |

## Fase 1 — MVP usável ✅ concluída (exceto o ato de publicar)

| # | Tarefa | Estado |
|---|---|---|
| T1.1 | App shell + design tokens | ✅ |
| T1.2 | Home/Library | ✅ (busca/filtro/sort server-side, cursor) |
| T1.3 | Player — repouso | ✅ |
| T1.4 | Player — popup de dicionário | ✅ |
| T1.5 | Player — explicação IA | ✅ (cache-first, pre-warm, circuit breaker) |
| T1.6 | Mineração | ✅ (bug: "Undo" chama rota inexistente → T2.2) |
| T1.7 | Sessão de revisão FSRS | ✅ (ts-fsrs 4.x) |
| T1.8 | Configurações | ✅ (BYOK AES-GCM, metas) |
| T1.9 | Estados vazios/erro | ✅ |
| T1.10 | Preparação de lançamento | ◐ README/NOTICE/CI prontos; **release, imagens e anúncio não** → T2.9–T2.12 |

Também já construído, fora do plano original da F1: álbuns, dicionário (busca,
coleção, status), lista de frases, stats, flags por usuário, export Anki (TSV
de 4 colunas), exclusão de conta, `/api/health`, backups, compose + Caddy,
rate limits, metering em `llm_usage`, extensão MV3 funcional.

---

## Fase 2 — Lançar (milestones M0 → M3)

**Meta:** uma instância do mantenedor no ar por 7 dias, depois o repositório
publicado com release e extensão instalável. Nada da Fase 3 começa antes de
T2.6 (hardening) fechar.

### Bloco A — Verdade do repositório (M0)

| # | Tarefa | Depende de | Esforço | Pronto quando |
|---|---|---|---|---|
| T2.1 | ✅ **Reconciliar a documentação.** Reescrever "Estado atual" do `CLAUDE.md`; limpar os 11 links órfãos e os 🔒 já resolvidos em `DEPLOY_CHECKLIST`, `PRODUCAO`, `CORRECOES`; criar `backlog/catalog-visibility-decision.md`; `extension/README.md` e `popup.html` (versão 0.0.7, limitações já resolvidas); `INVENTARIO_TELAS.md` (Shadowing/Listening → F3); **confirmar o preço atual do HayaiLearn** e atualizar `ARQUITETURA.md` §2.3 e `ANALISE_CUSTOS.md` §6 (hoje "~US$ 10/mês"; a pesquisa achou US$ 7/US$ 14†); re-assinar os 3 commits com `Signed-off-by` de IA (D4) se for abrir PR. Fecha: F2, F3, D4, implicação "âncora de preço". | — | S | Nenhum link quebrado em `docs/` e `backlog/`; um leitor novo do `CLAUDE.md` sabe em que fase o projeto está; os docs citam o preço verificado do HayaiLearn com data. |
| T2.2 | ✅ **Bugs e CI de base.** Adicionar `DELETE /api/cards/:id` escopado ao usuário + E2E do "Undo" (F1); ESLint flat config + `pnpm lint` no CI (F4); `pnpm audit --prod --audit-level=high` no CI + `.github/dependabot.yml` (npm, github-actions, docker); bump `nodemailer ≥ 10.1.4`, `storybook ≥ 8.6.19`, `vite ≥ 6.4.4`, vitest (B4). | — | S | `pnpm audit --prod` limpo; CI roda typecheck + lint + test + audit + build + E2E verdes; desfazer uma mineração apaga o card (E2E). |

### Bloco B — Hardening pré-exposição (M1) · bloqueia qualquer IP público

| # | Tarefa | Depende de | Esforço | Pronto quando |
|---|---|---|---|---|
| T2.3 | ✅ **Registro controlado (A1).** `REGISTRATION=open\|invite\|closed` (default `invite` em produção) + `AUTH_ALLOWED_EMAILS`/`AUTH_ALLOWED_DOMAINS` checados em `callbacks.signIn`; convites vinculados a e-mail (🗄️ tabela `invites`) consumidos atomicamente num `createUser` próprio; CLI `invite add/list/revoke` no worker; negação sem enumeração (magic link responde igual ao sucesso). Spec e plano: `docs/plans/2026-10-30-registration-control-spec.md` + `docs/plans/2026-10-30-registration-control.md`. | T2.2 | S | E2E: e-mail fora da lista é negado e **não** cria linha em `users`; convite é de uso único e expira; produção sem `REGISTRATION` age como `invite`; usuários existentes entram em `closed`. |
| T2.4 | ✅ **Teto global de gasto da chave house (A2).** `HOUSE_DAILY_TOKEN_BUDGET` (tokens/dia local) somado de `llm_usage` por `key_source` (🗄️ coluna nova); ao estourar, explain sem BYOK e tradução em cache miss respondem 429 `house_budget` e o pre-warm para, com cache servindo; `HOUSE_EXPLAIN_FALLBACK=false` (explicação nova só com BYOK, 403 `byok_required`); `houseBudget` no `/api/health` (só o estado; números no CLI `usage`). Spec: `docs/plans/2026-10-30-house-budget-spec.md`. | T2.2 | S | E2E: estouro → 429 nos caminhos da casa e pre-warm para, cache hit segue 200, BYOK não é limitado; com o fallback desligado, usuário sem BYOK vê "adicione sua chave". |
| T2.5 | ✅ **Borda, headers e segredos (B1, B2, B3, B5).** Caddyfile `request_body { max_size 2MB }`; cap de `notes` (2 000) e allowlist de `cardType`; `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `Permissions-Policy`, `form-action 'self'`; `caddy` sem `env_file` (só `SITE_ADDRESS`), segredos só em web/worker/migrate; limitador do magic link **fail-closed**; documentar que o proxy deve sobrescrever `X-Forwarded-For`. | T2.2 | S | `curl` de 3 MB → 413; `docker inspect fuchine-caddy-1` sem `AUTH_SECRET`/`FUCHINE_ENCRYPTION_KEY`; headers presentes em `/`; com Redis parado, o magic link recusa o envio. |
| T2.6 | ✅ **Robustez de rotas (C1, C2, C3, C4, C6, C8).** `isUuid()` em toda rota `[id]` → 400/404; escape `& < > "` em `cell()` do export; `/api/dictionary/browse?q=` com `slice(0,100)` + `escapeLike` + limite `dictionarySearch`; escapar a URL no HTML do magic link; validar `FUCHINE_ENCRYPTION_KEY` (base64 de 32 bytes) no boot; `middleware.ts` rejeitando mutações cross-site (`Origin`/`Sec-Fetch-Site`); **teste que varre `app/api/**` e garante 401 sem sessão**. | T2.2 | S | Teste de cobertura de auth verde e obrigatório no CI; `GET /api/videos/abc` → 404, não 500; uma legenda com `<img onerror>` sai escapada no TSV. |

### Bloco C — Primeira instância no ar (M2)

| # | Tarefa | Depende de | Esforço | Pronto quando |
|---|---|---|---|---|
| T2.7 | **Deploy do mantenedor.** Executar `DEPLOY_CHECKLIST.md` num VPS real: domínio + Caddy, Google OAuth com consent screen publicada, SMTP com SPF/DKIM/DMARC (se magic link), chaves novas no cofre com o backup, seed JMdict + `backfill:level`, backup pós-seed, extensão apontada ao domínio, monitor externo em `/api/health` com alerta de `workerAlive=false`, medir RSS do worker num import real e fixar o plano. | T2.3–T2.6 | S + 7 dias | Loop inteiro (import → player → explain miss/hit → mine → review → stats) roda 7 dias no domínio real; backup diário gera arquivos; um restore de amostra passa; `REGISTRATION` não está `open`. |

### Bloco D — Lançamento OSS (M3)

| # | Tarefa | Depende de | Esforço | Pronto quando |
|---|---|---|---|---|
| T2.8 | ✅ **Docs em inglês (F6).** `docs/ARCHITECTURE.md` (tradução do essencial + D1–D8), `docs/SELF_HOSTING.md` (compose, env, backup, **modo local via provider OpenAI-compatible → Ollama**, allowlist, teto de gasto), `docs/EXTENSION.md`. Português continua como fonte interna. | T2.7 | S | Um estranho sobe uma instância em < 30 min seguindo só README + SELF_HOSTING, sem `pnpm` no host. |
| T2.9 | ◐ **Release v0.1.0 e supply chain (F5, D3).** Tag + CHANGELOG; workflow de publish das imagens `fuchine-web`/`fuchine-worker` no GHCR; compose apontando para imagens com digest; actions pinadas por SHA; CodeQL; Trivy na imagem; comentário/allowlist para a chave pública do Innertube em `tools/spike`. | T2.8 | S | `docker compose up -d` com as imagens publicadas sobe a stack sem build; CodeQL e Trivy verdes no release. |
| T2.10 | ◐ **Extensão publicável (D1).** Migrar para WXT (ou manter MV3 com build mínimo); nome sem "YouTube"; `optional_host_permissions` restrito; zip de release no GitHub; submissão à Chrome Web Store; **página de status/quebras conhecidas** no site + link no popup. | T2.9 | M | Instalação pela Web Store (ou zip) importa contra a instância https; uma quebra simulada aparece na página de status em < 1 h de trabalho. |
| T2.11 | **Token de API por usuário para `/api/import`.** 🗄️ `api_tokens` (hash, criado/revogado); gerado em Settings; a extensão usa `Authorization: Bearer` em vez do cookie cross-origin; rate limit por token. | T2.6 | S | Import com cookie e com token passam; token revogado → 401; a extensão não depende mais de `SameSite`. |
| T2.12 | **Anúncio.** Posts em r/LearnJapanese, Discords Refold/TheMoeWay, fóruns WaniKani/Bunpro; PRs para `donkuri/japanese-resources` e `awesome-immersion` com o preset Lapis (T3.3) e o import Yomitan (T3.4) como credenciais; GIF do loop; não se apresentar como "AI app". | T2.10, T3.3 | S | Posts publicados; issues/stars chegando; `REGISTRATION=invite` na instância pública do mantenedor. |

---

## Fase 2.5 — Instância compartilhada (Portão 2 · M4)

**Meta:** 10–20 usuários por 30 dias sem intervenção manual, gasto previsível.

| # | Tarefa | Depende de | Esforço | Pronto quando |
|---|---|---|---|---|
| T2.13 | **Admin mínimo (G1, D2).** `ADMIN_EMAILS`; `/admin`: listar/bloquear/apagar usuário, apagar vídeo (cascade), purgar explicação, gasto por usuário/dia de `llm_usage`; "reportar vídeo/explicação" para usuários (🗄️ `reports`); escrever a decisão de visibilidade do catálogo (D3: global, hide por usuário) em `ARQUITETURA.md`. | T2.7 | M | Moderar um vídeo ofensivo e um usuário abusivo sem `psql`; relatório de gasto por usuário dos últimos 30 dias em uma tela. |
| T2.14 | **Quotas por usuário em dinheiro + tela "Uso".** Teto por usuário/dia derivado de `llm_usage` × preço por modelo (tabela de preços em config); tela "Uso & cota" do inventário; rate limit de borda no Caddy para `/api/auth/*` e `/api/import`. | T2.4, T2.13 | S | Usuário que estoura vê a cota e o reset; o operador vê o total do dia; `ab`/k6 contra `/api/auth/signin` é cortado na borda. |
| T2.15 | **Observabilidade e higiene (C5, C7).** Logs JSON (pino) com request id e eventos de segurança (login, chave salva/removida, conta apagada, convite); job de limpeza de `sessions`/`verification_tokens` expirados e retenção de `llm_usage` (90 dias agregados); contadores de fila (`waiting`/`failed`) no `/api/health`; worker `USER node` sem toolchain; termos de uso + política de privacidade mínimos; teste de carga leve (k6, 20 usuários) em `/api/videos`, `/api/review/queue`, `/api/lines/:id/explain`. | T2.13 | M | Alerta dispara com `failed > 0`; nenhuma linha de log contém chave ou ciphertext; p95 < 500 ms nas 3 rotas com 20 usuários; `docker exec worker whoami` ≠ root. |

---

## Fase 3 — Produto: fechar o laço (pesquisa de mercado)

**Meta:** o laço assistir → conhecer → escolher → minerar → revisar no clipe →
recalibrar, que nenhum concorrente fecha sobre o YouTube. Ordem de execução
recomendada pela pesquisa: ganhos baratos e medidos primeiro (T3.1–T3.5),
depois o diferencial (T3.9–T3.10), com o eval set (T3.12) correndo em paralelo.

### Bloco E — Table stakes do ecossistema japonês

| # | Tarefa | Depende de | Esforço | Pronto quando |
|---|---|---|---|---|
| T3.1 | **FSRS-7 + otimização por usuário no browser (inovação 2).** Subir `ts-fsrs` para a versão com FSRS-7 default; 🗄️ `user_settings.fsrs_params` (jsonb) + `desired_retention`; otimizador `fsrs-browser` (WASM) sobre `review_logs` com mínimo de reviews; seletor de retenção desejada (default 0,9; faixa 0,85–0,9) com `expected_workload` ("due amanhã" projetado). | T2.6 | S/M | Usuário com ≥ N reviews otimiza no cliente e vê log loss antes/depois; cards reagendam com FSRS-7; teste de regressão sobre `review_logs` de fixture. |
| T3.2 | **Pitch accent (Kanjium).** Verificar `LICENSE.txt` (README diz CC BY-SA 4.0); 🗄️ `word_pitch` (ou coluna em `word_entries`) seedada de `accents.txt`; render 平板/頭高/中高/尾高 no popup e no dicionário com proveniência; `NOTICE` atualizado. | — | S | Palavra no popup mostra posição e tipo; fonte e licença visíveis; seed idempotente. |
| T3.3 | **Export preset Lapis + estado FSRS.** TSV com os campos do Lapis (Expression, ExpressionReading, ExpressionFurigana, Sentence com `<b>`alvo`</b>`, MainDefinition, Glossary, PitchPosition, PitchCategories, Frequency, FreqSort, MiscInfo = título + URL + timestamp) **mais** stability/difficulty/due/reps/lapses; mapeamento de campos configurável; `addNote` via AnkiConnect como opção de push (nunca sync). | T3.2 | S | TSV importa no Anki com o note type Lapis sem ajuste manual; o histórico FSRS acompanha o card; AnkiConnect push cria a nota com áudio ausente declarado. |
| T3.4 | **Importar dicionários no formato Yomitan.** 🗄️ `dictionary_sources` + tabelas de termos/pitch/frequência; upload de zip (termos, pitch, frequência por domínio: YoutubeFreqV3, Netflix, Anime); monolíngues como fonte secundária no popup; ordem de fontes por usuário. | T3.2 | M | Zip do 新明解 (ou similar) e um de frequência importam e aparecem no popup; `FreqSort` do export usa a lista escolhida. |
| T3.5 | ✅ **Defaults e carga de SRS.** Default de 10 cards novos/dia (onboarding e settings); `maxReviewsPerDay` e orçamento de tempo na UI; projeção de "due amanhã" na home. Fecha o NEED nº 2 da pesquisa. | T3.1 | S | Novo usuário nasce com 10; a home mostra "amanhã: N reviews ≈ M min"; E2E dos goals atualizado. |
| T3.6 | ✅ **Fila "mine now, curate later" + "rewatch now".** Minerar em um toque **sem pausar** (card sem definição/nota entra numa fila); sessão de curadoria lista os cards pendentes com popup e explicação já cacheada; ao minerar, opção de repetir o clipe 2–3× (inovação 3, evidência de repetição imediata). | T3.5 | S | Um vídeo de 2 h rende 40 cards sem nenhuma pausa; a curadoria fecha os 40 em uma tela; "rewatch" repete o clipe exato. |
| T3.7 | **Correção de token/leitura por usuário.** 🗄️ `token_overrides` (user, line, posição → surface/lemma/reading/wordEntryId); UI de um clique no popup ("corrigir"); a correção realimenta a palavra-alvo do card, o export e o modelo de conhecidas (T3.9). | T3.6 | S | Corrigir マー ク → マーク persiste, aparece no card e no export; teste cobre ー, contadores (10分) e furigana. |
| T3.8 | ✅ **Player: modos de escuta e sinais de conhecidas.** Primed listening (mostrar → pausar → ocultar → tocar); toggles de ocultar JP/tradução; coloração de palavras por nível (desconhecida/provável/confirmada) sobre a legenda; furigana oculta para palavras confirmadas. Usa `user_word_stats` com a regra atual até T3.9 trocar o modelo. | T3.5 | S | Os 3 modos funcionam no IFrame existente; a coloração muda após um review; sem regressão de sincronização. |

### Bloco F — O diferencial

| # | Tarefa | Depende de | Esforço | Pronto quando |
|---|---|---|---|---|
| T3.9 | **Modelo de palavra conhecida em três níveis + cobertura por token (inovação 1, parte 1).** Níveis desconhecida/provável/confirmada a partir de views/cliques/reviews (+ overrides de T3.7); excluir nomes próprios e interjeições; `getComprehensionByVideo` passa a **cobertura ponderada por token** (principal) + única (secundária) + faixa de confiança; limiares 80/90/95/98 na UI; "marcar como desconhecida" em um clique; `level_estimate` rotulado como estimativa. | T3.7 | M | A biblioteca mostra "cobertura 93% (±4)" por vídeo; teste de fixture reproduz o exemplo jpdb (90% único ≈ 34% corrido); comparação lado a lado com a métrica antiga registrada em `docs/`. |
| T3.10 | **Calibração, i+1 e "Explore" (inovação 1, parte 2).** Calibrar "provável" contra `review_logs` (se falha no 1º review, o limiar estava otimista) com relatório periódico; i+1 por linha no player e na curadoria; "Explore": próximo vídeo por cobertura-alvo 90–95%, novidade ∩ frequência, mesmo canal (narrow viewing); lista curada inicial de 10–20 canais de comprehensible input com nível (cold start); metadados com `fetched_at` e expurgo em 30 dias, **sem Data API**. | T3.9 | M | "Explore" ordena o catálogo por cobertura pessoal; linhas i+1 marcadas; a calibração roda num script e ajusta o limiar; o cold start mostra os canais curados a um usuário novo. |
| T3.11 | ✅ **Variantes de review no clipe exato (inovação 3).** Listen → reveal (áudio, depois JP, depois tradução); cloze da palavra-alvo com comparação tolerante kana/kanji; "shadow this line" (loop do clipe, gravação só em memória, playback A/B, contorno de F0 via `pitchy` opcional, **sem nota**). | T3.6 | M | Os 3 modos existem na sessão de revisão; nada de áudio é enviado ao servidor; grade FSRS continua único. |
| T3.12 | ✅ **Qualidade medida da explicação (inovação 4).** Eval set de ~200 linhas com gabarito humano em `packages/llm/eval/`; runner (`pnpm eval:explain`) que roda a cada mudança de prompt/modelo e publica taxa de acerto em `docs/`; rótulo "AI-generated" + `prompt_version` + link "verificar no dicionário" na UI; instrução de registro (casual/polido, voz do personagem) no prompt com bump de `PROMPT_VERSION`; escolher o modelo mais barato que passe. | — (paralelo) | M | Taxa de acerto publicada e reproduzível; trocar o prompt sem rodar o eval falha no CI; a UI mostra o rótulo e a versão. |
| T3.13 | **PWA de review (mobile).** Manifest + service worker; sessão de revisão com `playsinline`, tela ligada, clipes curtos; **sem** prometer áudio em background. | T3.11 | S | 20 cards revisados num celular sem app nativo; Lighthouse PWA verde. |
| T3.14 | **Preço e cobrança (preparação, só docs).** `ANALISE_CUSTOS.md` v2 com preços de IA de 2026 **confirmados em página oficial**; tiers: US$ 8/mês, anual US$ 59–69, avulso em BRL via Pix (Paddle) para a compra anual; trial 14–30 dias + paywall no hospedado; lista default de providers OpenAI-compatible (Gemini atrás de parecer sobre "not for consumer use"); MoR, MEI/Simples. | T2.13 | S | `ANALISE_CUSTOS.md` v2 aprovada com fontes datadas; decisão de tiers registrada em `ARQUITETURA.md` §2.3. |
| T3.15 | **Spike jurídico YouTube.** Ler o texto literal dos ToS e dos API Services Terms (download, acesso automatizado, identidade do cliente embutido, RMF/overlays); confirmar que as legendas do Fuchine são renderizadas fora do viewport do iframe; decidir se captura de áudio em memória (tabCapture, sem persistência) é aceitável para alinhamento/ASR opt-in em self-host. Registrar como **D9** em `ARQUITETURA.md`. | — | S | Parecer escrito com citações; D9 registrada; T3.16 liberada ou arquivada. |
| T3.16 | **(LATER, gated por T3.15) Alinhamento forçado opt-in.** Qwen3-ForcedAligner-0.6B (ou equivalente) para timestamps por palavra e bordas exatas de clipe, self-host apenas, fluxo stream → align → descartar. | T3.15 | M | Clipe começa/termina na palavra; nenhum byte de mídia persiste; desligado por default. |

---

## Fase 4 — Cloud paga (F3 · M5) · esqueleto, só com os sinais de ARQUITETURA §2.3

Stripe/Paddle + `user_plan` + quotas por plano (T2.14 é o pré-requisito), LGPD
(export de dados; exclusão já existe), SLA de backup, pentest externo antes de
cobrar, CSP estrita com nonce, WAF. Whisper para vídeos sem legenda só após
T3.15. Detalhar ao chegar perto.

## Fora da fila (rejeitados pela pesquisa de mercado, §5)

Chat tutor com IA · scoring de pronúncia/pitch · Netflix/Crunchyroll · app
nativo/áudio em background · WebLLM como default · sync bidirecional com Anki ·
Whisper como caminho padrão · ditado completo · coreano/mandarim agora ·
gamificação pesada e rótulo "AI-first" · debate card de frase vs palavra ·
auto-adição de cards i+1 (sugerir sim, adicionar nunca). Reabrir só revisando o
documento de pesquisa.

---

## Mapa de rastreabilidade

| Origem | Id | Tarefa |
|---|---|---|
| Segurança | A1 registro aberto | T2.3 |
| Segurança | A2 chave house sem teto | T2.4 (+ T2.14) |
| Segurança | B1 body sem limite | T2.5 |
| Segurança | B2 headers | T2.5 |
| Segurança | B3 segredos nos containers | T2.5 |
| Segurança | B4 dependências | T2.2 |
| Segurança | B5 fail-open magic link | T2.5 |
| Segurança | C1 TSV sem escape | T2.6 |
| Segurança | C2 UUID → 500 | T2.6 |
| Segurança | C3 browse `q` | T2.6 |
| Segurança | C4 HTML do magic link | T2.6 |
| Segurança | C5 worker root | T2.15 |
| Segurança | C6 chave não validada no boot | T2.6 |
| Segurança | C7 sessões/logs/higiene | T2.15 |
| Segurança | C8 CSRF em profundidade | T2.6 |
| Segurança | D1 extensão | T2.10, T2.11 |
| Segurança | D2 cache envenenado | T2.13 (reportar/purgar) |
| Segurança | D3 supply chain CI | T2.9 |
| Segurança | D4 DCO | T2.1 |
| Segurança | D5 informativo | — (sem ação) |
| Segurança | G1 admin | T2.13 |
| Bugs | F1 DELETE card | T2.2 |
| Bugs | F2 drift documental | T2.1 |
| Bugs | F3 extensão desatualizada | T2.1 |
| Bugs | F4 lint | T2.2 |
| Bugs | F5 release | T2.9 |
| Bugs | F6 docs em inglês | T2.8 |
| Milestones | M0 / M1 / M2 / M3 / M4 / M5 | T2.1–2.2 / T2.3–2.6 / T2.7 / T2.8–2.12 / T2.13–2.15 / Fase 4 |
| Mercado §4 | preset Lapis + estado FSRS | T3.3 |
| Mercado §4 | pitch accent Kanjium | T3.2 |
| Mercado §4 | import formato Yomitan, monolíngues, frequência por domínio | T3.4 |
| Mercado §4 | fila curar depois | T3.6 |
| Mercado §4 | correção de token | T3.7 |
| Mercado §4 | default 10 cards, orçamento, due amanhã | T3.5 |
| Mercado §4 | primed listening, conhecidas coloridas, furigana | T3.8 |
| Mercado §4 | página de status | T2.10 |
| Mercado §4 | canais CI curados | T3.10 |
| Mercado §4 | modo local documentado | T2.8 |
| Mercado §5 | inovação 1 (modelo de conhecidas, cobertura, i+1, Explore) | T3.9, T3.10 |
| Mercado §5 | inovação 2 (FSRS-7 + otimização) | T3.1 |
| Mercado §5 | inovação 3 (variantes no clipe, rewatch now) | T3.11, T3.6 |
| Mercado §5 | inovação 4 (qualidade medida) | T3.12 |
| Mercado §5 | alinhamento forçado (LATER) | T3.15, T3.16 |
| Mercado §6 | âncora de preço nos docs | T2.1 |
| Mercado §6 | trial/paywall, tier BRL, providers default | T3.14 |
| Mercado §6 | métrica de compreensão | T3.9 |
| Mercado §6 | defaults e fluxo | T3.5, T3.6, T3.7 |
| Mercado §6 | explicação (rótulo, eval, registro) | T3.12 |
| Mercado §6 | desktop-only → PWA; nome da extensão; legendas fora do iframe | T3.13, T2.10, T3.15 |
| Mercado §6 | catálogo sem Data API | T3.10 |
| Mercado §6 | distribuição | T2.12 |

## Caminho crítico

**T2.2 → T2.3–T2.6 → T2.7 → T2.8 → T2.9 → T2.10 → T2.12** põe o produto no ar e
publicado. Em paralelo, a partir de T2.6: **T3.1 → T3.5 → T3.6 → T3.7 → T3.9 →
T3.10** fecha o laço; **T3.2 → T3.3** entrega as credenciais para o anúncio;
**T3.12** corre sozinha. T2.13–T2.15 só quando houver mais de um usuário real.

## Ressalva honesta

Isto é um plano, não uma profecia. A v0.1 previu a extensão na Fase 2 e ela
subiu para a Fase 0; a tradução saiu do import e virou lazy. A v0.2 vai
envelhecer do mesmo jeito: atualize a fila quando o código divergir, e mantenha
a lista de rejeitados como freio — o maior risco do projeto não é um
concorrente, é um mantenedor só com escopo grande demais.
