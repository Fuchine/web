# backlog: Explain Panel — Performance Investigation

**Date:** 2026-06-18
**Feature:** Explain Panel (camada 2 — AI line explanation)
**Branch:** `feat/explain-panel`
**Status:** IMPLEMENTED — LLM latency is the bottleneck

---

## O que foi implementado

O Explain Panel é uma aba na rail direita do player que mostra uma explicação AI por linha, com breakdown parte-a-parte e prosa "in plain terms".

### Arquitetura

- **Contrato v2** (`prompt_version = 2`): `{ breakdown: ExplanationPart[], plainTerms: string }` — mais rico que o v1
- **House-key fallback**: quando usuário não tem BYOK, usa a key do servidor (env `LLM_*`)
- **Force/regenerate**: `POST /api/lines/[id]/explain?force=true` ignora cache
- **Cache-first**: todas as explicações são cacheadas no PostgreSQL (`ai_explanations`)
- **Prefetch**: quando o usuário abre a aba Explain, pré-busca a próxima linha em background

### Files alterados

| Task | Arquivo | O que mudou |
|------|---------|-------------|
| 1 | `packages/db/src/types.ts` | `Explanation` v2: `breakdown[]` + `plainTerms` |
| 1 | `packages/llm/src/contract.ts` | `PROMPT_VERSION = 2` |
| 1 | `packages/llm/src/prompts.ts` | prompt pede novo shape |
| 1 | `packages/llm/src/providers/openai-compatible.ts` | `coerceExplanation` v2 |
| 2 | `apps/web/lib/house-provider.ts` | house provider extraído |
| 2 | `packages/llm/src/cache.ts` | retry + upsert cache |
| 2 | `apps/web/lib/explain.ts` | house fallback + force |
| 3 | `docs/CONTRATO_IA.md` | atualizado |
| 4 | `packages/ui/src/components/Player/PlayerExplain.tsx` | componente novo |
| 4 | `packages/ui/src/components/Player/PlayerExplain.stories.tsx` | stories |
| 5 | `packages/ui/src/components/Player/Player.tsx` | rail tabs + estado |
| 5 | `packages/ui/src/components/Player/PlayerFocalSubtitles.tsx` | botão Explain |
| 5 | `packages/ui/src/components/Player/PlayerStage.tsx` | prop `onExplain` |
| 5 | `packages/ui/src/components/Player/PlayerTranscript.tsx` | sem tab bar própria |
| 5 | `apps/web/app/videos/[id]/player-view.tsx` | `onFetchExplanation` |

---

## O problema: latência do LLM

### Sintomas

- Primeira explicação de cada linha: **~15 segundos** com `minimax-m2.7-highspeed`
- Segunda vez na mesma linha: **instantâneo** (cache PostgreSQL)
- MiniMax "normal" (`minimax-m2.7`): **~40 segundos**
- Com `echo` provider: **3.5 segundos** (erro instantâneo + retry 3x × 0.5/1/2s)

### Causa raiz

**O gargalo é 100% o LLM**, não o código. O pipeline está correto:

```
clique Explain → API route → explainLine (lib)
  → explainLineCached (cache-first, DB ~10ms)
    → cache MISS → provider.explainLine()
      → MiniMax API (~15-40s)
      → saveExplanation (DB ~10ms)
    → cache HIT → retorna do PostgreSQL (~10ms)
```

O código NUNCA tem delays artificial — todo o tempo é等待 do MiniMax responder.

### Por que "empilhava" requests antes das otimizações

Antes das otimizações, o prefetch disparava **2 requests simultâneas** (linha atual + próxima). Com retry de 3x, no pior caso **6 requests** iam pro MiniMax ao mesmo tempo. O servidor MiniMax serializa requests do mesmo API key, então todas ficavam esperando → **6x 15s = 90s**.

### Otimizações já aplicadas

1. **Dedup de requests**: `pendingExplainRef` evita disparar 2 requests da mesma `lineId`
2. **Prefetch só 1 linha**: só a próxima linha, uma por vez
3. **Retry com backoff**: 3 tentativas, 0.5s → 1s → 2s de espera entre falhas
4. **`AbortSignal.timeout(30_000)`**: abort limpo de requests lentas (sem orphan no MiniMax)
5. **Prefetching**: quando usuário abre a aba, próxima linha já está sendo pré-buscada em background

### Como funciona hoje

1. Usuário clica "Explain" → request vai pra MiniMax (~15s highspeed)
2. Enquanto espera, próxima linha é pré-buscada em background
3. Primeira linha completa → salva no cache, retorna instantâneo nas próximas vezes
4. Se falhar → retry automático, até 3x

---

## Soluções possíveis

### 1. Usar modelo mais rápido (implementado parcialmente)

Testamos:
- `minimax-m3`: ~15s → ainda lento
- `minimax-m2.7-highspeed`: ~15s → similar ao m3
- `minimax-m2.7`: ~40s → pior

**Recomendação atual:** `minimax-m2.7-highspeed` é o melhor custo-benefício.

### 2. Gerar explicações no import (offline, uma vez)

Em vez de under-demand, gerar as explicações durante o import do vídeo. Cada linha explanatory uma vez quando o vídeo é importado, cacheadas no PostgreSQL. O player nunca chama o LLM em tempo real.

**Prós:** zero latência no player
**Contras:** custo de API no import, mais delay no import, linhas nunca vistas não têm explicação

### 3. Gerar em background conforme usuário assiste

Enquanto o usuário assiste o vídeo, um worker vai pré-gerando explicações das próximas linhas. Similar ao que já fazemos com tradução (lazy chunk), mas para explicações.

### 4. Usar cache distribuído (Redis) em vez de PostgreSQL

PostgreSQL ~10ms de latência é aceitável para cache, mas Redis seria mais rápido para reads frequentes. Por ora o PostgreSQL está funcionando.

### 5. Streaming de resposta

Se o LLM suportar streaming, poderíamos renderizar a breakdown incrementally conforme tokens chegam, dando percepção de progresso em vez de tela branca por 15s.

### 6. Mostrar UI instantaneamente com skeleton

 Mesmo sem explicação ainda, mostrar o painel com skeleton/loading state e ir populando conforme o LLM responde. Não resolve a latência mas melhora UX.

---

## Comandos úteis

```bash
# Ver se há entradas no cache
docker compose exec -T postgres psql -U fuchine -d fuchine -c \
  "SELECT prompt_version, count(*) FROM ai_explanations GROUP BY 1;"

# Ver linha específica
docker compose exec -T postgres psql -U fuchine -d fuchine -c \
  "SELECT * FROM ai_explanations WHERE subtitle_line_id = '<ID>';"

# Testar provider direto
curl -X POST https://api.minimax.io/v1/chat/completions \
  -H "Authorization: Bearer $LLM_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"minimax-m2.7-highspeed","messages":[{"role":"user","content":"Hello"}]}'

# Reset: ver queries lentas no MiniMax (se disponível no dashboard)
# https://platform.minimax.io/
```

---

## Configuração atual (.env)

```env
LLM_PROVIDER=minimax
LLM_API_KEY=<key>
LLM_BASE_URL=
LLM_MODEL=minimax-m2.7-highspeed
```

---

## Tracking

- [ ] Implementar geração offline de explicações no import
- [ ] Adicionar streaming de resposta do LLM
- [ ] Considerar Redis para cache de explicações
- [ ] Adicionar skeleton/loading state no painel enquanto espera
- [ ] Dashboard de uso do MiniMax (custo por vídeo, etc.)
