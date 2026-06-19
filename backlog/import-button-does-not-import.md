# backlog: Import Button — Server-Side Import Não Funciona

**Date:** 2026-06-19
**Feature:** Import Modal (`/import`)
**Branch:** `feat/import-modal`
**Status:** UI COMPLETA — FUNCIONALIDADE INCOMPLETA

---

## O que foi implementado

- Modal com 7 estados: `empty → validating → valid → reject → processing → done → failed`
- Validação de URL via YouTube oEmbed API (retorna título + canal + thumbnail)
- Preview do vídeo com thumbnail real
- Nota sobre a extensão do Chrome como forma primária de captura de legendas

## O problema: importação de legendas não funciona

### O que o botão "Import" faz hoje

O usuário cola uma URL do YouTube → o sistema valida via oEmbed → mostra preview → botão "Open video" redireciona para o player.

**Não há importação real de legendas.** O modal apenas exibe o vídeo encontrado.

### Causa raiz: spike provou que fetch server-side de legendas é bloqueado

Em `tools/spike/` (execultado em GitHub Actions, IP de datacenter), foi provado que:

1. `ytInitialPlayerResponse` contém os metadados da legenda (nome da faixa, languageCode) mas **não o conteúdo**
2. A requisição para `/timedtext` (conteúdo real da legenda) retorna **0 bytes** quando disparada de IP de datacenter
3. De browser real (autenticado, sessão ativa), o conteúdo chega normalmente

**Conclusão:** o YouTube bloqueia requisições de legendas que não vêm de uma sessão de browser real. Não é uma limitação de CORS ou API key — é uma gate de IP/sessão.

### Por que a extensão funciona

A extensão injeta JavaScript no **contexto da página do YouTube** (mundo MAIN). Quando o usuário está logado no YouTube e abre um vídeo:

1. O player carrega as legendas normalmente
2. A extensão intercepta `ytInitialPlayerResponse` ou a requisição do player
3. Extrai o conteúdo real das legendas (não apenas metadados)
4. POSTa em `/api/import` com o payload completo de legendas

A extensão é a **ingestion path primária** por design.

### O que está faltando para a importação funcionar

Para que o botão "Import" do modal realmente importe legendas, existem duas abordagens:

#### Opção A: Extensão como gateway (implementar redirect)

Quando o usuário clica em "Open video" no modal, em vez de simplesmente redirecionar para `/videos/:id`, o fluxo seria:

1. Modal → extension captura legendas → POST `/api/import` → redirect para `/videos/:id`
2. Problema: a extensão só funciona na página do YouTube, não dentro do app Fuchine

#### Opção B: Extensão injetada + message passing

1. Usuário abre vídeo no YouTube → ativa extensão → extensão captura legendas → envia para o app
2. App recebe e faz o import
3. Mais complexo de implementar

#### Opção C: Import via extension + "Open video" posterior

O fluxo atual do design já contempla isso:
- Modal guiding o usuário a usar a extensão primeiro
- "Open video" abre o player mesmo sem legendas (estudo JP-only, sem tradução)
- Legendas capturadas pela extensão aparecem quando o usuário abre o vídeo

**Recomendação:** seguir com a Opção C. O modal já existe para isso. Não fazer import server-side — a extensão é o gateway.

## Comportamento atual do botão "Open video"

| Cenário | O que acontece |
|---------|----------------|
| Extension não instalada | Abre o player, vídeo sem legendas importadas |
| Extension instalada + nunca capturou | Abre o player, legenda vazia |
| Extension capturou antes | Player mostra legendas normalmente |

## Tracking

- [ ] Implementar redirect automático para YouTube quando extension não instalada
- [ ] Mostrar instrução clara para instalar extensão quando usuário tenta importar
- [ ] Adicionar "How to install extension" como modal/tooltip no state `valid`
- [ ] Verificar se extensão faz POST em `/api/import` corretamente quando captura legendas
