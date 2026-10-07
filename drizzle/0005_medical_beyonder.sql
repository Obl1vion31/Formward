CREATE TABLE "measurement_days" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"analysis_date" date NOT NULL,
	"reminder_skipped_at" timestamp with time zone,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "measurements" DROP CONSTRAINT "measurements_metric_presence";--> statement-breakpoint
ALTER TABLE "measurement_imports" ADD COLUMN "request_digest" text;--> statement-breakpoint
ALTER TABLE "measurement_days" ADD CONSTRAINT "measurement_days_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "measurement_days_user_date_idx" ON "measurement_days" USING btree ("user_id","analysis_date");--> statement-breakpoint
ALTER TABLE "measurements" ADD CONSTRAINT "measurements_metric_presence" CHECK ("measurements"."weight_kg" IS NOT NULL OR "measurements"."body_fat_percent" IS NOT NULL);