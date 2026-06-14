# Fuchine — Roadmap de engenharia

**Versão 0.1 · 13 de junho de 2026**

Este é o companheiro executável do `ARQUITETURA.md`. A arquitetura diz **o quê e por quê**; este roadmap diz **o que fazer em seguida**, quebrado em tarefas tamanho-sessão, na ordem das dependências, cada uma com uma definição de pronto verificável.

## Como usar com o Claude Code

Cada tarefa abaixo é aproximadamente **uma sessão de Claude Code**. O fluxo: você abre uma sessão, passa a tarefa (o nome + a descrição), aponta os documentos relevantes, e usa a coluna **"Pronto quando"** como critério de aceite — só fecha a tarefa quando aquilo for verdade. As decisões de fundo estão no `CLAUDE.md` e nos docs de `docs/`; não repita, referencie.

## Princípios deste roadmap

- **Construa na vertical, não na horizontal.** A meta da Fase 0 é *um* vídeo passar por todo o pipeline e ficar pronto no banco. A meta da Fase 1 é *um* vídeo ser estudável de ponta a ponta. Resista a fazer "toda a biblioteca" antes de um vídeo funcionar inteiro — profundidade primeiro, largura depois.
- **Fases 0 e 1 estão detalhadas; 2 e 3 são esqueleto de propósito.** O que você aprender construindo a Fase 1 vai reordenar a 2 e a 3. Detalhar agora seria desperdício. Detalhe cada uma quando chegar perto.
- **Só BYOK até a Fase 3.** O módulo cloud (billing, cotas, chaves gerenciadas) não existe nas Fases 0–1. O produto roda inteiro em self-host com a chave do usuário. Não construa cloud antes dos sinais de demanda (ver `ARQUITETURA.md` §2.3).
- **Tarefa tem tamanho de sessão.** Se uma tarefa parece grande demais para uma sessão, quebre na hora. Se parece pequena demais, agrupe.

## Portão de risco — o spike de legendas vem antes

O **spike de legendas** (sua tarefa, não do Claude Code — ver conversa anterior) precisa estar resolvido **antes de T0.7 e T0.8**. Ele pode rodar em paralelo com T0.1–T0.6, mas o veredito determina *como* o sistema busca legenda: via servidor (yt-dlp / timedtext) ou via extensão como caminho principal. Se o spike apontar que o fetch no servidor é frágil, a **extensão deixa de ser Fase 2 e parte dela sobe para a Fase 0**, e T0.7/T0.8 são reordenadas. Não comprometa o desenho de ingestão antes do spike.

---

## Fase 0 — Fundação

**Meta:** colar uma URL resulta num vídeo totalmente processado no banco — com tokens, dicionário e tradução.

| # | Tarefa | Depende de | Pronto quando |
|---|---|---|---|
| T0.1 | **Esqueleto do monorepo.** pnpm workspaces (ou turborepo), config de TypeScript compartilhada, as pastas `apps/web`, `apps/worker`, `packages/core`, `packages/db`, `packages/nlp`, `packages/llm`. | — | `pnpm install` funciona e um typecheck/build trivial passa em todos os pacotes. |
| T0.2 | **Dev local + licença.** `docker-compose.yml` com Postgres + Redis, scaffolding de variáveis de ambiente (`.env.example`), arquivo `LICENSE` (AGPL-3.0), README mínimo. | T0.1 | `docker compose up` sobe Postgres e Redis, e o app web conecta nos dois. |
| T0.3 | **Pacote db + primeira migration.** Colar `schema.ts` e `types.ts` (já escritos e verificados), ligar o Drizzle, gerar a migration inicial, script de migrate e o cliente de db. | T0.2 | `drizzle-kit generate` produz a migration e ela aplica no Postgres local sem erro. |
| T0.4 | **Seed do JMdict + frequência.** Importar `jmdict-simplified` para `word_entries`; carregar uma lista de frequência em `frequency_rank`. | T0.3 | `word_entries` populada; um lookup por lemma devolve definições coerentes. |
| T0.5 | **Autenticação.** Auth.js com e-mail + Google OAuth; tabelas `users` + `user_settings` ligadas; criar `user_settings` com defaults no cadastro. | T0.3 | Um usuário cadastra, faz login, e a sessão resolve para uma linha em `users`. |
| T0.6 | **Pacote nlp (camada 0).** Interfaces `Tokenizer` e `DictionaryProvider` + adapter japonês com kuromoji.js; tokeniza uma linha no shape `Token` (surface, lemma, reading, pos) e resolve `wordEntryId` contra o JMdict. | T0.4 | Dada uma frase em japonês, devolve tokens com leituras e entradas de dicionário resolvidas. |
| T0.7 | **API de import + registro de vídeo.** Endpoint que aceita URL do YouTube, valida, confere se há legenda em japonês (o *como* sai do spike) e cria `videos` com `status=pending` — ou devolve o vídeo já processado se ele existe (cache compartilhado). | T0.3, spike | Postar uma URL cria um vídeo pendente (ou devolve um existente), e rejeita vídeo sem legenda JP com motivo legível. |
| T0.8 | **Worker — job da camada 0.** Worker BullMQ que pega um vídeo pendente, busca a legenda, quebra em `subtitle_lines` (idx, timestamps, `text_original`), roda o tokenizador para preencher `tokens` e popula `word_examples`. | T0.6, T0.7 | Um vídeo pendente ganha `subtitle_lines` com tokens preenchidos; status vai para processando. |
| T0.9 | **Pacote llm + job da camada 1.** Interface `LlmProvider` (conforme `CONTRATO_IA.md`), resolução de chave BYOK de `user_settings` (decifra AES-GCM) e `translateBatch` com a garantia de alinhamento 1:1. Job chama `translateBatch` para preencher `text_translation` e seta `status=done`. | T0.8 | Vídeo importado tem traduções nas linhas (ou `null` onde apropriado) e `status=done`; falha degrada (status=done, traduções null). |

Ao fim da Fase 0, o pipeline de import está completo, mas ainda não há interface de estudo.

---

## Fase 1 — MVP usável (lançamento OSS)

**Meta:** dá para estudar 30 min por dia de verdade. Ao fim, publicar o repositório.

| # | Tarefa | Depende de | Pronto quando |
|---|---|---|---|
| T1.1 | **App shell + design tokens.** Sidebar (Home, Review, Settings; colapsável), roteamento com rotas protegidas, e os tokens do design aprovado no Login (escala de índigo, tipografia, espaçamento) como config base de Tailwind/CSS. | T0.5 | Usuário logado vê o shell e navega entre rotas; os tokens batem com o design aprovado. |
| T1.2 | **Home/Library (hub de vídeos).** A home video-first (decisão mais recente): grade de vídeos, abas de categoria, busca, indicador de compreensão, e o modal de import (colar link) ligado a T0.7. | T1.1, T0.7 | Vídeos importados aparecem na grade com status; colar link inicia import; a compreensão aparece (baixa no começo, sobe com o estudo). |
| T1.3 | **Player — estado de repouso.** A tela central: embed do YouTube (IFrame API), overlay de legendas duplas sincronizado, painel de transcript com linha atual destacada e auto-scroll, barra de controles (play/pause, seek, linha ant./próx., loop da linha, velocidade, toggle de tradução, toggle de furigana). | T1.1, T0.8 | Um vídeo processado toca com legendas duplas sincronizadas e transcript funcional. |
| T1.4 | **Player — popup de dicionário.** Clicar numa palavra tokenizada abre o popup com dados do JMdict (leitura, classe, definições, frequência, stub de "ver em vídeos"). | T1.3 | Clicar numa palavra mostra a entrada de dicionário instantaneamente, de dados locais. |
| T1.5 | **Player — explicação IA (camada 2).** A ação "explicar" chama `explainLine` (cache-first contra `ai_explanations`), mostra o painel (resumo, pontos de gramática, nuance) com skeleton de carregamento. | T1.3, T0.9 | Tocar "explicar" mostra uma explicação; a segunda vez é instantânea, do cache. |
| T1.6 | **Mineração de sentença.** A ação "minerar" cria um `sentence_card` a partir da linha (timestamps do clipe, nota opcional, deck), com dedup (índice único). | T1.3 | Minerar uma linha cria um card; minerar a mesma linha de novo é impedido e oferece ver o card existente. |
| T1.7 | **Sessão de revisão SRS (FSRS).** Query da fila (cards due, índice user+due), estado de pergunta (clipe toca), estado de resposta com as 4 notas do FSRS ligadas ao `ts-fsrs` (atualiza estado do card, grava `review_logs`), resumo de sessão. | T1.6 | Cards due são revisados de ponta a ponta, as notas reagendam via FSRS, e `review_logs` são gravados. |
| T1.8 | **Configurações.** Idiomas (aprendizado/explicação), entrada de chave BYOK (mascarada, cifra AES-GCM ao salvar), seleção de provider, metas diárias, aparência (tema, furigana padrão), conta. | T1.1, T0.9 | Usuário define idioma de explicação e chave BYOK, e a camada de IA passa a usá-los. |
| T1.9 | **Estados vazios/erro + polimento.** Ligar os padrões de vazio/erro (sem vídeos, import falhou, sem legenda JP, nada a revisar, sem chave). | T1.2, T1.7 | Os principais estados de vazio/erro renderizam e orientam o usuário. |
| T1.10 | **Preparação de lançamento.** README como landing (GIF do loop, `docker compose up`, tabela comparativa), arquivo `NOTICE` (atribuição JMdict/EDRDG, licença da lista de frequência), CI básico (typecheck + build). | T1.1–T1.9 | Um estranho consegue clonar, `docker compose up`, configurar BYOK e estudar; o repo está publicável. |

Ao fim da Fase 1, o loop fecha (importar → assistir → minerar → revisar) e o projeto vai ao ar como open source.

---

## Fase 2 — Alcance (esqueleto — detalhar ao chegar perto)

Nada começa antes da Fase 1 fechar. Em traço grosso:

- **Extensão de browser** — captura metadados/legenda na página do YouTube e reusa a API de import de T0.7. (Sobe de prioridade se o spike apontar a extensão como ingestão principal.)
- **Álbuns** — `albums` + `album_videos`; criar/editar, e usar álbum como filtro de biblioteca, exemplos e revisão.
- **Dicionário (busca)** — página da palavra + exemplos em vídeo reproduzíveis (a partir de `word_examples`).
- **Lista de frases** — gestão dos cards minerados (filtros, notas, status).
- **Stats** — `user_word_stats` + `user_daily_stats` + streak; painéis de palavras e tempo de estudo.
- **Biblioteca pública** — nasce do cache compartilhado: vídeos já processados ficam visíveis e instantâneos para novos usuários.

---

## Fase 3 — Diferenciais (esqueleto — só se os sinais aparecerem)

- **Shadowing** — gravação de voz + API de scoring de pronúncia; registrar tentativas para stats.
- **Quizzes de listening** — tipos de questão a partir de clipes (tradução, frase correta, lacuna).
- **Whisper** — transcrição para vídeos sem legenda (recurso pago da cloud; custo real por minuto).
- **Segundo idioma** — novos adapters `Tokenizer`/`DictionaryProvider`; o banco já está pronto (campo `language`).
- **Módulo cloud** — atrás de `DEPLOYMENT_MODE=cloud`: billing (Stripe), cotas, medição de custo por usuário, chaves gerenciadas; telas de Planos/Billing e Uso & Cota. Construir apenas após validação de demanda.

---

## Caminho crítico e ordem

A espinha que não pode ser furada: **T0.1 → T0.3 → (T0.4, T0.5) → T0.6 → T0.7 → T0.8 → T0.9** fecha o pipeline; depois **T1.1 → T1.3** (o player é o coração) e a partir dele os estados (T1.4, T1.5, T1.6) e a revisão (T1.7). Settings (T1.8) pode entrar mais cedo se você precisar da chave BYOK para testar a camada 2. Estados vazios/erro (T1.9) e lançamento (T1.10) fecham a fase.

## Ressalva honesta

Isto é um plano, não uma profecia. Construir vai revelar reordenações — uma tarefa vai se quebrar em três, outra vai se mostrar desnecessária, e o spike pode mover o bloco de ingestão. Use o roadmap como fila viva: atualize-o conforme aprende, do mesmo jeito que se atualiza o `CLAUDE.md` quando o código real diverge do plano. As Fases 2 e 3 estão propositalmente rasas; não invista em detalhá-las até a Fase 1 estar no ar.
