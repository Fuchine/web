CREATE TABLE "saved_words" (
	"user_id" uuid NOT NULL,
	"word_entry_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "saved_words_user_id_word_entry_id_pk" PRIMARY KEY("user_id","word_entry_id")
);
--> statement-breakpoint
ALTER TABLE "saved_words" ADD CONSTRAINT "saved_words_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_words" ADD CONSTRAINT "saved_words_word_entry_id_word_entries_id_fk" FOREIGN KEY ("word_entry_id") REFERENCES "public"."word_entries"("id") ON DELETE cascade ON UPDATE no action;