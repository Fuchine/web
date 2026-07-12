# backlog: Ensaio de backup → restore (com a chave de cifragem junto)

**Date:** 2026-07-10 · **Updated:** 2026-07-12
**Feature:** Operação / dados
**Status:** OPEN — bloqueia o deploy (OPS-4 de [CORRECOES-PRE-DEPLOY-2026-07-10.md]).
Ferramenta + runbook prontos (2026-07-12): falta **rodar o ensaio** (processo,
depende de docker + stack real — não automatizável neste ambiente).

> **Preparado (2026-07-12):** `scripts/pg-restore.sh` — companheiro do
> `pg-backup.sh` (restore com `--clean --if-exists --no-owner --no-acl`, para um
> Postgres limpo) — e o **Apêndice A** de `docs/DEPLOY_CHECKLIST.md` com o passo
> a passo do ensaio (amostra → dump → restore → verificar login/vídeo/decifragem
> BYOK). O item fecha quando o ensaio for executado e anotado no checklist.

---

## Problema

O `db-backup` (compose, profile `backup`) existe desde o PR #19, mas nunca
houve um ciclo completo backup → restore — e backup não testado não é backup.
O dump sozinho também não basta: sem o `FUCHINE_ENCRYPTION_KEY` da época do
dump, todo ciphertext BYOK vira lixo indecifrável (AES-GCM sem a chave não
tem recuperação).

## Proposta

Ensaio antes do primeiro usuário real (não é código; é o que valida o código
que já existe):

1. Subir a stack, criar dados de amostra (usuário + vídeo importado + chave
   BYOK salva).
2. `docker compose --profile backup up -d` e esperar/forçar um dump.
3. Restore num Postgres limpo; verificar login (sessão em banco), vídeo com
   legendas e **decifragem da chave BYOK** (o `resolveUserProvider` é o teste
   real).
4. Anotar o resultado no `docs/DEPLOY_CHECKLIST.md` e guardar a chave de
   cifragem junto do artefato de backup — no mesmo cofre, não no mesmo disco
   do servidor.

## Esforço / prioridade

**S (processo) · alta (bloqueia deploy).**

## Referências

- `docker-compose.yml:128-141` (`db-backup`), `scripts/pg-backup.sh`
- `docs/DEPLOY_CHECKLIST.md` (runbook), `apps/web/scripts/e2e-settings.ts`
  (round-trip BYOK que serve de verificação)
- Origem: [CORRECOES-PRE-DEPLOY-2026-07-10.md] (OPS-4)
