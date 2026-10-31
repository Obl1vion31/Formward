CREATE TABLE "personal_profiles" (
	"user_id" text PRIMARY KEY NOT NULL,
	"height_cm" numeric(6, 2),
	"birth_date" date,
	"onboarding_step" text DEFAULT 'complete' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "personal_profiles_height_valid" CHECK ("personal_profiles"."height_cm" IS NULL OR ("personal_profiles"."height_cm" >= 30 AND "personal_profiles"."height_cm" <= 300)),
	CONSTRAINT "personal_profiles_step_valid" CHECK ("personal_profiles"."onboarding_step" IN ('profile', 'tutorial', 'complete')),
	CONSTRAINT "personal_profiles_version_positive" CHECK ("personal_profiles"."version" > 0)
);
--> statement-breakpoint
ALTER TABLE "personal_profiles" ADD CONSTRAINT "personal_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;