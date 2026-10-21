CREATE TABLE "energy_defaults" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resting_from" date NOT NULL,
	"resting_kcal" numeric(14, 4),
	"zero_activity_from" date,
	CONSTRAINT "energy_defaults_valid" CHECK (("energy_defaults"."resting_kcal" IS NULL OR "energy_defaults"."resting_kcal">=0) AND "energy_defaults"."version">0)
);
--> statement-breakpoint
ALTER TABLE "energy_days" ADD COLUMN "active_estimated" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "energy_days" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "energy_defaults" ADD CONSTRAINT "energy_defaults_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "energy_defaults_owner_idx" ON "energy_defaults" USING btree ("user_id") WHERE "energy_defaults"."deleted_at" IS NULL;