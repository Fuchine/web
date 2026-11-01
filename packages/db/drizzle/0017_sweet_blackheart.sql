ALTER TABLE "llm_usage" ADD COLUMN "key_source" text DEFAULT 'house' NOT NULL;--> statement-breakpoint
CREATE INDEX "llm_usage_source_time_idx" ON "llm_usage" USING btree ("key_source","created_at");