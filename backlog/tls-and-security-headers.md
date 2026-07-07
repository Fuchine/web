# backlog: Sem terminação TLS no compose e sem security headers no Next

**Date:** 2026-07-06
**Feature:** Produção / Deploy
**Status:** OPEN

---

## Problema

1. **TLS não tem dono.** O plano do compose ([deploy-story-missing.md]) prevê
   web + worker + infra, mas ninguém termina HTTPS — e produção **exige**:
   OAuth do Google não aceita redirect http fora de localhost, cookies de
   sessão precisam de `Secure`, e `trustHost: true` (`auth.ts:50`) confia nos
   headers `X-Forwarded-*` que só um proxy bem configurado fornece (proxy mal
   configurado = host-header injection → envenenamento de magic link).
2. **Zero security headers.** `next.config.ts` não define `headers()`
   (verificado 2026-07-06): sem CSP, HSTS, `X-Content-Type-Options` nem
   `Referrer-Policy`. O app embeda iframe do YouTube e serve conteúdo gerado
   por LLM — CSP é a segunda linha de defesa natural.

## Proposta

1. **Caddy como proxy default do self-host** no compose (TLS automático via
   Let's Encrypt, 15 linhas de Caddyfile): termina HTTPS, seta
   `X-Forwarded-Host/Proto` corretos, e o serviço `web` **não publica porta**
   no host (fecha o bypass do proxy que o `trustHost` teme). Documentar
   alternativa "traga seu proxy" para quem já tem nginx/Traefik.
2. **`headers()` no `next.config.ts`**, começando conservador para não quebrar
   o app (CSP estrita em Next exige nonce em scripts — não entrar nessa agora):
   - `Content-Security-Policy`: `frame-src https://www.youtube.com
     https://www.youtube-nocookie.com; img-src 'self' https://img.youtube.com
     https://i.ytimg.com data:; object-src 'none'; base-uri 'self'`
     (o player e as thumbnails continuam funcionando; scripts ficam fora da
     política nesta fase — endurecer depois com Report-Only antes).
   - `Strict-Transport-Security: max-age=31536000; includeSubDomains`
   - `X-Content-Type-Options: nosniff` · `Referrer-Policy:
     strict-origin-when-cross-origin`
3. Smoke test obrigatório após ligar a CSP: player toca, thumbnail carrega,
   popup e explain funcionam (ver `docs/DEPLOY_CHECKLIST.md`).

## Esforço / prioridade

**S-M · alta.** Sem o item 1 o portão 1 não fecha (login não funciona em
https ausente); o item 2 é barato e protege contra a classe de bug que o app
mais vai receber de reporte externo quando for público.

## Referências

- `apps/web/next.config.ts` (sem `headers()`), `apps/web/auth.ts:50`
  (`trustHost`)
- `packages/ui/src/components/Player/PlayerVideo.tsx` (embed + origin)
- Relacionados: [deploy-story-missing.md], [env-validation-fail-fast.md],
  `docs/DEPLOY_CHECKLIST.md`
