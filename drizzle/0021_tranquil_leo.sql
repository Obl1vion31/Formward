ALTER TABLE "energy_days" ADD COLUMN "entry_mode" text;--> statement-breakpoint
ALTER TABLE "energy_days" ADD COLUMN "activity_mode" text;--> statement-breakpoint
ALTER TABLE "energy_days" ADD COLUMN "resting_source_system" text;--> statement-breakpoint
ALTER TABLE "energy_days" ADD COLUMN "active_source_system" text;--> statement-breakpoint
ALTER TABLE "energy_days" ADD COLUMN "resting_estimated" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "energy_days" ADD CONSTRAINT "energy_days_modes_valid" CHECK ("energy_days"."entry_mode" IN ('components','total') AND "energy_days"."activity_mode" IN ('total','activities'));