ALTER TABLE "activities" ADD COLUMN "calorie_mode" text;--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN "resting_kcal" numeric(14, 4);--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN "active_kcal" numeric(14, 4);--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_calorie_mode_valid" CHECK (("activities"."calorie_mode" IS NULL OR "activities"."calorie_mode" IN ('total','components')) AND ("activities"."resting_kcal" IS NULL OR "activities"."resting_kcal">=0) AND ("activities"."active_kcal" IS NULL OR "activities"."active_kcal">=0));