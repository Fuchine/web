# backlog: Vídeos com embed bloqueado falham no player (erro 150)

**Date:** 2026-07-04
**Feature:** Player / Import
**Status:** OPEN — destravado (só código)

---

## Problema

Alguns vídeos mostram "Video failed to load (code 150)" no player. Códigos
150/101 da YouTube IFrame API = **o dono do vídeo desabilitou reprodução em
players embutidos** (comum em conteúdo com direitos musicais/TV/anime, vídeos
com restrição de idade — o embed não carrega a sessão logada do YouTube — e
restrição regional).

Não tem contorno: o app toca tudo pelo player oficial embedado (D2 — nunca
armazenar vídeo/áudio). O `origin` já é passado corretamente
(`PlayerVideo.tsx`), então os 150 restantes são bloqueios reais, não config.

Hoje o usuário só descobre ao abrir o vídeo, e os clipes do SRS desses vídeos
também não tocam.

## O que precisa

1. **Detectar no import** (sem API key): o oEmbed público
   (`https://www.youtube.com/oembed?url=<watch-url>&format=json`) responde
   401/403 para vídeos não-embedáveis. Checar no worker (ou na extensão) e
   marcar o vídeo — decisão de schema pequena: coluna `embeddable boolean`
   em `videos` (passa pelo ERD) ou reusar `status`.
2. **Selo na biblioteca**: badge "não reproduzível no app" no card, antes de o
   usuário abrir.
3. **Estado de erro útil no player**: em 150/101, mostrar "Watch on YouTube"
   (deep link com `&t=<s>`). Legendas, dicionário, explicação e mineração
   continuam funcionando — só o vídeo/clipes não tocam; deixar isso claro na
   mensagem.
4. **SRS**: card de vídeo bloqueado deveria degradar (mostrar frase + link)
   em vez de clipe mudo.

## Referências

- `packages/ui/src/components/Player/PlayerVideo.tsx` (`onError`, comentário
  sobre origin/150)
- `Player.tsx` (`loadError` → mensagem atual)
- Import: `apps/worker/src/pipeline.ts` (ponto natural para o check oEmbed)
