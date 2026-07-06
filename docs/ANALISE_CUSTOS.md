# Análise de custos — base para precificar os planos

**Versão 0.1 · 6 de julho de 2026 · status: estimativa (pré-medição)**

Modelo de custo unitário do Fuchine para fundamentar a precificação da cloud
(F3). Os números vêm dos prompts e contratos reais do código (auditoria de
2026-07-06), **não de medição em produção** — o repositório ainda não registra
`usage` de nenhuma chamada ([llm-usage-metering.md](../backlog/llm-usage-metering.md)
é pré-requisito para validar tudo aqui antes de travar preço). Tratar cada
número como ordem de grandeza com ±50%.

**Regra de leitura:** no self-host o custo de IA é do usuário (BYOK) — este
documento existe para o modo cloud, onde a house key paga.

---

## 1. Premissas

| Premissa | Valor | Fonte |
|---|---|---|
| Vídeo de referência | 20 min · **500 linhas** · ~10k chars JP (20/linha) | e2e real: 595 linhas; extensão: 55 (curto). Variância 300–800. |
| explainLine, tokens/linha | ~450 in + ~300 out (sistema ~350 + linha/vizinhos/tokens; saída ≤8 partes + plainTerms) | `packages/llm/src/prompts.ts` |
| translateBatch (LLM), tokens/vídeo | ~13k in + ~9k out (chunks de 40, sistema ~150/chunk) | `prompts.ts`, `TRANSLATE_CHUNK=40` |
| DeepL | US$ 25/M chars (Pro) · Free = 500k chars/mês | pricing público 2026 |
| Tiers de LLM (in/out por M tokens) | **econômico** US$ 0,15/0,60 · **médio** US$ 0,30/1,20 · **premium** US$ 1/5 | classe GPT-mini / MiniMax M3 / classe Haiku |
| Política atual de pre-warm | vídeo **inteiro** no import (`en`) | `apps/worker/src/index.ts:26` |
| Tradução | lazy por chunk — só o que é **assistido** custa | `lib/translate.ts`, CONTRATO §3.6 |

Consequência estrutural importante: **um vídeo importado e nunca assistido
custa hoje a camada mais cara (pre-warm completo) e não custa a barata
(tradução lazy)** — é o inverso do desejável e o que o cap de pre-warm
([prewarm-cost-per-import.md](../backlog/prewarm-cost-per-import.md)) corrige.

## 2. Custo por unidade

| Unidade | Econômico | Médio | Premium | Nota |
|---|---|---|---|---|
| Linha explicada (camada 2) | ~US$ 0,0002 | ~US$ 0,0005 | ~US$ 0,002 | uma vez por linha/idioma/versão (cache D3) |
| Pre-warm vídeo inteiro (500 linhas) | ~US$ 0,12 | ~US$ 0,25 | ~US$ 0,98 | política atual |
| Pre-warm com cap de 150 linhas | ~US$ 0,04 | ~US$ 0,08 | ~US$ 0,29 | proposta do backlog |
| Tradução do vídeo via LLM | ~US$ 0,01 | ~US$ 0,02 | ~US$ 0,06 | se assistido inteiro |
| Tradução do vídeo via DeepL | — | **US$ 0,25** | — | 10k chars × $25/M; free tier ≈ 50 vídeos/mês |
| Camada 0 (tokens + dicionário) | ~0 | ~0 | ~0 | CPU local do worker |
| Storage por vídeo | ~2 MB | | | linhas+tokens ~1 MB, explicações ~0,6 MB, exemplos ~0,2 MB |
| Vídeo em **cache hit** | **~US$ 0** | | | só leitura de banco — o fosso (D3) |
| Review / mining / dicionário / player | ~0 | | | banco + YouTube IFrame (grátis, D1) |
| Whisper (futuro F3) | ~US$ 0,12 / vídeo de 20 min | | | ~$0,006/min — base do add-on pago |

Duas leituras imediatas:

1. **DeepL é o item mais caro por vídeo assistido no tier médio** (~10–20× a
   tradução via LLM). Faz sentido no self-host (qualidade, free tier); na
   cloud em escala, a config recomendada inverte: LLM econômico como MT
   primário e DeepL como opção de qualidade — é só configuração (D5).
2. O custo por import é dominado pelo pre-warm, e a política (inteiro × cap)
   move o número em **3×**; o tier de provider move em **8×**. As duas
   alavancas juntas: US$ 0,04–0,98 por vídeo novo.

## 3. Cenários de usuário ativo/mês (cloud, marginal de IA)

Perfis: **leve** 4 vídeos novos + 3 assistidos/mês · **médio** 15 novos + 10
assistidos · **pesado** 40 novos + 25 assistidos. "Novo" = primeiro import na
plataforma (cache miss). Tradução via LLM do mesmo tier; explicações
on-demand além do cap incluídas nos assistidos.

| Cenário | Política atual (pre-warm inteiro, tier médio) | Cap 150 + tier médio | Cap 150 + tier econômico |
|---|---|---|---|
| Leve | ~US$ 1,10 | ~US$ 0,70 | ~US$ 0,30 |
| Médio | ~US$ 4,00 | ~US$ 2,40 | ~US$ 1,10 |
| Pesado | ~US$ 10,50 | ~US$ 6,20 | ~US$ 2,80 |

- **Na política atual + tier médio, o usuário pesado consome ~US$ 10,50 — a
  assinatura inteira da âncora de preço.** É o argumento econômico definitivo
  para o cap de pre-warm antes da cloud.
- **Efeito do cache compartilhado:** os cenários assumem cache frio (lançamento).
  Com hit rate de 50% (conteúdo popular de imersão concentra muito — anime,
  vtubers, podcasts conhecidos), os valores caem ~pela metade; com 70%, a
  ~1/3. O custo marginal **cai sozinho com a escala** — essa é a tese do fosso
  (§2.1 da arquitetura) aparecendo na planilha.
- Infra fixa rateada: +US$ 0,30–1,00/usuário em escala pequena (ver §4).

## 4. Infra fixa (cloud, escala de lançamento)

| Item | Estimativa/mês |
|---|---|
| Compute (web + worker, Railway/Fly/VPS) | US$ 20–40 |
| Postgres gerenciado (ou no VPS) | US$ 0–15 |
| Redis | US$ 0–10 |
| E-mail transacional (magic link) | ~0 (free tier) |
| Egress | ~0 (payloads de texto; vídeo nunca passa por nós — D1) |
| **Total** | **~US$ 30–60** |

Storage cresce ~2 MB/vídeo (10k vídeos ≈ 20 GB — irrelevante no horizonte).
Ponto de equilíbrio da infra fixa: **~10 assinantes** no corredor de preço
abaixo.

## 5. Alavancas de custo (todas já mapeadas no backlog)

| Alavanca | Efeito | Item |
|---|---|---|
| Cap do pre-warm (150 linhas + resto no 1º open) | −60–70% no custo por import | [prewarm-cost-per-import.md](../backlog/prewarm-cost-per-import.md) |
| Tier do provider house | 8× entre econômico e premium | config (D5) |
| MT: LLM em vez de DeepL na cloud | −~90% na tradução por vídeo | config (D5) |
| Cache hit rate | −50–70% com escala | estrutural (D3) |
| Single-flight no explain | elimina gasto duplicado prefetch×prewarm | [explain-double-generation.md](../backlog/explain-double-generation.md) |
| Rate limit + quotas | teto de abuso da house key | [ai-endpoints-no-rate-limit.md](../backlog/ai-endpoints-no-rate-limit.md) |
| **Medição de usage** | transforma este doc de estimativa em fato | [llm-usage-metering.md](../backlog/llm-usage-metering.md) |

## 6. Moldura de precificação (direcional — NÃO travar ainda)

Âncora do mercado: HayaiLearn ~US$ 10/mês (ARQUITETURA §2.3). **Foco
comercial definido em 2026-07-06: clientes pagantes em dólar** — preço único
em US$ no lançamento da cloud. O preço regional em real (citado como
diferencial no §2.3) vira alavanca de expansão posterior, quando houver base
BR que justifique operação local (Pix, imposto, suporte).

**Free (cloud)** — deve montar no cache, onde o marginal é ~zero:

- Vídeos já processados (cache hit): **ilimitados** — custo ~0 e é o gancho
  de aquisição ("a biblioteca pública é grátis").
- ~5 imports novos/mês + explicações on-demand nos vídeos próprios.
- Custo marginal worst-case: ~US$ 0,5–1/usuário ativo (cap+médio) — CAC
  aceitável pago em infra.

**Pro (cloud)** — corredor sugerido:

| | US$ (mercado-alvo) |
|---|---|
| Corredor | 8–9,99/mês |
| Racional | abaixo/na âncora de US$ 10; o pesado worst-case (US$ 6,20, cache frio) é coberto **individualmente** — sem dependência de mix; margem bruta ≥65% |

O corredor regional em R$ (24,90–29,90) da v0.1 fica registrado como opção de
expansão futura, fora do escopo de lançamento.

- Quotas Pro generosas, não ilimitadas: ex. 60 imports novos/mês + explains
  em qualquer idioma — o limite existe para proteger da cauda, não para ser
  sentido (o pesado real usa ~40).
- **BYOK na cloud** (§6.2 já prevê chave por sessão): variante "Pro BYOK" com
  desconto (usuário paga a própria IA, nós cobramos conveniência/sync) —
  decisão de produto para depois, mas o preço deve nascer com espaço para ela.
- Whisper entra como add-on/limite por minutos quando existir (custo real
  ~US$ 0,12/vídeo — margem clara num add-on de ~US$ 2–3/mês).

### 6.1. Recomendação concreta (v0.2 — foco: clientes pagantes em dólar)

| Plano | Preço | Inclui |
|---|---|---|
| Self-host | Grátis (sempre) | Tudo, BYOK — o open core |
| Cloud **Free** | US$ 0 | Biblioteca em cache ilimitada · 5 imports novos/mês · SRS/dicionário ilimitados |
| Cloud **Pro** | **US$ 8/mês** · **US$ 79/ano** (~2 meses grátis) | 60 imports novos/mês (soft cap) · explicações em qualquer idioma · backup/sync gerenciado |
| Pro BYOK (fase 2 da cloud) | US$ 5/mês | Usuário paga a própria IA; cobramos hospedagem/sync/cache |

Racional do US$ 8:

- **Todo usuário é individualmente lucrativo desde o dia 1:** o pesado
  worst-case (cache frio, cap + tier médio) custa US$ 6,20 < US$ 7,45 líquidos
  de taxas de pagamento. Nenhuma dependência de mix de usuários.
- Margem bruta ponderada (mix ~60/30/10 leve/médio/pesado, custo ≈ US$ 2,50):
  **~66% no lançamento → ~80% com cache aquecido**. Break-even da infra fixa:
  ~5–8 assinantes.
- 20% abaixo da âncora (US$ 10): o desconto + a confiança do open source são a
  cunha de conversão prevista na arquitetura. **US$ 9,99** (paridade com a
  âncora) é a alternativa de receita máxima — a recomendação fica no 8 pela
  cunha; subir depois é mais fácil com grandfathering do que baixar.

Fragilidade restante: **o cap de pre-warm segue como pré-condição** — na
política atual (vídeo inteiro) o pesado custa US$ 10,50/mês e nem o US$ 9,99
fecha. (A fragilidade de mix da v0.1, ligada ao preço BR, desaparece com o
preço único em dólar.)

Operacionalmente, USD-first simplifica o lançamento: Stripe em moeda única,
sem Pix/boleto/imposto local; e o produto já é English-first (UI e
`explanation_language` default `en`), alinhado ao mercado pagante.

**Condições para travar o preço** (o gate do §2.3 continua valendo — só
precificar com sinais de demanda):

1. 1–2 meses de medição real ([llm-usage-metering.md]) validando: tokens/vídeo
   efetivos, distribuição de linhas/vídeo, % de vídeos importados que são
   assistidos, explains on-demand por usuário.
2. Cap de pre-warm implementado (sem ele, o pesado é deficitário no tier médio).
3. Hit rate do cache observado com os primeiros usuários reais do OSS.

---

## Relação com outros documentos

- `ARQUITETURA.md` §2 (open core, âncora de preço), §6.4 (custo por camada),
  §11 (custo medido por usuário desde o dia 1 da cloud).
- `CONTRATO_IA.md` §3.6 (tradução lazy — por que só o assistido custa).
- Backlog: itens citados em §5; índices [AUDITORIA-2026-07-06.md](../backlog/AUDITORIA-2026-07-06.md)
  e [PRODUCAO-2026-07-06.md](../backlog/PRODUCAO-2026-07-06.md).
