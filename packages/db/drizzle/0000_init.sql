CREATE TYPE "public"."content_level" AS ENUM('beginner', 'intermediate', 'advanced');--> statement-breakpoint
CREATE TYPE "public"."user_plan" AS ENUM('free', 'pro');--> statement-breakpoint
CREATE TYPE "public"."video_source" AS ENUM('youtube');--> statement-breakpoint
CREATE TYPE "public"."video_status" AS ENUM('pending', 'processing', 'done', 'failed');--> statement-breakpoint
CREATE TABLE "ai_explanations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subtitle_line_id" uuid NOT NULL,
	"kind" text DEFAULT 'line' NOT NULL,
	"explanation_language" text NOT NULL,
	"prompt_version" integer NOT NULL,
	"model" text,
	"content" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "album_videos" (
	"album_id" uuid NOT NULL,
	"video_id" uuid NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "album_videos_album_id_video_id_pk" PRIMARY KEY("album_id","video_id")
);
--> statement-breakpoint
CREATE TABLE "albums" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"card_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"grade" integer NOT NULL,
	"state" integer NOT NULL,
	"due" timestamp with time zone NOT NULL,
	"stability" double precision NOT NULL,
	"difficulty" double precision NOT NULL,
	"elapsed_days" integer NOT NULL,
	"last_elapsed_days" integer NOT NULL,
	"scheduled_days" integer NOT NULL,
	"reviewed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sentence_cards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"subtitle_line_id" uuid NOT NULL,
	"video_id" uuid NOT NULL,
	"card_type" text DEFAULT 'listening' NOT NULL,
	"notes" text,
	"stability" double precision DEFAULT 0 NOT NULL,
	"difficulty" double precision DEFAULT 0 NOT NULL,
	"due" timestamp with time zone DEFAULT now() NOT NULL,
	"last_review" timestamp with time zone,
	"state" integer DEFAULT 0 NOT NULL,
	"reps" integer DEFAULT 0 NOT NULL,
	"lapses" integer DEFAULT 0 NOT NULL,
	"elapsed_days" integer DEFAULT 0 NOT NULL,
	"scheduled_days" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subtitle_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"video_id" uuid NOT NULL,
	"idx" integer NOT NULL,
	"t_start_ms" integer NOT NULL,
	"t_end_ms" integer NOT NULL,
	"text_original" text NOT NULL,
	"text_translation" text,
	"tokens" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_daily_stats" (
	"user_id" uuid NOT NULL,
	"day" date NOT NULL,
	"ms_watched" integer DEFAULT 0 NOT NULL,
	"lines_seen" integer DEFAULT 0 NOT NULL,
	"cards_created" integer DEFAULT 0 NOT NULL,
	"reviews_done" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "user_daily_stats_user_id_day_pk" PRIMARY KEY("user_id","day")
);
--> statement-breakpoint
CREATE TABLE "user_settings" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"llm_provider" text,
	"api_key_enc" text,
	"learning_language" text DEFAULT 'ja' NOT NULL,
	"explanation_language" text DEFAULT 'en' NOT NULL,
	"daily_goals" jsonb
);
--> statement-breakpoint
CREATE TABLE "user_word_stats" (
	"user_id" uuid NOT NULL,
	"word_entry_id" uuid NOT NULL,
	"views" integer DEFAULT 0 NOT NULL,
	"clicks" integer DEFAULT 0 NOT NULL,
	"reviews_ok" integer DEFAULT 0 NOT NULL,
	"reviews_total" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_word_stats_user_id_word_entry_id_pk" PRIMARY KEY("user_id","word_entry_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"plan" "user_plan" DEFAULT 'free' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "videos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" "video_source" DEFAULT 'youtube' NOT NULL,
	"source_id" text NOT NULL,
	"url" text NOT NULL,
	"title" text NOT NULL,
	"channel" text,
	"duration_s" integer,
	"language" text DEFAULT 'ja' NOT NULL,
	"status" "video_status" DEFAULT 'pending' NOT NULL,
	"level_estimate" "content_level",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "word_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"language" text DEFAULT 'ja' NOT NULL,
	"lemma" text NOT NULL,
	"reading" text,
	"pos" text,
	"definitions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"frequency_rank" integer
);
--> statement-breakpoint
CREATE TABLE "word_examples" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"word_entry_id" uuid NOT NULL,
	"subtitle_line_id" uuid NOT NULL,
	"video_id" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_explanations" ADD CONSTRAINT "ai_explanations_subtitle_line_id_subtitle_lines_id_fk" FOREIGN KEY ("subtitle_line_id") REFERENCES "public"."subtitle_lines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "album_videos" ADD CONSTRAINT "album_videos_album_id_albums_id_fk" FOREIGN KEY ("album_id") REFERENCES "public"."albums"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "album_videos" ADD CONSTRAINT "album_videos_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "albums" ADD CONSTRAINT "albums_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_logs" ADD CONSTRAINT "review_logs_card_id_sentence_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."sentence_cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_logs" ADD CONSTRAINT "review_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sentence_cards" ADD CONSTRAINT "sentence_cards_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sentence_cards" ADD CONSTRAINT "sentence_cards_subtitle_line_id_subtitle_lines_id_fk" FOREIGN KEY ("subtitle_line_id") REFERENCES "public"."subtitle_lines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sentence_cards" ADD CONSTRAINT "sentence_cards_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subtitle_lines" ADD CONSTRAINT "subtitle_lines_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_daily_stats" ADD CONSTRAINT "user_daily_stats_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_word_stats" ADD CONSTRAINT "user_word_stats_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_word_stats" ADD CONSTRAINT "user_word_stats_word_entry_id_word_entries_id_fk" FOREIGN KEY ("word_entry_id") REFERENCES "public"."word_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "word_examples" ADD CONSTRAINT "word_examples_word_entry_id_word_entries_id_fk" FOREIGN KEY ("word_entry_id") REFERENCES "public"."word_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "word_examples" ADD CONSTRAINT "word_examples_subtitle_line_id_subtitle_lines_id_fk" FOREIGN KEY ("subtitle_line_id") REFERENCES "public"."subtitle_lines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "word_examples" ADD CONSTRAINT "word_examples_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_explanations_cache_uq" ON "ai_explanations" USING btree ("subtitle_line_id","kind","explanation_language","prompt_version");--> statement-breakpoint
CREATE INDEX "album_videos_video_idx" ON "album_videos" USING btree ("video_id");--> statement-breakpoint
CREATE INDEX "albums_user_idx" ON "albums" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "review_logs_card_idx" ON "review_logs" USING btree ("card_id");--> statement-breakpoint
CREATE INDEX "review_logs_user_time_idx" ON "review_logs" USING btree ("user_id","reviewed_at");--> statement-breakpoint
CREATE INDEX "sentence_cards_user_due_idx" ON "sentence_cards" USING btree ("user_id","due");--> statement-breakpoint
CREATE INDEX "sentence_cards_user_idx" ON "sentence_cards" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sentence_cards_user_line_type_uq" ON "sentence_cards" USING btree ("user_id","subtitle_line_id","card_type");--> statement-breakpoint
CREATE UNIQUE INDEX "subtitle_lines_video_idx_uq" ON "subtitle_lines" USING btree ("video_id","idx");--> statement-breakpoint
CREATE INDEX "subtitle_lines_video_id_idx" ON "subtitle_lines" USING btree ("video_id");--> statement-breakpoint
CREATE UNIQUE INDEX "videos_source_source_id_uq" ON "videos" USING btree ("source","source_id");--> statement-breakpoint
CREATE INDEX "videos_status_idx" ON "videos" USING btree ("status");--> statement-breakpoint
CREATE INDEX "word_entries_lemma_idx" ON "word_entries" USING btree ("language","lemma");--> statement-breakpoint
CREATE INDEX "word_entries_reading_idx" ON "word_entries" USING btree ("language","reading");--> statement-breakpoint
CREATE INDEX "word_entries_freq_idx" ON "word_entries" USING btree ("language","frequency_rank");--> statement-breakpoint
CREATE INDEX "word_examples_word_idx" ON "word_examples" USING btree ("word_entry_id");--> statement-breakpoint
CREATE UNIQUE INDEX "word_examples_uq" ON "word_examples" USING btree ("word_entry_id","subtitle_line_id");