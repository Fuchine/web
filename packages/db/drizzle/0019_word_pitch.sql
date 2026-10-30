CREATE TABLE "word_pitch" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"language" text DEFAULT 'ja' NOT NULL,
	"lemma" text NOT NULL,
	"reading" text NOT NULL,
	"positions" integer[] NOT NULL,
	"source" text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "word_pitch_lemma_reading_source_uq" ON "word_pitch" USING btree ("language","lemma","reading","source");