CREATE TABLE "video_word_counts" (
	"video_id" uuid NOT NULL,
	"word_entry_id" uuid NOT NULL,
	"occurrences" integer NOT NULL,
	CONSTRAINT "video_word_counts_video_id_word_entry_id_pk" PRIMARY KEY("video_id","word_entry_id")
);
--> statement-breakpoint
ALTER TABLE "user_word_stats" ADD COLUMN "last_clicked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "user_word_stats" ADD COLUMN "last_review_ok" boolean;--> statement-breakpoint
ALTER TABLE "user_word_stats" ADD COLUMN "last_reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "user_word_stats" ADD COLUMN "first_review_tier" text;--> statement-breakpoint
ALTER TABLE "user_word_stats" ADD COLUMN "first_review_ok" boolean;--> statement-breakpoint
ALTER TABLE "video_word_counts" ADD CONSTRAINT "video_word_counts_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_word_counts" ADD CONSTRAINT "video_word_counts_word_entry_id_word_entries_id_fk" FOREIGN KEY ("word_entry_id") REFERENCES "public"."word_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "video_word_counts_word_idx" ON "video_word_counts" USING btree ("word_entry_id");--> statement-breakpoint
-- Data: seed last_review_ok / last_reviewed_at from the existing review history
-- (most recent log per user and word of the reviewed line; shared tokens —
-- token corrections only exist since 0020 and are not replayed here).
-- first_review_tier cannot be reconstructed (past view counts are not kept)
-- and stays null; the calibration script reports those words separately.
UPDATE "user_word_stats" s SET "last_review_ok" = x.ok, "last_reviewed_at" = x.reviewed_at
FROM (
  SELECT DISTINCT ON (rl.user_id, t->>'wordEntryId')
    rl.user_id, (t->>'wordEntryId')::uuid AS word_entry_id, rl.grade >= 3 AS ok, rl.reviewed_at
  FROM "review_logs" rl
  JOIN "sentence_cards" c ON c.id = rl.card_id
  JOIN "subtitle_lines" l ON l.id = c.subtitle_line_id
  CROSS JOIN LATERAL jsonb_array_elements(l.tokens) t
  WHERE t->>'wordEntryId' IS NOT NULL
  ORDER BY rl.user_id, t->>'wordEntryId', rl.reviewed_at DESC
) x
WHERE s.user_id = x.user_id AND s.word_entry_id = x.word_entry_id;
