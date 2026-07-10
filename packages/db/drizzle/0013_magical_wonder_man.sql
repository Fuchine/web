ALTER TABLE "word_entries" ADD COLUMN "glosses_text" text;--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
-- Backfill existing rows from `definitions` (space-join every sense's glosses),
-- so the meaning search works without a re-seed. New/updated rows are populated
-- by the seed. One-time correlated update over the dictionary.
UPDATE "word_entries" w SET "glosses_text" = (
  SELECT string_agg(g, ' ')
  FROM jsonb_array_elements(w."definitions") AS s,
       jsonb_array_elements_text(s->'glosses') AS g
);--> statement-breakpoint
CREATE INDEX "word_entries_glosses_trgm_idx" ON "word_entries" USING gin ("glosses_text" gin_trgm_ops);
