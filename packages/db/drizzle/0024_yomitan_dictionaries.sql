CREATE TABLE "dictionaries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"revision" text NOT NULL,
	"format_version" integer NOT NULL,
	"type" text NOT NULL,
	"language" text DEFAULT 'ja' NOT NULL,
	"target_language" text,
	"frequency_mode" text,
	"author" text,
	"attribution" text,
	"url" text,
	"description" text,
	"tag_meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"term_count" integer DEFAULT 0 NOT NULL,
	"frequency_count" integer DEFAULT 0 NOT NULL,
	"pitch_count" integer DEFAULT 0 NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dictionary_terms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dictionary_id" uuid NOT NULL,
	"language" text DEFAULT 'ja' NOT NULL,
	"expression" text NOT NULL,
	"reading" text NOT NULL,
	"definitions" jsonb NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"score" real DEFAULT 0 NOT NULL,
	"sequence" integer
);
--> statement-breakpoint
CREATE TABLE "word_frequency" (
	"dictionary_id" uuid NOT NULL,
	"language" text DEFAULT 'ja' NOT NULL,
	"expression" text NOT NULL,
	"reading" text DEFAULT '' NOT NULL,
	"value" double precision NOT NULL,
	"display_value" text,
	"rank" integer NOT NULL,
	CONSTRAINT "word_frequency_dictionary_id_language_expression_reading_pk" PRIMARY KEY("dictionary_id","language","expression","reading")
);
--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "dictionary_prefs" jsonb;--> statement-breakpoint
ALTER TABLE "word_pitch" ADD COLUMN "dictionary_id" uuid;--> statement-breakpoint
ALTER TABLE "dictionary_terms" ADD CONSTRAINT "dictionary_terms_dictionary_id_dictionaries_id_fk" FOREIGN KEY ("dictionary_id") REFERENCES "public"."dictionaries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "word_frequency" ADD CONSTRAINT "word_frequency_dictionary_id_dictionaries_id_fk" FOREIGN KEY ("dictionary_id") REFERENCES "public"."dictionaries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "dictionaries_title_uq" ON "dictionaries" USING btree ("title");--> statement-breakpoint
CREATE INDEX "dictionary_terms_expression_idx" ON "dictionary_terms" USING btree ("language","expression");--> statement-breakpoint
CREATE INDEX "dictionary_terms_reading_idx" ON "dictionary_terms" USING btree ("language","reading");--> statement-breakpoint
CREATE INDEX "dictionary_terms_dictionary_idx" ON "dictionary_terms" USING btree ("dictionary_id");--> statement-breakpoint
ALTER TABLE "word_pitch" ADD CONSTRAINT "word_pitch_dictionary_id_dictionaries_id_fk" FOREIGN KEY ("dictionary_id") REFERENCES "public"."dictionaries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "word_pitch_dictionary_idx" ON "word_pitch" USING btree ("dictionary_id");