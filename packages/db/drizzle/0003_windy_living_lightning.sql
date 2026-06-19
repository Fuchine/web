CREATE TABLE "subtitle_translation_chunks" (
	"video_id" uuid NOT NULL,
	"chunk_idx" integer NOT NULL,
	"status" text DEFAULT 'done' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subtitle_translation_chunks_video_id_chunk_idx_pk" PRIMARY KEY("video_id","chunk_idx")
);
--> statement-breakpoint
ALTER TABLE "subtitle_translation_chunks" ADD CONSTRAINT "subtitle_translation_chunks_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE cascade ON UPDATE no action;