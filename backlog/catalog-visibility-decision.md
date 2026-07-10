# backlog: Catálogo global visível a todos — confirmar como decisão de produto

**Date:** 2026-07-06
**Feature:** Produto / Biblioteca
**Status:** CLOSED (2026-07-10) — decisão confirmada: catálogo global é o fosso do produto. Registrada no ARQUITETURA (D3).

---

## Problema

`listVideos` não tem escopo de usuário (`apps/web/lib/study.ts:14-33`): numa
instância com N usuários, **todos veem todos os vídeos** que qualquer um
importou. Não é bug — é consequência direta do cache compartilhado (D3) e
antecipa a "biblioteca pública" da F2 —, mas hoje é um *default silencioso*,
não uma decisão declarada. Implicações antes de qualquer instância
compartilhada:

- Um usuário importando conteúdo constrangedor/NSFW o expõe a todos os outros
  (o vídeo nem registra quem importou — `videos` não tem link com usuário,
  por design).
- Não há como "sumir" com um vídeo da própria visão: o "Hide video" do menu é
  `useState` que evapora no reload
  ([library-video-actions-not-persisted.md]).

## Proposta

1. **Confirmar a decisão** (recomendo manter global): o catálogo compartilhado
   É o fosso do produto — cada vídeo processado fica grátis para o próximo
   usuário. Registrar a escolha no ARQUITETURA (uma linha no D3 ou §4)
   para deixar de ser default acidental.
2. **Mitigador mínimo antes de multiusuário:** priorizar o hide persistido por
   usuário (já especificado em [library-video-actions-not-persisted.md] — a
   tabela de flags proposta lá resolve).
3. Se surgir necessidade real (instância pública grande): flag de moderação
   simples (`unlisted`) escondendo o vídeo da grade sem apagar o cache —
   decisão de ERD, só quando/se o problema aparecer.

## Esforço / prioridade

**Decisão (zero código) + S para o hide · média.** Custo de decidir agora é
uma conversa; custo de descobrir em produção é um incidente de comunidade.

## Referências

- `apps/web/lib/study.ts:14-33`, `packages/db/src/schema.ts:117-137`
  (`videos` sem vínculo de usuário)
- `docs/ARQUITETURA.md` D3 e §2.1 (cache compartilhado como fosso)
- Relacionado: [library-video-actions-not-persisted.md]
