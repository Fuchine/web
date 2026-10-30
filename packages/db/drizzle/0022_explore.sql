CREATE TABLE "instance_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_video_coverage" (
	"user_id" uuid NOT NULL,
	"video_id" uuid NOT NULL,
	"tokens" integer NOT NULL,
	"words" integer NOT NULL,
	"confirmed_tokens" integer NOT NULL,
	"likely_tokens" integer NOT NULL,
	"confirmed_words" integer NOT NULL,
	"likely_words" integer NOT NULL,
	"new_common_words" integer NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_video_coverage_user_id_video_id_pk" PRIMARY KEY("user_id","video_id")
);
--> statement-breakpoint
CREATE TABLE "user_video_progress" (
	"user_id" uuid NOT NULL,
	"video_id" uuid NOT NULL,
	"ms_watched" integer DEFAULT 0 NOT NULL,
	"lines_seen" integer DEFAULT 0 NOT NULL,
	"last_watched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_video_progress_user_id_video_id_pk" PRIMARY KEY("user_id","video_id")
);
--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "known_word_params" jsonb;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "fetched_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
-- Data: existing rows were captured at import time (T3.10 metadata freshness).
UPDATE "videos" SET "fetched_at" = "created_at";--> statement-breakpoint
ALTER TABLE "user_video_coverage" ADD CONSTRAINT "user_video_coverage_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_video_coverage" ADD CONSTRAINT "user_video_coverage_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_video_progress" ADD CONSTRAINT "user_video_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_video_progress" ADD CONSTRAINT "user_video_progress_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_video_coverage_video_idx" ON "user_video_coverage" USING btree ("video_id");--> statement-breakpoint
CREATE INDEX "user_video_progress_recent_idx" ON "user_video_progress" USING btree ("user_id","last_watched_at");--> statement-breakpoint
CREATE INDEX "user_video_progress_video_idx" ON "user_video_progress" USING btree ("video_id");--> statement-breakpoint
CREATE INDEX "videos_fetched_at_idx" ON "videos" USING btree ("fetched_at");