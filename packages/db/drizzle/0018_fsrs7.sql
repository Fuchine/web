ALTER TABLE "review_logs" ALTER COLUMN "elapsed_days" SET DATA TYPE double precision;--> statement-breakpoint
ALTER TABLE "review_logs" ALTER COLUMN "last_elapsed_days" SET DATA TYPE double precision;--> statement-breakpoint
ALTER TABLE "review_logs" ALTER COLUMN "scheduled_days" SET DATA TYPE double precision;--> statement-breakpoint
ALTER TABLE "sentence_cards" ALTER COLUMN "elapsed_days" SET DATA TYPE double precision;--> statement-breakpoint
ALTER TABLE "sentence_cards" ALTER COLUMN "scheduled_days" SET DATA TYPE double precision;--> statement-breakpoint
ALTER TABLE "review_logs" ADD COLUMN "last_review" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "review_logs" ADD COLUMN "stability_fast" double precision;--> statement-breakpoint
ALTER TABLE "review_logs" ADD COLUMN "learning_step" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "review_logs" ADD COLUMN "fsrs_model" text;--> statement-breakpoint
ALTER TABLE "sentence_cards" ADD COLUMN "stability_fast" double precision;--> statement-breakpoint
ALTER TABLE "sentence_cards" ADD COLUMN "learning_step" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "sentence_cards" ADD COLUMN "fsrs_model" text DEFAULT 'fsrs-7' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "fsrs_params" jsonb;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "desired_retention" real;--> statement-breakpoint
-- T3.1 data migration (ts-fsrs v4 / FSRS-5 -> v6 / FSRS-7). New cards get the
-- FSRS-7 new-card fast trace (0). Learned cards keep stability_fast = NULL:
-- when their review history is complete (one review_logs row per rep) the app
-- rebuilds FSRS-7 memory by replaying that history on first touch
-- (apps/web/lib/fsrs.ts); otherwise they stay on FSRS-5, the model that
-- scheduled them, instead of receiving an invented FSRS-7 state.
UPDATE "sentence_cards" SET "stability_fast" = 0 WHERE "state" = 0;--> statement-breakpoint
UPDATE "sentence_cards" c SET "fsrs_model" = 'fsrs-5'
WHERE c."state" <> 0
  AND (
    c."reps" = 0
    OR c."reps" <> (SELECT count(*) FROM "review_logs" l WHERE l."card_id" = c."id")
  );