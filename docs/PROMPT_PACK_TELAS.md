# Fuchine — Prompt Pack (telas restantes)

**Versão 0.1 · 13 de junho de 2026**

Todos os prompts do Claude Design para as telas que faltam, em inglês (instruções e textos de UI em inglês), na ordem do inventário. Já gerados separadamente: Login, Dashboard, Import by URL, Library e Player (rest state).

## Como usar este pack

O sistema visual foi extraído num **Style Block** reutilizável (abaixo), em vez de repetido em cada prompt. Para cada tela:

- **Conversa nova no Claude Design:** cole o Style Block primeiro, depois o prompt da tela.
- **Conversa que já tem contexto** (ex.: onde você gerou o Login): vá direto ao prompt da tela; ele já conhece o estilo.
- **Ajustes:** mude por conversa ("change only X, keep the rest"), não regenere do zero.

Os três **estados do player** (word clicked, AI explanation, mined sentence) são modificações sobre o player-base — o ideal é gerá-los na *mesma* conversa do Claude Design onde você fez o player em repouso, pedindo o novo estado. Eles herdam todo o layout.

---

## STYLE BLOCK — cole no topo de cada conversa nova

```text
FUCHINE STYLE BLOCK — apply to every screen.
- App: Fuchine, an immersion app for learning Japanese by watching YouTube videos. The name comes from 淵 (fuchi), "the depths" — diving into the language. All UI text is in English.
- "Ma minimalism": calm, spacious, and functional like Linear/Notion, with a Japanese sensibility from generous negative space (間), refined typography, and restraint. A quiet interface so the content (video, Japanese text) is the protagonist. Warmth comes from warm neutrals and soft corners, never vibrant color.
- Palette: warm off-white background (not pure white), warm grays for text/borders, near-black for primary text. The brand color is a deep Japanese indigo (藍), used as a scale: dark indigo #1F3A5F for surfaces (buttons, active states, focus), a more saturated mid indigo for text/links (legible on the off-white), and a very light indigo for subtle fills. Errors use their own calm red, separate from the indigo. No vibrant warm colors.
- Typography: a clean modern sans (Inter-like). Japanese text, when present, is real content — treat it with care: comfortable size, generous CJK line-height, clear separation from its translation.
- Generous spacing, gently rounded corners (not bubbly), light and dark themes (show light unless noted).
- App shell: a left sidebar (Fuchine wordmark; nav: Home, Library, Review, Settings, with visual room for future Dictionary / Phrases / Albums / Stats; collapsible to icons; account at the footer). The active item is highlighted in indigo.
```

---

# Fase 1 — completar o loop

## Player · word clicked (dictionary popup)

Overlay sobre o player. Gere na conversa do player; tudo permanece igual, só abre o popup do dicionário na palavra clicada.

```text
PLAYER STATE — word clicked (dictionary popup). Continue from the Player base layout; everything stays identical, but show the state where the user has clicked a Japanese word in the focal subtitle (or in the transcript) and a dictionary popup is open.

The popup is a small, floating, calm card anchored to the clicked word:
- The word in Japanese (kanji), large, with its reading (hiragana / furigana)
- Part of speech as a small muted tag
- One or more concise English definitions
- The dictionary form (lemma) if it differs from the surface form
- A small frequency indicator (how common the word is)
- Bottom actions: "See in videos" (find other video clips using this word) and a save-word affordance
- The clicked word in the subtitle is subtly highlighted to show what the popup refers to

The popup feels instant and quiet, doesn't pause the experience, and dismisses easily. Everything else (video, dual subtitles, transcript, control bar) stays exactly as the resting state. Light theme.
```

## Player · AI explanation panel

Overlay/painel lateral sobre o player. Os campos espelham a saída da IA (resumo, até 4 pontos de gramática com nível JLPT, nuance).

```text
PLAYER STATE — AI explanation panel. Continue from the Player base layout. Show the state where the user tapped the "explain" (AI) icon on a subtitle line and a line-explanation panel is open — slide it in from the right as a side panel, without hiding the video.

The panel explains the selected line, top to bottom:
- The selected Japanese sentence at the top, with its English translation beneath
- SUMMARY: a short, natural-language explanation of what the sentence means
- GRAMMAR: up to ~4 grammar points, each a calm row showing the grammar pattern in Japanese (e.g. 〜てしまう), a small JLPT level tag (N5–N1), and a one-line English explanation
- NUANCE (optional): a short note on register, slang, or cultural context — shown only when relevant

Give it a subtle "cached / instant" feel, and also include a loading variant (skeleton) as a secondary state, since explanations are generated on demand the first time. The selected line is highlighted in the transcript. The video and controls stay visible and usable. The panel is calm, readable, and well-spaced — closer to a beautiful study note than a dense data panel. Light theme.
```

## Player · mined sentence (save confirmation)

Confirmação leve sobre o player, logo após minerar uma frase.

```text
PLAYER STATE — sentence mined (save confirmation). Continue from the Player base layout. Show the state right after the user tapped the "mine" (save sentence) icon on a line, turning that line into a review card.

Show a calm confirmation — a small popover or lightweight modal near the line — containing:
- A brief confirmation that the sentence was saved as a card (e.g. "Saved to review")
- The saved Japanese sentence with its English translation
- An optional note field ("Add a note…") for the user's own annotation
- A deck/collection selector (e.g. "Default", or a JLPT deck) — small and optional
- A subtle "already saved" indication if the line was mined before (offer to view the existing card instead of duplicating)
- A small undo affordance

It should feel like a one-click, low-friction capture — quick, reassuring, and easy to dismiss. The mined line gets a subtle "saved" marker in the transcript. Everything else stays as the resting player. Light theme.
```

## Review · question (SRS)

Modo focado, listening-first. O clipe do vídeo toca antes de revelar a resposta.

```text
Create the Review (SRS) session screen for Fuchine — the spaced-repetition review of mined sentence cards, where each card replays the original video clip. Show the QUESTION state (before the answer is revealed). Apply the Fuchine Style Block. This is a focused, full-attention mode — minimize or hide the sidebar and center the experience.

QUESTION state:
- The original VIDEO CLIP for the card plays (the exact trimmed segment the sentence came from), in a clean player at center-top. The point is listening: the user hears the line in its real context.
- A calm prompt to listen and try to recall/understand before revealing — keep the Japanese text hidden or partially hidden at this stage to keep the focus on listening, with a "tap to reveal" affordance.
- A replay-clip button and a play-audio-only option.
- Minimal chrome: a small session-progress indicator (e.g. "7 / 23") and a quiet exit/close.
- A single primary action: "Show answer".

Calm, distraction-free, listening-first. Light theme.
```

## Review · answer + grade (SRS)

Continuação do estado anterior. Os quatro botões mapeiam direto nas notas do algoritmo de repetição.

```text
REVIEW (SRS) — answer state. Continue from the Review question screen. Show the state after the user tapped "Show answer".

The ANSWER state reveals:
- The Japanese sentence (full, with optional furigana), its English translation, and brief context (which video it's from). Words may be clickable for a quick dictionary check, consistent with the player.
- The video clip remains replayable.
- GRADING buttons — four calm options mapping to spaced-repetition grades: "Again", "Hard", "Good", "Easy". Each shows the resulting next interval in small text (e.g. "Again <1m", "Good 4d", "Easy 9d"). Use indigo for the primary/positive path; keep them understated, not a traffic-light row.
- The session-progress indicator persists.

After grading, the next card loads (back to the question state). Calm and quick to act on. Light theme.
```

## Session summary

Recap calmo de fim de sessão — sem celebração gamificada.

```text
Create the Session Summary screen for Fuchine — shown at the end of a review session. Apply the Fuchine Style Block (the sidebar can stay collapsed/minimal as a continuation of the focused review mode).

Contents:
- A calm, quietly rewarding header (e.g. "Session complete") — understated, not confetti.
- A short summary of the session: cards reviewed, how many were known vs hard/again, time spent.
- A gentle nudge toward the day's remaining activity: if more cards remain, "X cards still due — keep going" with a "Continue reviewing" button; if none, a calm "All caught up" state.
- A secondary path back: "Back to home" and "Watch a video".
- Optional: a tiny, understated streak/continuity acknowledgment.

Closer to a calm study-session recap than a gamified rewards screen. Light theme.
```

---

# Fase 2 — alcance

## Dictionary · search

Estudo bottom-up. O diferencial é que todos os exemplos são clipes de vídeo reais e reproduzíveis.

```text
Create the Dictionary screen for Fuchine — a searchable Japanese dictionary where every example sentence is a real video clip. It supports bottom-up study (look up a word, then see it across videos). Apply the Fuchine Style Block; uses the app shell (Dictionary becomes an active sidebar item).

LAYOUT:
- A prominent search field ("Search a word — Japanese, reading, or English").
- WORD PAGE: for the looked-up word, show the word (kanji) large with reading/furigana, part of speech, a frequency indicator, and a clear list of English definitions/senses. Include a save-word affordance.
- VIDEO EXAMPLES (the heart of the screen): a list of example sentences drawn from videos. Each example shows the Japanese sentence (with the target word highlighted), its English translation, the source video (thumbnail + title), and a play button that jumps to that exact moment in the clip. Make it clear these are real, playable video examples, not invented sentences.
- Optional filter: limit examples to a specific Album.

STATES: default (a word looked up, with examples), searching/loading, and no-results ("No matches — try another spelling or the English meaning"). A calm reference tool where the video examples make it feel alive and contextual. Light theme.
```

## Phrases (mined sentences list)

Gestão dos cards minerados. Filtros por vídeo, álbum, data e status.

```text
Create the Phrases (mined sentences) screen for Fuchine — where the user manages all the sentence cards they've saved from videos. Apply the Fuchine Style Block; uses the app shell (Phrases becomes an active sidebar item).

LAYOUT:
- Title "Phrases" + a search field and calm filters: by video, by Album, by date added, by status (New / Learning / Known / Difficult), and a sort control.
- A LIST of saved sentence cards. Each row shows the Japanese sentence, its English translation beneath (muted), the source video (small thumbnail or title), the user's note if any, and a small status tag (with a hint of its review schedule).
- Row actions (calm, on hover/tap): edit note, mark as known/difficult, play the source clip, delete.
- A way to start a review limited to the current filter (e.g. "Review these").

STATES: default (a populated list), filtered, and empty ("No saved phrases yet — mine sentences while watching to build your review deck"). An organized, calm collection — closer to a well-kept notebook than a dense table. Light theme.
```

## Albums

Organização de vídeos em coleções, que viram filtro de estudo.

```text
Create the Albums screen for Fuchine — where the user organizes videos into collections (e.g. Anime, News, Vlogs) and can filter study by album. Apply the Fuchine Style Block; uses the app shell (Albums becomes an active sidebar item).

LAYOUT:
- Title "Albums" + a "New album" button (dark indigo).
- A GRID (or calm list) of album cards. Each card: a name, an optional description, a count of videos, and a montage/stack of a few video thumbnails as a cover. Quiet and content-led.
- Clicking an album opens its detail: the album's videos in a grid (reuse the Library card style), with controls to add/remove videos, rename or delete the album, and an action to filter study (examples and reviews) to this album.
- Include the "New album" creation state: a small modal with a name field and an optional description.

STATES: default (several albums), an album detail view, and empty ("No albums yet — group videos into collections to focus your study"). A calm, personal organization layer, like curated shelves. Light theme.
```

## Stats

Tracking de imersão. Understated e motivador, nunca um painel barulhento.

```text
Create the Stats screen for Fuchine — the user's immersion progress and tracking. Apply the Fuchine Style Block; uses the app shell (Stats becomes an active sidebar item). Keep it understated and motivating, never a loud gamified dashboard.

CONTENTS:
- A top row of headline numbers, calmly presented: total hours watched, words learned/known, sentences mined, current day streak.
- A primary CHART: study time per day/week (a calm bar or line chart in indigo), with a day/week toggle.
- WORD insight panels: "Most seen words", "Most difficult words" (highest error rate), and "Mastered words" (high exposure + high accuracy) — each a short, scannable list.
- A distribution view: time spent per Album (a calm breakdown).
- Everything uses the indigo scale and warm neutrals; charts are clean and minimal, not colorful.

STATES: default (populated) and early/empty ("Not enough data yet — keep watching and reviewing to see your progress"). A quiet, encouraging progress view. Light theme.
```

## Extension · popup

Ponte de um clique entre onde a pessoa assiste e o app. Dimensões compactas de popup.

```text
Create the browser-extension popup for Fuchine — a small popup shown when the user clicks the Fuchine extension icon while on a YouTube (or video) page. It lets them import the current video into their Fuchine account in one click. Apply the Fuchine Style Block, but at small popup dimensions (compact, ~360px wide). All UI text in English.

CONTENTS / STATES:
- LOGGED-IN, video detected: shows the current video (thumbnail + title), a confirmation that Japanese subtitles are available (or a note if not), and a primary "Import to Fuchine" button (dark indigo). A small link to open the web app.
- IMPORTING / PROCESSING: a compact progress state ("Importing…" with a subtle indicator).
- DONE: "Added to Fuchine" with an "Open in Fuchine" link.
- NOT A VIDEO PAGE: a calm message ("Open a YouTube video to import it").
- LOGGED-OUT: a simple "Sign in to Fuchine" prompt with a button.

Compact, calm, and instant-feeling — the one-click bridge from where the user watches to their study app. Light theme.
```

---

# Fase 3 — diferenciais

## Shadowing (pronúncia)

Repetir a frase e receber um score. Feedback construtivo, nunca duro.

```text
Create the Shadowing (pronunciation practice) screen for Fuchine — where the user repeats a sentence aloud and gets a pronunciation score. Apply the Fuchine Style Block; a focused, full-attention mode (sidebar minimal). All UI text in English.

FLOW / STATES:
- PROMPT: shows the sentence (Japanese, with optional furigana, and translation) and plays the reference audio/clip from the video. A clear "Record" button is the primary action.
- RECORDING: an active recording state — a calm waveform or pulse, a stop button, a sense that the mic is live.
- PROCESSING: a brief quiet state while the attempt is scored.
- RESULT: an overall pronunciation score, with per-segment feedback — highlight which parts of the sentence were good vs need work (color or underline on the problem syllables/words, using the calm palette), plus prosody/timing feedback. Actions: "Try again" and "Next".
- A way to replay the reference and replay the user's own recording for comparison.

Show the prompt, recording, and result states. Calm and encouraging — feedback should feel constructive, never harsh. Light theme.
```

## Listening quiz

Treino de ouvido a partir de clipes reais. Mostre alguns tipos de questão.

```text
Create the Listening Quiz screen for Fuchine — short video-based listening exercises that train the ear from real clips. Apply the Fuchine Style Block; a focused mode. All UI text in English.

A clip plays, then the user answers. Support these question types (show a couple):
1) Hear the clip, choose the correct English translation (multiple choice).
2) Hear the clip, choose which Japanese sentence matches (multiple choice).
3) Fill-in-the-blank: after hearing, complete a missing word/part of the sentence.

- A replay-clip button; clean multiple-choice options (calm cards, indigo for selection/correct).
- Immediate feedback after answering: correct/incorrect shown calmly (correct in indigo/green, incorrect in the calm red), with the right answer revealed and a small explanation.
- A session-progress indicator and a primary "Next" action.

STATES: question (unanswered), answered-correct, answered-incorrect. Calm, focused, ear-training-first. Light theme.
```

## Plans / Billing (cloud only)

Só na versão hospedada. Vende conveniência, não funcionalidade trancada — coerente com open core.

```text
Create the Plans / Billing screen for Fuchine — the upgrade and subscription screen for the hosted (cloud) version. (Cloud-only; the open-source self-host version doesn't show this.) Apply the Fuchine Style Block; uses the app shell or a focused settings sub-page. All UI text in English.

CONTENTS:
- A calm plan comparison: a Free/Trial tier and a Pro tier (optionally a Team/School tier). For each: price and a clear, honest list of what's included. Emphasize that cloud Pro is about convenience and managed AI (no API-key setup), not features removed from the core. Subtly mention regional pricing support.
- The user's current plan clearly indicated; a primary "Upgrade" action in dark indigo on the recommended plan.
- A billing area: payment method, billing cycle (monthly/annual toggle with an annual discount), and manage/cancel.
- Keep claims calm and trustworthy — no aggressive upsell or dark patterns.

STATES: viewing plans (on free) and managing-subscription (on pro). Honest, calm, premium — consistent with an open-core product that sells convenience, not locked features. Light theme.
```

## Usage & quota (cloud only)

Transparência de consumo de IA. Não punitivo.

```text
Create the Usage & Quota screen for Fuchine — where a cloud (hosted) user sees their AI usage against their plan limits. (Cloud-only.) Apply the Fuchine Style Block; a settings sub-page. All UI text in English.

CONTENTS:
- A clear, calm view of this billing period's usage vs the plan's limit (e.g. videos imported / AI explanations used), as understated progress bars or meters in the indigo scale.
- A breakdown of what consumes quota (imports, explanations, transcription if applicable).
- A gentle warning state as the user approaches the limit ("You're close to your monthly limit") and an over-limit state with a calm path to upgrade.
- The reset date for the period.

STATES: comfortable usage, near-limit (calm warning), and at-limit. Transparent and non-punitive. Light theme.
```

---

# Transversais

## Settings

A distinção entre os dois idiomas (aprendido vs explicação) e o campo de chave BYOK são os pontos sensíveis.

```text
Create the Settings screen for Fuchine — account and app configuration. Apply the Fuchine Style Block; uses the app shell (Settings active in the sidebar). All UI text in English.

Organize into calm sections:
- LANGUAGES: "Learning language" (Japanese — with room for future languages) and "Explanation language" (the language explanations and translations appear in — e.g. English, Português). Make the distinction between the two clear and well-labeled.
- AI / API KEY (BYOK): a field to enter the user's own LLM API key, shown masked, with provider selection (Anthropic / OpenAI / Gemini / local) and a short "how to get a key" link. Make clear the key is stored securely and never shared. (In the hosted/cloud version this section is replaced by managed AI — but show the self-host BYOK version here.)
- STUDY GOALS: daily goals — new cards per day, review minutes per day, watch minutes per day — as calm steppers/inputs.
- APPEARANCE: theme (light / dark / system) and furigana default on/off.
- ACCOUNT: email, change password, sign out, and a quiet danger zone (delete account).

Each section is well-spaced and quiet, with clear labels and helper text. A calm, trustworthy settings page — clear, not cramped. Light theme.
```

## Empty / error states (pattern sheet)

Não é uma tela só — é um conjunto de padrões reutilizáveis. Gere como uma folha de padrões.

```text
Create a set of EMPTY and ERROR state PATTERNS for Fuchine — reusable across the app in a consistent calm style. Apply the Fuchine Style Block. Present them together as a pattern sheet (several small frames). All UI text in English.

Design these states, each calm and helpful (never alarming or blank):
- Empty library / no videos: a friendly welcome with a paste-a-link prompt to import the first video.
- Import failed: calm red accent, a short readable reason, and a "Try again" action.
- Video has no Japanese subtitles: a friendly explanation and a suggestion to try another video (auto-transcription noted as a future option).
- No cards due / nothing to review: a calm "All caught up" with a suggestion to watch something.
- No saved phrases yet: an invitation to mine sentences while watching.
- No API key configured (self-host): a clear, non-blocking notice explaining how to add a key in Settings, noting that dictionary and tokenization still work without it.
- Generic error / something went wrong: calm, with a retry and a way back.
- Offline / connection lost: a quiet banner or state.

Each pattern: a small, restrained on-brand illustration or icon (consider subtle water/depth motifs fitting the 淵 name, kept quiet), a short message, and a clear next action. Consistent spacing and tone. Empty and error states should feel as calm and considered as the rest of the app — guiding, not scolding. Light theme.
```

---

## Ordem sugerida de geração

Seguindo o caminho crítico, deixando estados vazios/erro por último:

1. Player · word clicked → 2. Player · AI explanation → 3. Player · mined sentence *(os três na conversa do player)*
4. Review · question → 5. Review · answer → 6. Session summary
7. Settings
8. Dictionary → 9. Phrases → 10. Albums → 11. Stats → 12. Extension popup
13. Shadowing → 14. Listening quiz
15. Plans/Billing → 16. Usage & quota *(só se for fazer a cloud)*
17. Empty / error states (como folha de padrões, depois que as telas existirem)
