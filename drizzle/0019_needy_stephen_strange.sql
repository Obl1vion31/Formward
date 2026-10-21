CREATE TABLE "activities" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"timezone" text NOT NULL,
	"source_system" text,
	"source_record_id" text,
	"source_occurred_at" timestamp with time zone,
	"source_unit" text DEFAULT 'kcal' NOT NULL,
	"sync_status" text DEFAULT 'confirmed' NOT NULL,
	"local_date" date NOT NULL,
	"name" text NOT NULL,
	"duration_minutes" numeric(14, 4),
	"calories_kcal" numeric(14, 4),
	"completed" boolean DEFAULT true NOT NULL,
	CONSTRAINT "activities_values_valid" CHECK (length(trim("activities"."name"))>0 AND ("activities"."duration_minutes" IS NULL OR "activities"."duration_minutes">=0) AND ("activities"."calories_kcal" IS NULL OR "activities"."calories_kcal">=0) AND "activities"."version">0 AND "activities"."source_unit"='kcal' AND "activities"."sync_status"='confirmed')
);
--> statement-breakpoint
CREATE TABLE "energy_days" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"timezone" text NOT NULL,
	"source_system" text,
	"source_record_id" text,
	"source_occurred_at" timestamp with time zone,
	"source_unit" text DEFAULT 'kcal' NOT NULL,
	"sync_status" text DEFAULT 'confirmed' NOT NULL,
	"local_date" date NOT NULL,
	"resting_kcal" numeric(14, 4),
	"active_kcal" numeric(14, 4),
	"total_kcal" numeric(14, 4),
	CONSTRAINT "energy_days_values_valid" CHECK (("energy_days"."resting_kcal" IS NULL OR "energy_days"."resting_kcal">=0) AND ("energy_days"."active_kcal" IS NULL OR "energy_days"."active_kcal">=0) AND ("energy_days"."total_kcal" IS NULL OR "energy_days"."total_kcal">=0) AND "energy_days"."version">0 AND "energy_days"."source_unit"='kcal' AND "energy_days"."sync_status"='confirmed')
);
--> statement-breakpoint
CREATE TABLE "energy_events" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"operation_id" text NOT NULL,
	"record_id" text NOT NULL,
	"record_type" text NOT NULL,
	"actor_type" text NOT NULL,
	"actor_id" text NOT NULL,
	"confirmed_by" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "energy_operations" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"operation_id" text NOT NULL,
	"origin" text NOT NULL,
	"token_id" text,
	"oauth_connection_id" text,
	"request_digest" text NOT NULL,
	"snapshot_digest" text NOT NULL,
	"payload" jsonb NOT NULL,
	"draft" jsonb NOT NULL,
	"preview" jsonb NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmed_at" timestamp with time zone,
	CONSTRAINT "energy_operations_valid" CHECK ("energy_operations"."origin" IN ('manual','ai') AND "energy_operations"."status" IN ('pending','confirmed','cancelled') AND "energy_operations"."revision">0 AND (("energy_operations"."origin"='manual' AND "energy_operations"."token_id" IS NULL AND "energy_operations"."oauth_connection_id" IS NULL) OR ("energy_operations"."origin"='ai' AND num_nonnulls("energy_operations"."token_id","energy_operations"."oauth_connection_id")=1)))
);
--> statement-breakpoint
CREATE TABLE "energy_profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"effective_from" date NOT NULL,
	"height_cm" numeric(7, 4) NOT NULL,
	"birth_date" date NOT NULL,
	"sex" text NOT NULL,
	CONSTRAINT "energy_profiles_valid" CHECK ("energy_profiles"."height_cm">0 AND "energy_profiles"."height_cm"<=300 AND "energy_profiles"."sex" IN ('male','female') AND "energy_profiles"."birth_date"<"energy_profiles"."effective_from" AND "energy_profiles"."version">0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "energy_operations_owner_id_idx" ON "energy_operations" USING btree ("user_id","id");--> statement-breakpoint
ALTER TABLE "record_operations" ADD COLUMN "energy_revision" integer;--> statement-breakpoint
ALTER TABLE "record_operations" ADD COLUMN "energy_operation_id" text;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "energy_days" ADD CONSTRAINT "energy_days_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "energy_events" ADD CONSTRAINT "energy_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "energy_events" ADD CONSTRAINT "energy_events_confirmed_by_users_id_fk" FOREIGN KEY ("confirmed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "energy_events" ADD CONSTRAINT "energy_events_user_id_operation_id_energy_operations_user_id_id_fk" FOREIGN KEY ("user_id","operation_id") REFERENCES "public"."energy_operations"("user_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "energy_operations" ADD CONSTRAINT "energy_operations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "energy_operations" ADD CONSTRAINT "energy_operations_token_id_ai_tokens_id_fk" FOREIGN KEY ("token_id") REFERENCES "public"."ai_tokens"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "energy_operations" ADD CONSTRAINT "energy_operations_oauth_connection_id_oauth_connections_id_fk" FOREIGN KEY ("oauth_connection_id") REFERENCES "public"."oauth_connections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "energy_profiles" ADD CONSTRAINT "energy_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activities_owner_date_idx" ON "activities" USING btree ("user_id","local_date");--> statement-breakpoint
CREATE UNIQUE INDEX "activities_owner_source_idx" ON "activities" USING btree ("user_id","source_system","source_record_id") WHERE "activities"."source_system" IS NOT NULL AND "activities"."source_record_id" IS NOT NULL AND "activities"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "energy_days_owner_date_idx" ON "energy_days" USING btree ("user_id","local_date") WHERE "energy_days"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "energy_events_owner_record_idx" ON "energy_events" USING btree ("user_id","record_id");--> statement-breakpoint
CREATE UNIQUE INDEX "energy_operations_owner_request_idx" ON "energy_operations" USING btree ("user_id","operation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "energy_profiles_owner_date_idx" ON "energy_profiles" USING btree ("user_id","effective_from") WHERE "energy_profiles"."deleted_at" IS NULL;--> statement-breakpoint
ALTER TABLE "record_operations" ADD CONSTRAINT "record_operations_user_id_energy_operation_id_energy_operations_user_id_id_fk" FOREIGN KEY ("user_id","energy_operation_id") REFERENCES "public"."energy_operations"("user_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "record_operations_energy_idx" ON "record_operations" USING btree ("energy_operation_id");