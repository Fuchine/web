# Seeds — JMdict + frequency

Populates `word_entries` (the layer-0 dictionary). Run after `pnpm db:migrate`.

## Quick try (fixture)

A tiny sample is committed so you can exercise the seed without downloading
anything:

```bash
pnpm --filter @fuchine/db seed:fixture
```

## Full dictionary

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

> Attribution: JMdict/EDICT is the property of the [EDRDG](https://www.edrdg.org/)
> and used under licence. Record the licence in `NOTICE` at release (T1.10).
