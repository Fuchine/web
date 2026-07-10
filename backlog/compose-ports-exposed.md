# backlog: Postgres/Redis publicados em 0.0.0.0 no compose + senha default

**Date:** 2026-07-10
**Feature:** Infra / compose
**Status:** CLOSED (2026-07-10) — ports removidos; senha Postgres + Redis requirepass via env (`POSTGRES_PASSWORD`/`REDIS_PASSWORD`); connection strings dos 4 serviços atualizadas; smoke test saudável (postgres/redis healthy, migrate OK, redis `-a` PONG). Era OPS-2 de [CORRECOES-PRE-DEPLOY-2026-07-10.md].

---

## Problema

`docker-compose.yml` publica `5432:5432` (postgres, `:18-19`) e `6379:6379`
(redis, `:35-36`) — bind em 0.0.0.0 — com senha `fuchine:fuchine` hardcoded e
Redis sem `requirepass`. Num VPS com IP público, banco e fila ficam expostos à
internet. Agravante que a auditoria não menciona: portas publicadas pelo
Docker **furam o ufw** (o Docker insere as regras iptables antes do firewall
do host), então "o VPS tem firewall" não salva. O `web` já está correto (só
`expose`, atrás do Caddy).

## Proposta

1. Remover os `ports:` de postgres/redis — a rede interna do compose basta
   para web/worker/migrate. Se acesso do host for necessário em dev, bindar
   `127.0.0.1:5432:5432` (e idem 6379).
2. Senha do Postgres via env (`POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?}` +
   `.env.example`), refletida nas `DATABASE_URL` dos 4 serviços que a
   hardcodam. Atenção: `POSTGRES_PASSWORD` só é aplicada na **criação** do
   volume; para um volume existente é `ALTER USER fuchine WITH PASSWORD ...`.
3. `requirepass` no Redis (`--requirepass ${REDIS_PASSWORD}`) + credencial na
   `REDIS_URL` de web/worker.

## Esforço / prioridade

**S · alta (bloqueia deploy).** Mudança de compose + .env.example; smoke test
`docker compose up` completo depois (migrate → web → worker → health).

## Referências

- `docker-compose.yml:11-43` (postgres/redis), `:55,69-70,101-102,134`
  (connection strings com a senha default)
- `docs/DEPLOY_CHECKLIST.md`
- Origem: [CORRECOES-PRE-DEPLOY-2026-07-10.md] (OPS-2)
