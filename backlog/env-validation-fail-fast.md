# backlog: Web sobe "saudável" com env quebrada — falta fail-fast no boot

**Date:** 2026-07-06
**Feature:** Produção / Configuração
**Status:** RESOLVED (2026-07-09) — `apps/web/instrumentation.ts` fails fast in
production if `DATABASE_URL`/`AUTH_SECRET`/`FUCHINE_ENCRYPTION_KEY` are missing
or no sign-in method (Google or `EMAIL_SERVER`) is configured; loud warn when
`LLM_PROVIDER` is `echo`. Dev unchanged.

---

## Problema

O web app não valida nenhuma env no boot. Uma instância mal configurada sobe
normalmente e quebra aos pedaços, em runtime, cada pedaço no seu momento:

- **`DATABASE_URL` ausente:** `lib/db.ts:5-7` conecta numa URL placeholder
  ("keeps `next build` from throwing") — cada request explode individualmente
  com erro de conexão.
- **`AUTH_SECRET` ausente:** NextAuth v5 só lança `MissingSecret` no primeiro
  fluxo de login, não no start.
- **Nenhum login utilizável:** `auth.ts:16-37` — Google entra sem checar
  `AUTH_GOOGLE_ID/SECRET` (falha só no clique) e, em produção sem
  `EMAIL_SERVER`, o magic link fica desligado por design. Google sem
  credenciais + sem SMTP = **instância sem nenhum método de login**, descoberta
  pelo primeiro usuário.
- **`FUCHINE_ENCRYPTION_KEY` ausente:** só falha quando alguém tenta salvar
  chave BYOK (`lib/settings.ts:113-115`).
- **`LLM_PROVIDER` default é `echo`** (`house-provider.ts:15`): em produção,
  IA silenciosamente "não funciona" — correto como degrade de dev, traiçoeiro
  como default de prod.

O worker já tem o padrão certo (`apps/worker/src/env.ts:7-11`, `required()`
lança no boot), mas cobre só `DATABASE_URL`.

## Proposta

1. **`apps/web/instrumentation.ts`** (hook oficial do Next, roda uma vez no
   start do servidor): em `NODE_ENV=production`, lançar se faltarem
   `DATABASE_URL`, `AUTH_SECRET` ou `FUCHINE_ENCRYPTION_KEY`; lançar se **nem**
   Google (`AUTH_GOOGLE_ID`+`SECRET`) **nem** `EMAIL_SERVER` estiverem
   configurados; `console.warn` alto quando `LLM_PROVIDER` for `echo`/ausente
   ("AI features disabled — set LLM_* or users must bring keys").
2. Em dev, nada muda (os defaults de conveniência continuam).
3. Mensagens de erro apontando o `.env.example` — o operador conserta em
   segundos em vez de debugar em produção.

## Esforço / prioridade

**S · alta.** Uma tela de erro no boot custa minutos; a alternativa é o
primeiro deploy de cada self-hoster quebrando de um jeito diferente. É a
correção com melhor razão custo/frustração-evitada do portão 1.

## Referências

- `apps/web/lib/db.ts:5-7`, `apps/web/auth.ts:16-37`,
  `apps/web/lib/settings.ts:113-115`, `apps/web/lib/house-provider.ts:13-20`
- Padrão: `apps/worker/src/env.ts`
- Relacionados: [deploy-story-missing.md], [health-endpoints-missing.md],
  `docs/DEPLOY_CHECKLIST.md`
