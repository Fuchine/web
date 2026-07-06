CREATE TYPE "public"."word_status" AS ENUM('known', 'learning', 'new');--> statement-breakpoint
ALTER TABLE "saved_words" ADD COLUMN "status" "word_status";