CREATE TABLE "token_overrides" (
	"user_id" uuid NOT NULL,
	"subtitle_line_id" uuid NOT NULL,
	"start_idx" integer NOT NULL,
	"end_idx" integer NOT NULL,
	"tokens" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "token_overrides_user_id_subtitle_line_id_start_idx_pk" PRIMARY KEY("user_id","subtitle_line_id","start_idx"),
	CONSTRAINT "token_overrides_span_ck" CHECK ("token_overrides"."start_idx" >= 0 and "token_overrides"."end_idx" >= "token_overrides"."start_idx")
);
--> statement-breakpoint
ALTER TABLE "token_overrides" ADD CONSTRAINT "token_overrides_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "token_overrides" ADD CONSTRAINT "token_overrides_subtitle_line_id_subtitle_lines_id_fk" FOREIGN KEY ("subtitle_line_id") REFERENCES "public"."subtitle_lines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "token_overrides_line_idx" ON "token_overrides" USING btree ("subtitle_line_id");