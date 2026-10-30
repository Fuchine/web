# backlog: Visibilidade do catálogo — o que falta decidir antes de uma instância compartilhada

**Date:** 2026-10-30 (recria o item fechado em 2026-07-10, commit `8f7bd09`)
**Feature:** Produto / Biblioteca / Moderação
**Status:** OPEN — a parte "visibilidade" está decidida; a parte "moderação"
não. Bloqueia o Portão 2 (instância compartilhada), não o self-host de 1
usuário.

---

## O que já está decidido (ARQUITETURA D3)

- **Catálogo global.** `videos` não tem escopo de usuário nem registra quem
  importou: todo vídeo importado aparece na biblioteca de todos os usuários da
  instância. Não é um default acidental, é o fosso do produto: cada vídeo
  processado (tokens, tradução, explicações) fica grátis para o próximo.
  Declarado em `docs/ARQUITETURA.md` D3 em 2026-07-10.
- **Hide por usuário existe.** `user_video_flags` (`saved` | `hidden` |
  `not_interested`, PK `(user_id, video_id, flag)`), em
  `apps/web/lib/video-flags.ts`, entregue no PR #16. Cada usuário some com um
  vídeo da própria visão sem afetar os outros.
- **O que é privado:** cards, histórico de revisão, stats, álbuns, flags e a
  chave BYOK. O que é compartilhado: catálogo, legendas/tokens, traduções e o
  cache de explicações.

## O que falta decidir

1. **Denúncia.** Um usuário que encontra um vídeo ofensivo ou uma explicação
   envenenada (D2: a explicação é cacheada para todos) não tem como avisar o
   operador. Proposta do roadmap: "reportar vídeo/explicação" com tabela
   `reports` (mudança de schema, sai do ERD).
2. **Remoção pelo operador.** Hoje apagar um vídeo ou purgar uma explicação
   exige `psql`. Proposta: `/admin` com apagar vídeo (cascade) e purgar
   explicação.
3. **`unlisted` em vez de apagar?** Um flag de moderação global que tira o
   vídeo da grade sem apagar o cache (outros usuários que já mineraram dele
   mantêm os cards tocando). Decidir se vale a coluna ou se apagar basta.
4. **Atribuição.** `videos` não guarda quem importou, por design. Moderar
   usuário abusivo sem atribuição só funciona via `llm_usage`/logs. Decidir se
   isso é suficiente.

Os itens 1 e 2 estão em `docs/ROADMAP_ENGENHARIA.md` **T2.13** (admin mínimo,
G1/D2 da `ANALISE-SEGURANCA-LANCAMENTO-2026-10-29.md`). Os itens 3 e 4 são
decisões que o T2.13 precisa tomar e registrar no D3 do `ARQUITETURA.md`.

## Pronto quando

A decisão (global + hide por usuário + o que for escolhido para 1–4) está
escrita no D3 do `ARQUITETURA.md`, e o operador consegue tirar um vídeo
ofensivo do catálogo sem `psql`.
