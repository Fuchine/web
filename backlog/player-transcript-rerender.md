# backlog: Player recalcula o transcript inteiro a cada tick de 250ms

**Date:** 2026-07-06
**Feature:** Player (F1)
**Status:** RESOLVED (2026-07-09) — `useMemo` on `transcriptLines`/`focal`,
`React.memo` on `PlayerTranscript` + stable toggle callbacks (a `currentMs`-only
tick now skips the list entirely), and a memoized `TranscriptRow` so a
`currentLineIdx` change re-renders only the two rows whose `isCurrent` flips.

---

## Problema

Durante o playback, o poll de posição roda a cada 250ms e chama
`setCurrentMs` (`packages/ui/src/components/Player/Player.tsx:191-197`) —
re-render do componente `Player` inteiro 4×/segundo. A cada render:

- `toTranscript(lines, translations)` (linha 729) re-mapeia **todas** as
  linhas e todos os tokens do vídeo (600+ linhas) e produz arrays novos;
- a identidade nova faz `PlayerTranscript` re-renderizar a lista completa,
  mesmo sem nada visível mudando (a linha focal muda a cada poucos segundos,
  não a cada tick).

Custo contínuo de CPU/bateria no client durante toda a sessão de estudo —
pior em vídeos longos e máquinas modestas, exatamente o cenário de imersão de
30 min/dia (meta da F1).

## Proposta

1. `useMemo` para `transcriptLines` com deps `[lines, translations]` (mudam só
   no fetch de chunk) e para `focal` com `[lines, translations, currentLineIdx]`.
2. `React.memo` nas rows do `PlayerTranscript` (prop `isCurrent` por linha em
   vez de array novo).
3. Se ainda pesar: isolar `currentMs` num subcomponente (só a control bar
   consome o tempo contínuo; o resto do player só precisa de `currentLineIdx`).

## Esforço / prioridade

**S · média.** Ganho direto de fluidez/bateria no coração do produto; mudanças
locais num arquivo.

## Referências

- `packages/ui/src/components/Player/Player.tsx:189-217, 729-731`
- `PlayerTranscript.tsx` (lista de linhas)
