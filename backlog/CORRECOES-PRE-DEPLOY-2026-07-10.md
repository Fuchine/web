# Correções pré-deploy — 2026-07-10

Lista consolidada de correções levantadas na auditoria de segurança/qualidade
de código **e** na revisão de prontidão operacional (dia-do-deploy). Cada item
tem severidade, arquivo:linha, cenário concreto e correção recomendada.

Complementa, não substitui, os índices existentes:
[`AUDITORIA-2026-07-06.md`](AUDITORIA-2026-07-06.md) (código),
[`PRODUCAO-2026-07-06.md`](PRODUCAO-2026-07-06.md) (operação) e o runbook
[`docs/DEPLOY_CHECKLIST.md`](../docs/DEPLOY_CHECKLIST.md).

Veredito da auditoria: **BLOQUEAR** enquanto os itens do bloco "Bloqueiam o
deploy" não forem resolvidos.

---

## Conjunto mínimo antes de subir (bloqueiam o deploy)

- [x] **A1** — Rate limit do magic link →
      [ai-endpoints-no-rate-limit.md](ai-endpoints-no-rate-limit.md) (resolvido 2026-07-10)
- [x] **M1** — Explain degrada em vez de dar 500 para provider não implementado →
      [explain-provider-errors-500.md](explain-provider-errors-500.md) (resolvido 2026-07-10, fecha M2 junto)
- [x] **OPS-1** — Mover `pnpm.overrides` para `pnpm-workspace.yaml` →
      [pnpm-overrides-not-applied.md](pnpm-overrides-not-applied.md) (resolvido 2026-07-10)
- [x] **OPS-2** — Fechar as portas de Postgres/Redis no host + trocar senha default →
      [compose-ports-exposed.md](compose-ports-exposed.md) (resolvido 2026-07-10)
- [ ] **OPS-4** — Ensaiar backup → restore (com a chave de cifragem junto) →
      [backup-restore-rehearsal.md](backup-restore-rehearsal.md)

Os demais são hardening/reliability e podem ir logo depois.

### Índice item → arquivo de backlog (verificação de 2026-07-10)

Todos os claims de código foram verificados contra o repositório em
2026-07-10 (o OPS-1 empiricamente — o warning do pnpm reproduz e o lockfile
ainda resolve nodemailer 9.0.1). Itens acionáveis viraram arquivos próprios:

| Item | Backlog | Nota da verificação |
|---|---|---|
| A1 | [ai-endpoints-no-rate-limit.md](ai-endpoints-no-rate-limit.md) | Já era pendência conhecida (item 5); elevado a bloqueador lá. |
| M1 + M2 | [explain-provider-errors-500.md](explain-provider-errors-500.md) | Pior que o descrito: `local` nem existe em `ProviderName`. Fix = as duas metades (restringir + degradar). |
| B1 | [import-url-channel-unbounded.md](import-url-channel-unbounded.md) | Confirmado; normalizar a URL também limpa variantes. |
| B2 | [word-views-no-daily-cap.md](word-views-no-daily-cap.md) | Confirmado; aceitar como não-problema é resolução válida. |
| B3–B5 | — (sem correção; a anotação vive neste arquivo) | Avaliações razoáveis; nada a fazer no launch. |
| OPS-1 | [pnpm-overrides-not-applied.md](pnpm-overrides-not-applied.md) | Confirmado empiricamente. |
| OPS-2 | [compose-ports-exposed.md](compose-ports-exposed.md) | Confirmado; agravante: ports do Docker furam o ufw. |
| OPS-3 | [catalog-visibility-decision.md](catalog-visibility-decision.md) + ressalva da extensão em [PRODUCAO-2026-07-06.md](PRODUCAO-2026-07-06.md) | Já rastreados; sem arquivo novo. |
| OPS-4 | [backup-restore-rehearsal.md](backup-restore-rehearsal.md) | Processo, não código. |

---

## Parte 1 — Correções de código

### A1 · Alto · DoS/abuso — Magic link sem rate limiting
**Arquivos:** [`apps/web/auth.ts:26-31`](../apps/web/auth.ts) ·
[`apps/web/lib/rate-limit.ts:18`](../apps/web/lib/rate-limit.ts)

O limite `magicLink: { limit: 5, windowSeconds: 3_600 }` está **definido mas
nunca chamado** — não há caller no caminho de sign-in, o provider Nodemailer é
registrado direto e não existe `middleware.ts`. O NextAuth Email não limita
envios por conta própria.

**Cenário:** com `EMAIL_SERVER` configurado, POST repetido no endpoint de signin
com o e-mail da vítima → um e-mail por request → email bombing, esgotamento da
cota SMTP e enumeração leve de contas. (Só se aplica quando o login por e-mail
está ligado; deploy só-Google não tem essa superfície.)

**Correção:** envolver `sendVerificationRequest` (ou o handler de signin) com
`enforceRateLimit("magicLink", id)` usando **e-mail-alvo e IP** como chaves
separadas, negando antes de enfileirar o envio. Alternativa: throttle na borda
(WAF/proxy) documentado como o controle oficial.

---

### M1 · Médio · Correção/disponibilidade — Provider não implementado causa 500
**Arquivos:** [`apps/web/lib/settings.ts:10`](../apps/web/lib/settings.ts) ·
[`apps/web/lib/explain.ts:71-79`](../apps/web/lib/explain.ts) ·
[`packages/llm/src/providers/index.ts:86-94`](../packages/llm/src/providers/index.ts)

`ALLOWED_PROVIDERS` aceita `anthropic`, `gemini`, `local`, `openai-compatible`,
mas `createProvider` lança para todos eles (não implementados / exigem
`baseUrl`+`model` não coletados). Em `explainLine`, o `catch` só trata
`MissingApiKeyError`; qualquer outro erro é relançado e a rota não tem try/catch
→ **500 não tratado**.

**Cenário:** usuário salva `llmProvider: "anthropic"` via `PATCH /api/settings`
(aceito) → todo cache-miss em `POST /api/lines/[id]/explain` dá 500. Viola
"falha de IA degrada, não quebra".

**Correção:** restringir `ALLOWED_PROVIDERS` aos implementados (`minimax`,
`openai`), **ou** em `explain.ts` cair para `houseProvider()` em qualquer falha
de construção do provider (não só `MissingApiKeyError`). Fecha M1 e M2 juntos.

---

### M2 · Médio · Correção/disponibilidade — Falha de decifragem BYOK dá 500
**Arquivos:** [`packages/llm/src/resolve.ts:34`](../packages/llm/src/resolve.ts) ·
[`apps/web/lib/explain.ts:73-79`](../apps/web/lib/explain.ts)

Se `FUCHINE_ENCRYPTION_KEY` for rotacionada/alterada, `decryptApiKey` lança
(auth tag do GCM). Não é `MissingApiKeyError` → mesmo caminho do M1 → 500. Sem
vazamento da chave (mensagem do GCM é genérica), mas a rota quebra em vez de
degradar.

**Correção:** mesma do M1 — capturar a falha de decifragem e cair para o house
provider; opcionalmente logar `userId` (nunca a chave) para diagnóstico de
rotação.

---

### B1 · Baixo · DoS leve / XSS latente — `channel` e `url` do import sem limite
**Arquivo:** [`apps/web/lib/import.ts:104-114`](../apps/web/lib/import.ts) ·
[`apps/web/lib/study.ts:104`](../apps/web/lib/study.ts)

`captions`, `text`, `title` e `durationS` têm tetos; `channel` e `url` (crus)
não. `url` é validado só o suficiente para extrair o id, mas a string inteira é
persistida e retornada por `GET /api/videos/[id]`. Hoje o front **não** renderiza
`video.url` como href (o player usa `source`+`sourceId`), então o XSS é latente:
um futuro `<a href={video.url}>` aceitaria `javascript:...?v=abcdefghijk`.

**Correção:** normalizar a URL armazenada para
`https://www.youtube.com/watch?v=${sourceId}` em vez de guardar a string crua, e
limitar `channel` (ex.: 200 chars).

---

### B2 · Baixo · Correção — Beacon infla `user_word_stats.views` do próprio usuário
**Arquivo:** [`apps/web/lib/progress.ts:107-124,171-174`](../apps/web/lib/progress.ts)

`ms_watched` tem teto diário; `bumpWordViews` não tem cap e não está na mesma
transação que `bumpDailyStats`. Dentro do limite de 3/15s, um loop pode enviar
500 lineIds únicos por beacon e inflar views (views≥5 marca "known"). **Impacto
só no próprio usuário** — sem custo nem efeito cross-user.

**Correção:** opcional — cap diário para `views` análogo ao de `ms_watched`, ou
aceitar como não-problema (auto-sabotagem).

---

### B3 · Baixo/Informacional · Hardening — Sem CSRF token explícito
As rotas mutadoras confiam apenas no cookie de sessão. Com o default
`SameSite=Lax` do NextAuth v5, um `fetch` cross-site não envia o cookie — CSRF
mitigado na prática. Sem defesa em profundidade se o `SameSite` for afrouxado.

**Correção:** nenhuma obrigatória para launch; anotar a dependência do
`SameSite=Lax` como o controle e não afrouxá-lo.

---

### B4 · Baixo · Exposição de dados — `/api/health` não autenticado
**Arquivo:** [`apps/web/app/api/health/route.ts:61-72`](../apps/web/app/api/health/route.ts)

Retorna `db`/`redis`/`workerAlive`. Intencional para probes; divulgação mínima
de estado de infra. Aceitável — anotar; se incomodar, restringir por IP no proxy.

---

### B5 · Informacional · Injeção — Prompt injection na legenda
**Arquivo:** [`packages/llm/src/prompts.ts`](../packages/llm/src/prompts.ts)

Texto da legenda entra nos prompts via `JSON.stringify`. Impacto limitado:
explicação/tradução envenenada por linha, cacheada; `force` é rate-limited e a
falha degrada. Inerente a apps LLM; sem caminho de vazamento de outro contexto.

**Correção:** nenhuma obrigatória; manter a degradação e a cap de `force`.

---

## Parte 2 — Correções operacionais / infra

### OPS-1 · Médio · Supply chain — `pnpm.overrides` silenciosamente ignorado
**Arquivos:** [`package.json`](../package.json) (bloco `pnpm.overrides`) →
[`pnpm-workspace.yaml`](../pnpm-workspace.yaml)

O pnpm 10.33 **não lê mais** `pnpm.overrides` do package.json (warning em toda
invocação). Os 4 overrides de segurança — `nodemailer@<9.0.1`, `esbuild@<0.25.0`,
`postcss@<8.5.10`, `uuid@<11.1.1` — precisam viver em `pnpm-workspace.yaml`
(onde o `onlyBuiltDependencies` já foi migrado). Hoje o lock ainda carrega as
versões corrigidas (`pnpm audit` limpo), mas o próximo `pnpm update` reintroduz
as versões vulneráveis sem aviso.

**Correção:** mover o bloco `overrides` para `pnpm-workspace.yaml`, rodar
`pnpm install` e confirmar que o lock continua resolvendo nodemailer 9.x etc.

---

### OPS-2 · Médio (depende da rede) · Exposição — Postgres/Redis publicados no host
**Arquivo:** [`docker-compose.yml:16-19,35-36`](../docker-compose.yml)

`postgres` e `redis` fazem `ports: 5432:5432` / `6379:6379` (ligam em 0.0.0.0),
com senha `fuchine:fuchine` e Redis sem `requirepass`. Num VPS com IP público =
banco e fila expostos à internet. O web já está correto (só `expose`, atrás do
Caddy).

**Correção:** em produção, remover os `ports` de postgres/redis (deixar só na
rede interna do compose) ou bindar em `127.0.0.1:5432`; trocar a senha default
por env; setar `requirepass` no Redis.

---

### OPS-3 · Bloqueio de produto/processo · Itens de backlog ainda abertos
- **`extension-hardcoded-origin`** (🔒) — extensão não validada contra instância
  https ao vivo; o smoke test do loop inteiro depende disso.
- **`catalog-visibility-decision`** — decisão de produto (todos veem os vídeos de
  todos, correto por D3, mas precisa virar decisão declarada antes de instância
  compartilhada). Não bloqueia self-host de 1 usuário.

---

## Parte 3 — Verificações que só um ensaio real resolve

Do [`docs/DEPLOY_CHECKLIST.md`](../docs/DEPLOY_CHECKLIST.md) — não auditáveis por
leitura de código:

- [ ] **OPS-4 — Backup + restore ensaiado** antes do primeiro usuário. O
  `db-backup` é opt-in (`--profile backup`); fazer restore de amostra num banco
  limpo. Guardar o `FUCHINE_ENCRYPTION_KEY` junto do dump — perdê-la invalida
  todas as chaves BYOK.
- [ ] **Deliverability do magic link** — SPF/DKIM/DMARC do remetente; testar
  login contra Gmail e Outlook (e-mail em spam = instância inutilizável).
- [ ] **RSS real do worker** — kuromoji carrega o IPADIC inteiro na memória no
  primeiro tokenize; medir com um import de teste (≥512 MB–1 GB).
- [ ] **`pnpm db:migrate` em Postgres gerenciado** — migration 0013 roda
  `CREATE EXTENSION pg_trgm`; pré-criar como superuser se o papel for travado.
- [ ] **Kill test do worker** + observar fila na 1ª semana (vídeo preso em
  `processing`).

---

## Superfícies auditadas e OK (não precisam correção)

Isolamento multi-tenant (todo recurso privado escopado ao `session.user.id`; sem
IDOR); BYOK AES-256-GCM correto (só ciphertext no banco, nunca na resposta/log);
sem SQL injection (todo `sql\`\`` parametrizado); sem XSS via
`dangerouslySetInnerHTML`; `DELETE /api/account` limpo (FKs `ON DELETE CASCADE`
confirmadas nas migrations, conteúdo compartilhado retido); concorrência
race-safe (mine/review/translate/album); circuit breaker + backoff do pump de
tradução; prewarm com pool e cap; segredos só via env + fail-fast no boot;
extensão MV3 com permissões escopadas e validação de origem/id; `pnpm audit`
limpo.
