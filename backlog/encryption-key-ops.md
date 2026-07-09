# backlog: FUCHINE_ENCRYPTION_KEY sem versionamento nem rotação

**Date:** 2026-07-06
**Feature:** Segurança / BYOK
**Status:** RESOLVED (2026-07-09) — `v2:` version prefix on ciphertext (decrypt
handles legacy v1); rotation script `pnpm --filter @fuchine/worker rotate:key`
(re-encrypts all BYOK keys old→new); `.env.example` documents key permanence +
backup. Tests in `packages/llm/src/crypto.test.ts` (round-trip, v1 compat,
tamper/wrong-key rejection).

---

## Problema

A cifragem BYOK está correta (AES-256-GCM, IV aleatório, nunca em log), mas a
**operação** da chave não foi desenhada:

1. **Formato sem versão.** `encryptApiKey` retorna `base64(iv|tag|ct)` seco
   (`packages/llm/src/crypto.ts:30`). Se um dia o algoritmo/formato mudar, não
   há como distinguir ciphertext antigo de novo — migração vira adivinhação.
2. **Rotação indefinida.** Trocar `FUCHINE_ENCRYPTION_KEY` hoje = todas as
   chaves BYOK param de decifrar (`decryptApiKey` lança) e cada usuário
   precisa re-inserir a sua. Não existe script de re-encrypt nem menção no
   `.env.example` de que a chave é permanente.
3. **Perda da chave** tem o mesmo efeito (aceitável — melhor que chave fraca —
   mas precisa estar documentado para o self-hoster fazer backup da env junto
   do banco: um sem o outro é progresso órfão ou chaves órfãs).

## Proposta

1. **Prefixo de versão agora, que é barato:** novo formato `v2:` +
   base64 (payload igual); `decryptApiKey` trata payload sem prefixo como v1.
   Uma dezena de linhas, zero migração.
2. **Script de rotação** (`pnpm --filter @fuchine/llm rotate-key` ou script no
   db): lê `apiKeyEnc` de todos os `user_settings`, decifra com a chave velha
   (env `OLD_KEY`), re-cifra com a nova, atualiza em transação.
3. Documentar no `.env.example` e no README de produção: "faça backup desta
   chave junto do banco; perdê-la invalida as chaves BYOK salvas".

## Esforço / prioridade

**S · média.** Nada quebra hoje; o custo de *não* ter versão/rotação só
aparece quando for tarde. O prefixo de versão deveria entrar antes de existir
qualquer instância com dados que importem.

## Referências

- `packages/llm/src/crypto.ts:21-46`, `.env.example:25-27`
- CONTRATO_IA §6.3 (chaves nunca em texto puro/logs — inalterado)
- Relacionado: [backups-restore-missing.md] (backup da env junto do banco)
