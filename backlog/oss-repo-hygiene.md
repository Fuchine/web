# backlog: Higiene do repo para o lançamento OSS — SECURITY, CONTRIBUTING, DCO

**Date:** 2026-07-06
**Feature:** Lançamento OSS (T1.10)
**Status:** OPEN

---

## Problema

O lançamento OSS **é** o marketing do produto (ARQUITETURA §9: "o README é a
landing page"), mas a infraestrutura de comunidade não existe —
`.github/` tem só os 3 workflows (verificado 2026-07-06):

- **Sem `SECURITY.md`**: não há canal para reportar vulnerabilidade em
  privado — grave para um app que guarda chaves BYOK cifradas; o achado vira
  issue pública.
- **Sem `CONTRIBUTING.md`**: setup de dev, convenções (que já existem no
  CLAUDE.md mas não em formato público) e o processo de contribuição.
- **DCO prometido e não verificado**: o README (§License) pede DCO, mas
  nenhum workflow/app checa o `Signed-off-by` — a promessa jurídica do §2.2 da
  arquitetura não está sendo cumprida tecnicamente.
- Sem templates de issue/PR (bug report pedindo versão/logs economiza
  ping-pong) e sem branch protection na main (CI verde antes de merge).

## Proposta

1. `SECURITY.md`: reporte privado via GitHub Security Advisories
   (`Report a vulnerability`), escopo (BYOK/cifragem em destaque), janela de
   resposta honesta para projeto solo (ex.: 7 dias).
2. `CONTRIBUTING.md`: quick start de dev (compose + seed), `pnpm typecheck` +
   testes como gate, convenção de commits, e a regra do DCO com exemplo de
   `git commit -s`.
3. **DCO check**: o GitHub App oficial (dco.dev) ou o action
   `christophebedard/dco-check` no CI.
4. Templates: `bug_report.yml` (versão, self-host ou cloud, logs) e
   `feature_request.yml`; PR template com checklist curto.
5. Branch protection na main: CI obrigatório, force-push bloqueado.

## Esforço / prioridade

**S · média-alta.** ~1 sessão, e é fachada + proteção jurídica do lançamento;
sem o DCO check, cada contribuição aceita sem sign-off enfraquece a posição
de licenciamento que o AGPL + DCO foi desenhado para dar.

## Referências

- `.github/` (só workflows), `README.md:93-97` (promessa de DCO)
- `docs/ARQUITETURA.md` §2.2 (DCO em vez de CLA), §9 (README como landing)
- Relacionados: [ci-package-tests-missing.md], [deploy-story-missing.md]
