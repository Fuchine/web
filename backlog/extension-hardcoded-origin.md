# backlog: Extensão hardcoda localhost:3000 — ingestão primária não funciona em instância publicada

**Date:** 2026-07-06
**Feature:** Extensão (ingestão primária, F0)
**Status:** OPEN

---

## Problema

A extensão é a porta de entrada primária do produto (decisão pós-spike), mas
só fala com `http://localhost:3000`:

- `extension/manifest.json:11` — `host_permissions` fixa em
  `http://localhost:3000/*`;
- `extension/manifest.json:22` — os `matches` do content script idem;
- o popup até tem campo de base URL (`popup.js:9`, `DEFAULT_BASE`), mas sem a
  permissão de host o POST para outra origem é bloqueado pelo browser — o
  próprio `extension/README.md:20` instrui **editar o manifest na mão** para
  instâncias não-localhost.

Ou seja: quem publicar uma instância (o objetivo do lançamento OSS) não
consegue importar vídeo sem fork da extensão. O caminho crítico do produto
depende de um passo manual não empacotado.

## Proposta

Curto prazo (MV3 atual, sem build):

1. Mover a origem do app para `optional_host_permissions` com um padrão amplo
   (`https://*/*`) e pedir a permissão em runtime
   (`chrome.permissions.request`) quando o usuário salvar a base URL no popup
   — o manifest para de fixar a instância.
2. Manter `localhost:3000` como default de dev.

Médio prazo (F2, já prevista): a migração para WXT gera manifests por
ambiente e resolve isso no build; a publicação na Web Store elimina o
"instalar sem empacotar".

## Esforço / prioridade

**S-M · alta para o lançamento.** Sem isso, o pitch "importe em 1 clique" só é
verdadeiro em dev. O ajuste de `optional_host_permissions` é pequeno e não
espera a WXT.

## Referências

- `extension/manifest.json:11,22`, `extension/popup.js:9`,
  `extension/background.js:106`, `extension/README.md:15-35`
- CLAUDE.md (extensão = ingestão primária; migração WXT na F2)
