CREATE TABLE "measurements" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"source_local_time" text NOT NULL,
	"local_date" date NOT NULL,
	"occurred_at" timestamp with time zone,
	"timezone" text,
	"utc_offset_minutes" integer,
	"time_precision" text DEFAULT 'second' NOT NULL,
	"analysis_date" date NOT NULL,
	"period" text NOT NULL,
	"assignment_method" text NOT NULL,
	"assignment_rule_version" text NOT NULL,
	"fasting" boolean,
	"fasting_source" text,
	"weight_kg" numeric(7, 2) NOT NULL,
	"bmi" numeric(7, 2),
	"body_fat_percent" numeric(5, 2),
	"source_type" text NOT NULL,
	"source_system" text,
	"source_record_id" text,
	"import_id" text,
	"source_row" integer,
	"original_values" jsonb NOT NULL,
	"deduplication_key" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "measurements_weight_valid" CHECK ("measurements"."weight_kg" > 0),
	CONSTRAINT "measurements_bmi_valid" CHECK ("measurements"."bmi" IS NULL OR "measurements"."bmi" > 0),
	CONSTRAINT "measurements_body_fat_valid" CHECK ("measurements"."body_fat_percent" IS NULL OR "measurements"."body_fat_percent" BETWEEN 0 AND 100),
	CONSTRAINT "measurements_period_valid" CHECK ("measurements"."period" IN ('daytime', 'evening')),
	CONSTRAINT "measurements_instant_has_timezone" CHECK ("measurements"."occurred_at" IS NULL OR "measurements"."timezone" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "measurement_events" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"measurement_id" text NOT NULL,
	"action" text NOT NULL,
	"actor_type" text NOT NULL,
	"actor_id" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "measurement_imports" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"file_digest" text NOT NULL,
	"source_label" text NOT NULL,
	"capture_channel" text NOT NULL,
	"status" text DEFAULT 'completed' NOT NULL,
	"inserted_count" integer NOT NULL,
	"skipped_count" integer NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "measurements" ADD CONSTRAINT "measurements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "measurements" ADD CONSTRAINT "measurements_import_id_measurement_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."measurement_imports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "measurement_events" ADD CONSTRAINT "measurement_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "measurement_events" ADD CONSTRAINT "measurement_events_measurement_id_measurements_id_fk" FOREIGN KEY ("measurement_id") REFERENCES "public"."measurements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "measurement_imports" ADD CONSTRAINT "measurement_imports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "measurements_user_dedup_idx" ON "measurements" USING btree ("user_id","deduplication_key");--> statement-breakpoint
CREATE INDEX "measurements_user_analysis_date_idx" ON "measurements" USING btree ("user_id","analysis_date");--> statement-breakpoint
CREATE INDEX "measurement_events_user_record_idx" ON "measurement_events" USING btree ("user_id","measurement_id");--> statement-breakpoint
CREATE UNIQUE INDEX "measurement_imports_user_digest_idx" ON "measurement_imports" USING btree ("user_id","file_digest");