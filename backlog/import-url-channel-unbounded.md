# backlog: `url` e `channel` do import persistidos crus — sem teto e sem normalização

**Date:** 2026-07-10
**Feature:** Import (validação)

**Status:** CLOSED (2026-07-10) — URL normalizada para `https://www.youtube.com/watch?v=${sourceId}`; `channel` truncado a `CHANNEL_MAX = 200` e null se vazio. Testes adicionados.

---

## Problema

`validateImportRequest` põe teto em `captions`/`text`/`title`/`durationS`, mas
`url` e `channel` passam crus (`apps/web/lib/import.ts:106-109`):

- `url` é validada só o suficiente para extrair o id (`parseYouTubeId`); a
  string inteira — que pode carregar params arbitrários e tamanho ilimitado —
  é persistida e devolvida por `GET /api/videos/[id]`. XSS **latente**: hoje o
  front não renderiza `video.url` como href (o player usa `source`+`sourceId`),
  mas um futuro `<a href={video.url}>` aceitaria
  `javascript:...?v=abcdefghijk`.
- `channel` não tem limite de tamanho (DoS leve via payload gordo).

## Proposta

1. Persistir a URL canônica `https://www.youtube.com/watch?v=${sourceId}` em
   vez da string crua — mata o vetor e, de bônus, elimina variantes
   (`youtu.be/...`, params extras) guardadas para o mesmo vídeo.
2. Teto em `channel` (ex.: `CHANNEL_MAX = 200`, junto dos caps existentes).

## Esforço / prioridade

**S · baixa.** Hardening; sem exploração possível no front atual.

## Referências

- `apps/web/lib/import.ts:32-37` (caps existentes), `:103-114` (payload validado)
- `apps/web/lib/youtube.ts` (`parseYouTubeId`)
- `apps/web/lib/study.ts:104` (o `url` cru volta na resposta do player)
- Origem: [CORRECOES-PRE-DEPLOY-2026-07-10.md] (B1)
