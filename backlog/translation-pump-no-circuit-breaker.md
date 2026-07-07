# backlog: Pump de tradução do player sem backoff/circuit breaker

**Date:** 2026-07-06
**Feature:** Player (F1) — tradução em background
**Status:** DONE (2026-07-06; pendência conhecida desde 2026-07-04)

---

## Problema

O pump de background traduz o vídeo inteiro chunk a chunk ao abrir o player
(`packages/ui/src/components/Player/Player.tsx:332-348`). `fetchChunk`
(linhas 290-311) engole qualquer falha e o loop **segue imediatamente** para o
próximo chunk.

Com o provider de MT fora do ar (ou cota DeepL estourada), um vídeo de 20
chunks dispara 20 requests consecutivos que falham — e cada falha é cara no
servidor: `tryTranslateChunk` tenta 2×, e o fallback linha-a-linha pode
disparar dezenas de chamadas extras (ver
[translate-fallback-parallel-storm.md]) antes do 502. Ou seja: o momento em que
o provider está pior é exatamente quando o pump mais o martela. Um seek
re-dispara o efeito e recomeça a rajada.

## Proposta

No pump (client, `Player.tsx`):

1. `fetchChunk` passa a reportar sucesso/falha (hoje resolve `void` sempre).
2. **Backoff exponencial** entre falhas consecutivas (1s → 4s → 15s) e
   **circuit breaker**: após ~3 falhas seguidas, parar o pump da sessão.
3. Religar o breaker quando um fetch focal (o efeito das linhas 314-325, que
   continua tentando o chunk atual sob demanda) suceder — sinal de que o
   provider voltou.

UI string quando o breaker abrir (tooltip no toggle de tradução):
"Translations are temporarily unavailable — Japanese only for now."

## Resolução (2026-07-06)

Tudo em `packages/ui/src/components/Player/Player.tsx`:

1. `fetchChunk` agora retorna `Promise<boolean> | null` — `true` sucesso,
   `false` falha, `null` pulado (já feito / em voo).
2. Pump com **backoff** (`PUMP_BACKOFFS_MS = [1000, 4000, 15000]`) entre falhas
   consecutivas e **circuit breaker** (`PUMP_BREAKER_THRESHOLD = 3`): ao atingir
   3 falhas seguidas, `translationsSuspended = true` e o pump para a sessão. O
   `sleep` do backoff é cancelável no cleanup do efeito (não vaza timer).
3. O efeito focal (chunk atual sob demanda) **re-arma** o breaker: um fetch focal
   com sucesso zera `pumpFailuresRef` e fecha o breaker, e o pump (que agora
   depende de `translationsSuspended`) reinicia do chunk atual.
4. Tooltip no toggle de tradução (control bar + transcript) quando o breaker
   abre: "Translations are temporarily unavailable — Japanese only for now."
   (prop opcional `translationsUnavailable`).

Verificado: `pnpm typecheck` (8/8) e `pnpm test` (5 pacotes) verdes. O caminho
de falha em si não foi exercido em browser ao vivo (exigiria derrubar o provider
MT sob instrumentação); a lógica de breaker/backoff/re-arme foi revisada.

## Esforço / prioridade

**S · alta.** Já era pendência registrada; o custo é rajada de chamadas de
provider no pior momento + pool do Postgres ocupado à toa. Contido num arquivo.

## Referências

- `packages/ui/src/components/Player/Player.tsx:286-348`
- `apps/web/lib/translate.ts` (custo server-side de cada falha)
- Relacionados: [translate-fallback-parallel-storm.md],
  [translate-chunk-race-writes.md]
