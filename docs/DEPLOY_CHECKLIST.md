# Checklist do primeiro deploy

**Versão 0.1 · 6 de julho de 2026**

Runbook executável do primeiro deploy de uma instância Fuchine (self-host ou a
futura cloud). Complementa os índices do backlog:
[PRODUCAO-2026-07-06](../backlog/PRODUCAO-2026-07-06.md) lista **o que
construir** antes do deploy; este documento lista **o que conferir e executar
no dia**. Itens marcados 🔒 dependem de backlog ainda aberto.

---

## 1. Pré-requisitos de build (bloqueiam o deploy)

- [ ] 🔒 Imagens/compose de web + worker existem
      ([deploy-story-missing.md](../backlog/deploy-story-missing.md))
- [ ] 🔒 Proxy TLS decidido e configurado — Caddy no compose ou proxy próprio
      ([tls-and-security-headers.md](../backlog/tls-and-security-headers.md))
- [ ] 🔒 Fail-fast de env no boot do web
      ([env-validation-fail-fast.md](../backlog/env-validation-fail-fast.md))
- [ ] 🔒 Backup agendado + restore testado **antes** do primeiro usuário real
      ([backups-restore-missing.md](../backlog/backups-restore-missing.md))

## 2. Configuração (o `.env` de produção)

- [ ] `DATABASE_URL` e `REDIS_URL` apontando para a infra de produção
- [ ] `AUTH_SECRET` novo (`openssl rand -base64 32`) — nunca o de dev
- [ ] `AUTH_URL=https://<domínio>` (https, sem barra final)
- [ ] `FUCHINE_ENCRYPTION_KEY` nova — e **backup dela junto do banco**:
      perder a chave invalida todas as chaves BYOK salvas
      ([encryption-key-ops.md](../backlog/encryption-key-ops.md))
- [ ] `TZ` da instância definida e documentada (streaks bucketizam pela TZ do
      processo — [timezone-streaks-decision.md](../backlog/timezone-streaks-decision.md))
- [ ] `LLM_PROVIDER`/`LLM_API_KEY` reais (echo em produção = IA silenciosamente
      desligada) · `MT_PROVIDER=deepl` se aplicável
- [ ] `DEPLOYMENT_MODE=self-host`

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
      scripts — [db-pool-config.md](../backlog/db-pool-config.md))
- [ ] Disco: JMdict seedado ≈ 1–2 GB de banco base; +~2 MB por vídeo importado

## 5. Sequência de deploy (ordem importa)

1. `docker compose up -d postgres redis` (e o proxy)
2. `pnpm db:migrate`
3. `pnpm --filter @fuchine/db seed:jmdict [frequency.tsv]` — ~298k entries;
   rodar **antes** de abrir tráfego (o dicionário vazio parece bug —
   histórico: assim nasceu o falso "#9" do backlog)
4. `pnpm --filter @fuchine/worker backfill:level` (se houver vídeos migrados)
5. Subir web + worker; conferir logs de boot limpos
6. Congelar um **backup imediato pós-seed** (restore barato do estado zero)

## 6. Smoke test — o loop inteiro, no domínio real

- [ ] Login por **Google** e por **magic link** (recebido fora do spam)
- [ ] Extensão apontada para `https://<domínio>` importa um vídeo real
      (🔒 exige [extension-hardcoded-origin.md](../backlog/extension-hardcoded-origin.md))
- [ ] Import processa: status sai de Processing, tokens aparecem
- [ ] Player toca no domínio https (embed com `origin` correto), legenda dupla
      sincronizada, tradução dos chunks chegando
- [ ] Popup de dicionário responde; **Explain** gera (cache miss) e o segundo
      clique é instantâneo (cache hit)
- [ ] Mine → Review → grade → resumo de sessão; stats registram o dia
- [ ] `GET /api/health` respondendo (🔒
      [health-endpoints-missing.md](../backlog/health-endpoints-missing.md))
- [ ] Se a CSP foi ligada: thumbnails e o iframe do YouTube carregam sem erro
      de console

## 7. Primeira semana

- [ ] Conferir que o backup diário está de fato gerando arquivos (e fazer um
      restore de amostra)
- [ ] Observar logs do worker: fila vazia estável, sem vídeo preso em
      `processing` ([import-jobs-no-retry.md](../backlog/import-jobs-no-retry.md))
- [ ] Observar consumo de LLM/DeepL nos dashboards dos providers (enquanto
      [llm-usage-metering.md](../backlog/llm-usage-metering.md) não existe,
      o painel do provider é a única medição)
- [ ] Kill test: derrubar o worker e conferir que o compose o reergue e a
      fila drena
- [ ] Revisitar o banner do Dependabot (8 alertas vs item resolvido no PR #16
      — confirmar se era lag)

---

*Manter este arquivo vivo: cada deploy real que descobrir um passo novo o
adiciona aqui, com data.*
