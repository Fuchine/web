# backlog: Delete account não existe (e Sign out está sem handler)

**Date:** 2026-07-06
**Feature:** Conta (Settings, T1.8)
**Status:** OPEN

---

## Problema

O grupo "Account" do Settings (`settings-view.tsx:135-136`) tem uma única
ação, "Sign out" — que o PR #16 (2026-07-05) ligou (`signOut()` em
`settings-view.tsx:354`). Não existe rota nem UI de **delete account** em
lugar nenhum do app.

Para o self-host de 1 usuário é cosmético; para qualquer instância
compartilhada é básico ("quero sair e levar embora meus dados"), e na cloud
(F3) vira obrigação legal (LGPD/GDPR). O trabalho pesado já está feito no
schema: **todas** as tabelas por usuário referenciam `users.id` com
`onDelete: "cascade"` (settings, accounts, sessions, cards, review_logs,
albums, stats, saved_words) — apagar a linha de `users` limpa tudo. Vídeos e
legendas ficam, corretamente: são o cache compartilhado (D3), não dado do
usuário.

## Proposta

1. **`DELETE /api/account`** (auth): apaga a linha de `users` (cascade faz o
   resto) e encerra a sessão. Confirmação forte no body (ex.:
   `{ confirm: "delete my account" }`) para não ser disparável por acidente.
2. **UI:** row "Delete account" no grupo Account com dialog de confirmação —
   strings em inglês ("This permanently deletes your cards, review history and
   stats. Videos stay in the shared library.").
3. ~~Ligar o Sign out~~ — feito pelo PR #16.
4. Export de dados: o TSV shipped no #16 cobre os cards
   ([anki-export-not-implemented.md]); deletar e exportar são pedidos irmãos.

## Esforço / prioridade

**S-M · média-alta.** Portão de instância compartilhada; o cascade do schema
reduz o backend a uma rota pequena + dialog.

## Referências

- `apps/web/app/settings/settings-view.tsx:135-136, 341`
- `packages/db/src/schema.ts` (cascades a partir de `users`)
- Relacionados: [anki-export-not-implemented.md],
  [catalog-visibility-decision.md]
