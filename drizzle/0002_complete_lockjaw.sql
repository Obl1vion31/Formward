ALTER TABLE "measurements" ADD COLUMN "record_kind" text DEFAULT 'observed' NOT NULL;--> statement-breakpoint
ALTER TABLE "measurements" ADD COLUMN "entry_channel" text;--> statement-breakpoint
ALTER TABLE "measurements" ADD COLUMN "device_name" text;--> statement-breakpoint
ALTER TABLE "measurements" ADD COLUMN "companion_app" text;--> statement-breakpoint
ALTER TABLE "measurements" ADD COLUMN "estimation" jsonb;--> statement-breakpoint
CREATE UNIQUE INDEX "measurements_active_estimate_idx" ON "measurements" USING btree ("user_id","analysis_date","period") WHERE "measurements"."record_kind" = 'estimated' AND "measurements"."deleted_at" IS NULL;--> statement-breakpoint
ALTER TABLE "measurements" ADD CONSTRAINT "measurements_kind_valid" CHECK ("measurements"."record_kind" IN ('observed', 'estimated'));--> statement-breakpoint
ALTER TABLE "measurements" ADD CONSTRAINT "measurements_channel_valid" CHECK ("measurements"."entry_channel" IS NULL OR "measurements"."entry_channel" IN ('api', 'manual', 'development_backend'));--> statement-breakpoint
ALTER TABLE "measurements" ADD CONSTRAINT "measurements_estimation_valid" CHECK (("measurements"."record_kind" = 'estimated' AND "measurements"."estimation" IS NOT NULL AND "measurements"."occurred_at" IS NULL) OR ("measurements"."record_kind" = 'observed' AND "measurements"."estimation" IS NULL));--> statement-breakpoint
ALTER TABLE "measurements" ADD CONSTRAINT "measurements_assumed_time_valid" CHECK ("measurements"."time_precision" NOT IN ('assumed', 'day_period') OR "measurements"."occurred_at" IS NULL);