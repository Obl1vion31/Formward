CREATE TABLE "assistant_reminder_dismissals" (
	"user_id" text NOT NULL,
	"local_date" date NOT NULL,
	"ignored_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "assistant_reminder_dismissals" ADD CONSTRAINT "assistant_reminder_dismissals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "assistant_reminder_dismissals_owner_date_idx" ON "assistant_reminder_dismissals" USING btree ("user_id","local_date");