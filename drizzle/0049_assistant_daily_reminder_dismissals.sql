CREATE TABLE "assistant_daily_reminder_dismissals" (
	"user_id" text NOT NULL,
	"local_date" date NOT NULL,
	"kind" text NOT NULL,
	"ignored_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assistant_daily_reminder_dismissals_kind_valid" CHECK ("assistant_daily_reminder_dismissals"."kind" IN ('body', 'energy', 'training'))
);
--> statement-breakpoint
ALTER TABLE "assistant_daily_reminder_dismissals" ADD CONSTRAINT "assistant_daily_reminder_dismissals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "assistant_daily_reminder_dismissals_owner_date_kind_idx" ON "assistant_daily_reminder_dismissals" USING btree ("user_id","local_date","kind");