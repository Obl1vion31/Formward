CREATE TABLE "account_preferences" (
	"user_id" text PRIMARY KEY NOT NULL,
	"show_body_fat" boolean NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_preferences_version_positive" CHECK ("account_preferences"."version">0)
);
--> statement-breakpoint
ALTER TABLE "account_preferences" ADD CONSTRAINT "account_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;