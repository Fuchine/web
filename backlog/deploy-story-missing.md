# backlog: Deploy story não existe — sem Dockerfiles, sem modo de produção

**Date:** 2026-07-06
**Feature:** Produção / Deploy (T1.10)
**Status:** RESOLVED (2026-07-09) — **build-verified end-to-end.** Multi-stage
`apps/web/Dockerfile` (Next `output: standalone`) + `apps/worker/Dockerfile`
(tsx + kuromoji dict); compose gains `migrate` (one-shot, gates web/worker),
`web`, `worker`, `caddy` (TLS ingress, web publishes no port), and a `db-backup`
profile; README has a Production section. `docker compose up -d --build` brought
the full stack up: migrate applied migrations and exited 0, web went healthy,
`/api/health` returned `{ok,db,redis,workerAlive}` all true through the Caddy
TLS ingress. Two bugs surfaced only by the live run and fixed: (1) the health
Redis probe reused the fail-open `createRequestRedis` (lazyConnect +
enableOfflineQueue:false) so `ping()` was rejected before connect — now calls
`connect()` first; (2) the compose healthcheck used `localhost` which busybox
wget resolves to IPv6 `::1` (server binds IPv4) — now `127.0.0.1`.

---

## Problema

A ARQUITETURA (§9) promete "docker-compose.yml → app + postgres + redis em um
comando" como onboarding do self-host. O estado real:

1. **Compose só tem infra.** `docker-compose.yml:2` admite no comentário:
   "web/worker images land in F1 (need Dockerfiles)". Não existe Dockerfile em
   nenhum lugar do repo.
2. **Nenhuma instrução de produção.** O Quick start do README termina em
   `pnpm dev` (`README.md:61`) — dev server como única forma documentada de
   rodar. Existe `next start` (`apps/web/package.json:9`) e
   `tsx src/index.ts` no worker (`apps/worker/package.json:8`), mas nada
   orquestra, supervisiona ou reinicia os dois processos.
3. **Migração é passo manual** (`pnpm db:migrate`), sem hook de boot — um
   self-hoster que atualizar a imagem e esquecer a migração roda schema velho
   contra código novo.

Quem clona hoje precisa de Node 22 + pnpm no host e dois terminais abertos —
longe do `docker compose up` que é o pitch do open core.

## Proposta

1. **Dockerfiles multi-stage:** `apps/web` com `next build` (output
   `standalone` para imagem enxuta) e `apps/worker` (tsx direto ou `tsc` +
   node; pnpm deploy para podar o workspace).
2. **Serviços `web` e `worker` no compose**, com `depends_on` +
   `condition: service_healthy` nos healthchecks já existentes de
   Postgres/Redis, `restart: unless-stopped` e env via `.env`.
3. **Migração no entrypoint** do web (ou um serviço one-shot `migrate` que os
   outros aguardam): `db:migrate` antes de `next start`.
4. Seção "Production" no README substituindo o `pnpm dev` do Quick start.

## Esforço / prioridade

**M · alta.** É o corpo do T1.10 — bloqueia o lançamento OSS de fato: sem isso
o "self-host completo" da proposta de valor não é reproduzível por um estranho.

## Referências

- `docker-compose.yml:1-2`, `README.md:53-64`
- `apps/web/package.json:9`, `apps/worker/package.json:8`
- `docs/ARQUITETURA.md` §9 e T1.10 no `docs/ROADMAP_ENGENHARIA.md`
- Relacionados: [health-endpoints-missing.md], [backups-restore-missing.md]
