CREATE TYPE "public"."video_flag" AS ENUM('saved', 'hidden', 'not_interested');--> statement-breakpoint
CREATE TABLE "user_video_flags" (
	"user_id" uuid NOT NULL,
	"video_id" uuid NOT NULL,
	"flag" "video_flag" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_video_flags_user_id_video_id_flag_pk" PRIMARY KEY("user_id","video_id","flag")
);
--> statement-breakpoint
ALTER TABLE "user_video_flags" ADD CONSTRAINT "user_video_flags_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_video_flags" ADD CONSTRAINT "user_video_flags_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_video_flags_video_idx" ON "user_video_flags" USING btree ("video_id");