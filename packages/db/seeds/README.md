# Seeds — JMdict + frequency

Populates `word_entries` (the layer-0 dictionary). Run after `pnpm db:migrate`.

## Quick try (fixture)

A tiny sample is committed so you can exercise the seed without downloading
anything:

```bash
pnpm --filter @fuchine/db seed:fixture
```

## Full dictionary (one command)

Downloads the latest jmdict-simplified English release automatically (cached in
`seeds/data/`, gitignored) and seeds every entry:

```bash
export DATABASE_URL=postgres://fuchine:fuchine@localhost:5432/fuchine
pnpm --filter @fuchine/db seed:jmdict            # ~298k word_entries rows
pnpm --filter @fuchine/db seed:jmdict freq.tsv   # with an optional frequency list
```

## Full dictionary (manual file)

1. **JMdict** — download a [jmdict-simplified](https://github.com/scriptin/jmdict-simplified/releases)
   release (the English build, e.g. `jmdict-eng-3.x.x.json.zip`), unzip it, and
   drop the `.json` in `packages/db/seeds/data/` (gitignored).

2. **Frequency (optional)** — a plain TSV, one entry per line:
   `term<TAB>rank` or `term<TAB>reading<TAB>rank` (lower rank = more frequent).
   Any list works (e.g. a Yomitan frequency dictionary exported to TSV, or a
   corpus frequency list). Without it, `frequency_rank` stays null.

3. **Seed:**

   ```bash
   export DATABASE_URL=postgres://fuchine:fuchine@localhost:5432/fuchine
   pnpm --filter @fuchine/db seed seeds/data/jmdict-eng-3.x.x.json seeds/data/frequency.tsv
   ```

The seed is **idempotent**: it upserts on `(language, lemma, reading)`, so
re-running refreshes definitions without duplicating rows or touching user data.

## Pitch accent (Kanjium)

Populates `word_pitch` (T3.2) from [Kanjium](https://github.com/mifunetoshiro/kanjium)'s
`accents.txt` (CC BY-SA 4.0). Run after the JMdict seed (order doesn't matter
for correctness; the match report is only meaningful once `word_entries` is
seeded):

```bash
pnpm --filter @fuchine/db seed:pitch                 # downloads a pinned revision into seeds/data/
pnpm --filter @fuchine/db seed:pitch my-accents.txt  # a local file
pnpm --filter @fuchine/db seed:pitch:fixture         # the committed 15-line excerpt
```

Idempotent (upserts on `(language, lemma, reading, source)`); prints how many
`word_entries` have pitch. `KANJIUM_REF` overrides the pinned commit.

> Attribution: JMdict/EDICT is the property of the [EDRDG](https://www.edrdg.org/)
> and used under licence; Kanjium is by Uros O., CC BY-SA 4.0. Both are
> recorded in `NOTICE`.
