# backlog: Busca/sort da library e phrases cobre só as páginas carregadas

**Date:** 2026-07-13
**Feature:** Library / Phrases (client)
**Status:** OPEN — baixa prioridade, escopo F2.

---

## Contexto

`unpaginated-lists` (a preocupação de perf — listas carregando o dataset inteiro)
foi **resolvida**: `listVideos`/`listPhrases`, `GET /api/videos` e o novo
`GET /api/phrases` são cursor-paginated, e a UI ganhou infinite scroll
(`usePaginatedList` + sentinela IntersectionObserver; 2026-07-13). O que restou é
uma limitação herdada do padrão de infinite scroll.

## Problema

Search, sort e os filtros (categoria/status) da library e das phrases rodam
**client-side sobre as páginas já carregadas**, não sobre o dataset inteiro:

- Buscar por um termo que só existe num vídeo/frase ainda não rolado **não
  encontra** até o usuário scrollar o suficiente.
- Os contadores de cabeçalho (ex.: "N sentences mined", contagem por status nos
  chips) refletem o **conjunto carregado**, não o total real.
- Ordenar (ex.: "mais compreensível", "alfabético") ordena só o carregado.

Aceitável hoje (self-host de 1 usuário, poucos itens; o sentinela vai puxando
mais conforme scrolla). Vira problema real na **F2** (biblioteca pública, muitos
vídeos/frases por usuário), exatamente onde o `unpaginated-lists` original já
apontava.

## Proposta (F2)

Mover search/sort/filtro para o **servidor**, sobre o dataset inteiro, passando
os parâmetros nas rotas paginadas (`GET /api/videos`, `GET /api/phrases`) e
resetando o cursor a cada mudança de query/sort. Contadores reais via `count(*)`
escopado (ou um endpoint de agregados). O `usePaginatedList` já suporta reseed
quando a primeira página muda — falta só a query virar parte da chave do fetch.

## Esforço / prioridade

**M · baixa (F2).** Não bloqueia nada pré-F2.

## Referências

- `apps/web/lib/use-paginated-list.ts`, `apps/web/app/library-view.tsx`,
  `apps/web/app/phrases/phrases-view.tsx`
- Rotas: `apps/web/app/api/videos/route.ts`, `apps/web/app/api/phrases/route.ts`
- Origem: `unpaginated-lists` (AUDITORIA-2026-07-06), resolvido 2026-07-13.
