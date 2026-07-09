# backlog: Sem error.tsx / global-error / not-found — tela default do Next em produção

**Date:** 2026-07-06
**Feature:** Web (T1.9 — estados de erro)
**Status:** RESOLVED (2026-07-09) — `error.tsx`, `not-found.tsx`,
`global-error.tsx` added in `apps/web/app/`, reusing the 淵 error look
(`.err-*` in `globals.css`); generic messages, detail to server log only.

---

## Problema

`apps/web/app/` não tem nenhum boundary de erro do App Router: não existem
`error.tsx`, `global-error.tsx` nem `not-found.tsx` (verificado por glob).
Consequências em produção:

- Qualquer exceção não tratada num server component (Postgres fora do ar no
  load da biblioteca, por exemplo) rende a tela genérica do Next — sem shell,
  sem navegação, sem tom do produto.
- `notFound()` (usado no player, `app/videos/[id]/page.tsx:22`) cai no 404
  default do framework.

O T1.9 do roadmap cobre estados vazios/erro *dentro* das telas; os boundaries
de rota são a metade que falta para o app degradar com dignidade.

## Proposta

1. `app/not-found.tsx` e `app/error.tsx` compondo o padrão visual existente
   (o player já tem um estado de erro com a marca 淵 em `Player.tsx:701-713` —
   reusar a estética). Strings em inglês: "Something went wrong" / "Page not
   found", botão "Back to library" e "Try again" (reset).
2. `app/global-error.tsx` minimalista (sem AppShell — roda fora do layout).
3. Conferir que os boundaries não vazam detalhes do erro (mensagem genérica;
   stack só em dev).

## Esforço / prioridade

**S · média.** Meia sessão, e é a diferença entre "quebrou bonito" e "quebrou
feio" na primeira impressão do lançamento OSS.

## Referências

- `apps/web/app/` (ausência verificada em 2026-07-06)
- Padrão visual: `packages/ui/src/components/Player/Player.tsx:701-713`
- Roadmap: T1.9 em `docs/ROADMAP_ENGENHARIA.md`
