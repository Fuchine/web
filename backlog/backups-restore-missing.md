# backlog: Backup e restore inexistentes — histórico FSRS é insubstituível

**Date:** 2026-07-06
**Feature:** Produção / Dados
**Status:** OPEN

---

## Problema

Não há backup em lugar nenhum: nenhum serviço no compose, nenhum script,
nenhuma documentação. A única menção a backup no repo é como **feature paga da
cloud** ("backups e sync gerenciados", ARQUITETURA §2.1) — o que torna a
lacuna pior: o self-host precisa *conseguir* fazer backup sozinho (open core
completo); o que se vende é a conveniência gerenciada, não a capacidade.

O dado em risco não é recuperável de fora: `sentence_cards` + `review_logs`
são o histórico FSRS do usuário (D6 — base da re-otimização futura), e
`user_daily_stats`/`user_word_stats` são o progresso acumulado. Conteúdo
(vídeos/legendas/cache de IA) é re-importável; o progresso do usuário, não.
Hoje um `docker compose down -v` distraído apaga tudo sem aviso.

## Proposta

1. **Serviço de backup no compose** (profile `backup`): sidecar leve com
   `pg_dump` diário para um volume/host path (`pg_dump -Fc`, retenção de ~7
   diários + 4 semanais), documentado no README de produção.
2. **Procedimento de restore documentado e testado** (`pg_restore` num banco
   limpo + `pnpm db:migrate` para diffs) — backup sem teste de restore é
   loteria; incluir um teste manual no checklist de release.
3. Nota explícita no README sobre o que os volumes contêm e o perigo de
   `down -v`.

Redis fica de fora de propósito: a fila é re-populável (re-import) e o
reconciliador de [import-jobs-no-retry.md] cobre jobs perdidos.

## Esforço / prioridade

**S-M · alta.** É o item de maior razão dano-evitado/custo desta safra: perda
de dados de progresso é o único erro operacional sem volta.

## Referências

- `docker-compose.yml` (volumes `postgres_data`, sem serviço de backup)
- `docs/ARQUITETURA.md` §2.1 (backup gerenciado = camada paga)
- Relacionado: [deploy-story-missing.md]
