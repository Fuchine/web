# Checklist do primeiro deploy

**Versão 0.2 · 30 de outubro de 2026** (v0.1: 6 de julho de 2026)

Runbook executável do primeiro deploy de uma instância Fuchine (self-host ou a
futura cloud). Complementa os índices do backlog:
[PRODUCAO-2026-07-06](../backlog/PRODUCAO-2026-07-06.md) lista **o que
construir** antes do deploy; este documento lista **o que conferir e executar
no dia**. Itens marcados 🔒 dependem de backlog ainda aberto — hoje nenhum:
os bloqueadores da v0.1 foram resolvidos no PR #19 (2026-07-09) e o ensaio de
backup → restore foi feito em 2026-07-20 (Apêndice A). Os arquivos de backlog
correspondentes foram removidos ao fechar (PR #21); o histórico fica no git.

---

## 1. Pré-requisitos de build (bloqueiam o deploy)

- [ ] Imagens de web + worker buildam (`apps/web/Dockerfile`,
      `apps/worker/Dockerfile`; `docker compose up -d --build`) — resolvido no
      PR #19
- [ ] Proxy TLS configurado: serviço `caddy` do compose + `Caddyfile`
      (Let's Encrypt automático com `SITE_ADDRESS=<domínio>`) ou proxy próprio;
      security headers + CSP vêm do `next.config.ts` — resolvido no PR #19
- [ ] Boot do web limpo: `apps/web/instrumentation.ts` aborta se faltar env
      obrigatória (`DATABASE_URL`, `AUTH_SECRET`, `FUCHINE_ENCRYPTION_KEY`,
      registro, teto da casa) — resolvido no PR #19
- [ ] Backup agendado ligado (`docker compose --profile backup up -d`, sidecar
      `db-backup` com `scripts/pg-backup.sh`) **antes** do primeiro usuário
      real; restore com `scripts/pg-restore.sh`, ensaiado em 2026-07-20
      (Apêndice A)

## 2. Configuração (o `.env` de produção)

- [ ] `DATABASE_URL` e `REDIS_URL` apontando para a infra de produção
- [ ] `AUTH_SECRET` novo (`openssl rand -base64 32`) — nunca o de dev
- [ ] `AUTH_URL=https://<domínio>` (https, sem barra final)
- [ ] `FUCHINE_ENCRYPTION_KEY` nova — e **backup dela junto do banco**:
      perder a chave invalida todas as chaves BYOK salvas (ciphertext
      versionado `v2:`; rotação com
      `pnpm --filter @fuchine/worker rotate:key` — resolvido no PR #19)
- [ ] `TZ` da instância definida e documentada (streaks bucketizam pela TZ do
      processo; decisão do PR #19: TZ fixa por instância, igual em web e
      worker — default `America/Sao_Paulo` no compose)
- [ ] `LLM_PROVIDER`/`LLM_API_KEY` reais (echo em produção = IA silenciosamente
      desligada) · `MT_PROVIDER=deepl` se aplicável
- [ ] `DEPLOYMENT_MODE=self-host`
- [ ] `REGISTRATION` decidido (`invite` é o default de produção; nunca `open`
      numa instância pública) e `AUTH_ALLOWED_EMAILS` com o seu e-mail — sem
      isso ninguém cria a primeira conta. Convites:
      `docker compose run --rm worker pnpm --filter @fuchine/worker invite add <email>`
- [ ] `HOUSE_DAILY_TOKEN_BUDGET` definido (teto diário de tokens da chave da
      casa) e decidido `HOUSE_EXPLAIN_FALLBACK` (`false` = explicação nova só
      com BYOK). Conferir o gasto do dia com
      `docker compose run --rm worker pnpm --filter @fuchine/worker usage`

## 3. Autenticação (as pegadinhas de produção)

- [ ] **Google OAuth**: redirect URI
      `https://<domínio>/api/auth/callback/google` cadastrada; consent screen
      **publicada** (em modo "Testing" o Google limita a 100 usuários e exibe
      tela de app não verificado)
- [ ] **Magic link**: `EMAIL_SERVER`/`EMAIL_FROM` configurados; **SPF, DKIM e
      DMARC** do domínio remetente validados (e-mail de login em spam =
      instância inutilizável); enviar um login de teste para Gmail e Outlook
- [ ] **Proxy**: `X-Forwarded-Host`/`X-Forwarded-Proto` setados pelo proxy e o
      container do web **inacessível por fora dele** — `trustHost: true`
      (`auth.ts:50`) confia nesses headers; bypass = risco de envenenamento de
      magic link

## 4. Dimensionamento

- [ ] Worker com **≥ 512 MB–1 GB de RAM**: o kuromoji carrega o IPADIC inteiro
      em memória no primeiro tokenize — medir RSS real com um import de teste
      antes de fixar o plano do VPS
- [ ] Postgres: `max_connections` ≥ 40 com folga (web ~10 + worker ~10 +
      scripts; knob `DB_POOL_MAX`, default 10 no web e 5 no worker — PR #19)
- [ ] Disco: JMdict seedado ≈ 1–2 GB de banco base; +~2 MB por vídeo importado

## 5. Sequência de deploy (ordem importa)

1. `docker compose up -d postgres redis` (e o proxy)
2. `pnpm db:migrate` — a migration `0013` roda `CREATE EXTENSION IF NOT EXISTS
   pg_trgm` (índice de busca do dicionário). Exige um papel com privilégio de
   criar extensões — no Postgres do compose o dono do banco basta; num Postgres
   gerenciado com papel travado, pré-crie a extensão como superusuário
   (`CREATE EXTENSION IF NOT EXISTS pg_trgm;`) **antes** deste passo, senão a
   migration aborta. `pg_trgm` está na allowlist do RDS/Cloud SQL/Supabase.
3. `pnpm --filter @fuchine/db seed:jmdict [frequency.tsv]` — ~298k entries;
   rodar **antes** de abrir tráfego (o dicionário vazio parece bug —
   histórico: assim nasceu o falso "#9" do backlog)
4. `pnpm --filter @fuchine/worker backfill:level` (se houver vídeos migrados)
5. Subir web + worker; conferir logs de boot limpos
6. Congelar um **backup imediato pós-seed** (restore barato do estado zero)

## 6. Smoke test — o loop inteiro, no domínio real

- [ ] Login por **Google** e por **magic link** (recebido fora do spam)
- [ ] Uma conta Google **fora** da allowlist e sem convite é recusada em
      `/login` ("invite-only"), e um magic link para um e-mail não convidado
      mostra "check your e-mail" **sem** enviar nada
- [ ] Extensão apontada para `https://<domínio>` (campo de servidor no popup;
      a permissão do origin é pedida em runtime — PR #19) importa um vídeo real
- [ ] Import processa: status sai de Processing, tokens aparecem
- [ ] Player toca no domínio https (embed com `origin` correto), legenda dupla
      sincronizada, tradução dos chunks chegando
- [ ] Popup de dicionário responde; **Explain** gera (cache miss) e o segundo
      clique é instantâneo (cache hit)
- [ ] Mine → Review → grade → resumo de sessão; stats registram o dia
- [ ] `GET /api/health` responde 200 com `db`/`redis` ok e `workerAlive: true`
- [ ] `GET /api/health` mostra `houseBudget: "ok"` (ou `"unlimited"` se sem teto)
- [ ] Se a CSP foi ligada: thumbnails e o iframe do YouTube carregam sem erro
      de console

## 7. Primeira semana

- [ ] Conferir que o backup diário está de fato gerando arquivos (e fazer um
      restore de amostra)
- [ ] Observar logs do worker: fila vazia estável, sem vídeo preso em
      `processing` (jobs têm 3 tentativas com backoff e o worker re-enfileira
      imports órfãos no boot; a causa de falha fica em `videos.status_reason`)
- [ ] Observar consumo de LLM/DeepL: cada chamada grava em `llm_usage` (resumo
      do dia com `pnpm --filter @fuchine/worker usage`); conferir contra o
      painel do provider na primeira semana
- [ ] Kill test: derrubar o worker e conferir que o compose o reergue e a
      fila drena
- [ ] Revisitar o banner do Dependabot (o PR #24, 2026-10-14, fechou todos os
      alertas abertos até então — conferir se surgiram novos)

---

## Apêndice A — Ensaio de backup → restore (OPS-4)

Rode **uma vez antes do primeiro usuário real** — backup não testado não é
backup. Ferramentas prontas: `scripts/pg-backup.sh` (sidecar `db-backup`) e
`scripts/pg-restore.sh` (a metade que faltava). Registre a data e o resultado
aqui embaixo ao concluir.

1. **Dados de amostra.** Com a stack de pé, crie o mínimo que exercita o que
   importa no restore: um usuário logado (sessão em banco), um vídeo importado
   com legendas, e **uma chave BYOK salva** (`PATCH /api/settings` com `apiKey`;
   ou rode `apps/web/scripts/e2e-settings.ts`, que faz o round-trip BYOK).
2. **Backup.** `docker compose --profile backup up -d`; espere um ciclo ou force
   um dump agora:
   `docker compose exec db-backup sh -c 'pg_dump -Fc "$DATABASE_URL" > /backups/rehearsal.dump'`.
   Copie o arquivo pra fora: `docker compose cp db-backup:/backups/rehearsal.dump ./rehearsal.dump`.
3. **Restore num Postgres limpo** (um container/DB descartável, **não** o de
   produção):
   `DATABASE_URL=postgres://fuchine:<senha>@<host-limpo>:5432/fuchine ./scripts/pg-restore.sh ./rehearsal.dump`.
   Se o schema já andou desde o dump, `pnpm db:migrate` depois.
4. **Verificar** contra o banco restaurado (apontando o app pra ele):
   - [ ] **Login** funciona (a sessão veio no dump).
   - [ ] O **vídeo** aparece com legendas/tokens.
   - [ ] **Decifragem BYOK** — o teste real: com o **mesmo
     `FUCHINE_ENCRYPTION_KEY`** de quando o dump foi tirado, `resolveUserProvider`
     decifra a chave (um Explain/Translate com cache miss usa a chave BYOK; ou
     rode de novo o round-trip do `e2e-settings.ts`). **Com a chave errada, o
     ciphertext AES-GCM é lixo irrecuperável** — é por isso que a chave vai no
     cofre junto do dump, nunca só no disco do servidor.
5. **Registrar** a chave de cifragem junto do artefato de backup (mesmo cofre,
   não o mesmo disco) e anotar o resultado do ensaio abaixo.

> **Ensaio feito em:** 2026-07-20 · Gabriel + Claude · dump `rehearsal.dump`
> (19,2 MB, `pg_dump -Fc` forçado no sidecar `db-backup`; o ciclo nightly do
> sidecar também gerou o seu primeiro dump sozinho) → restore com
> `scripts/pg-restore.sh` num `postgres:16-alpine` limpo e descartável ·
> **PASS 8/8** via `apps/web/scripts/e2e-restore-verify.ts` (reutilizável em
> ensaios futuros): sessões restauradas (login em banco), 16 vídeos + 2742
> linhas de legenda com tokens, contagens idênticas ao vivo em todas as
> tabelas, e **ciphertext BYOK decifrado com a mesma `FUCHINE_ENCRYPTION_KEY`**
> pelo `resolveUserProvider` real. Achados colaterais corrigidos no dia:
> `FUCHINE_ENCRYPTION_KEY` estava **vazia** no `.env` (web preso no fail-fast —
> o guard funcionou; chave gerada e guardada no cofre junto do backup) e as
> imagens do compose estavam 2 migrations atrás do repo (14/16 aplicadas —
> `docker compose up` não rebuilda; usar `up -d --build` ao atualizar o repo).

---

*Manter este arquivo vivo: cada deploy real que descobrir um passo novo o
adiciona aqui, com data.*
