# backlog: Botões de volume e fullscreen do player são no-ops

**Date:** 2026-07-06
**Feature:** Player (F1)
**Status:** RESOLVED (2026-07-09) — volume button is now a mute toggle
(`mute`/`unMute`/`isMuted` on `PlayerVideoHandle`, state mirrored on the button);
fullscreen toggles the Fullscreen API on the stage container. Misleading
comment corrected. A finer volume slider can layer on `setVolume` later.

---

## Problema

Na control bar, os botões de volume e fullscreen renderizam mas não fazem nada
(`packages/ui/src/components/Player/Player.tsx:408-411`):

```ts
// Volume and fullscreen: the IFrame API does not expose either method...
const onVolume = useCallback(() => undefined, []);
const onFullscreen = useCallback(() => undefined, []);
```

O comentário está incorreto: a YouTube IFrame API **expõe**
`setVolume()`/`mute()`/`unMute()` desde sempre; e fullscreen é
`requestFullscreen()` no container do stage (não precisa da API do YouTube).
Botão visível que não responde é o pior dos estados — pior que não ter o botão.

## Proposta

1. Expor `setVolume`/`mute` no `PlayerVideoHandle` (`PlayerVideo.tsx`) e ligar
   um slider/toggle simples no `onVolume`.
2. `onFullscreen`: `stageRef.current?.requestFullscreen()` com fallback de
   toggle (`document.exitFullscreen`).
3. Se a decisão for adiar: **esconder os dois botões** até lá.

## Esforço / prioridade

**S · baixa.** Polimento de UX com fix pequeno; corrigir também o comentário
enganoso para não re-derivar a limitação inexistente no futuro.

## Referências

- `packages/ui/src/components/Player/Player.tsx:407-411`
- `packages/ui/src/components/Player/PlayerVideo.tsx` (handle do IFrame)
- YouTube IFrame API: `player.setVolume()` / `player.mute()`
