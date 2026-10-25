ALTER TABLE "activities" ADD COLUMN "inclusion" text;--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN "inclusion_basis" text;--> statement-breakpoint
ALTER TABLE "foods" ADD COLUMN "serving_quantity" numeric(14, 4);--> statement-breakpoint
ALTER TABLE "foods" ADD COLUMN "serving_unit" text;--> statement-breakpoint
ALTER TABLE "meal_items" ADD COLUMN "nutrition_basis" text DEFAULT 'consumed_total' NOT NULL;--> statement-breakpoint
ALTER TABLE "meal_items" ADD COLUMN "per_portion_nutrition" jsonb;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_inclusion_valid" CHECK (("activities"."inclusion" IS NULL AND "activities"."inclusion_basis" IS NULL) OR ("activities"."inclusion" IS NOT NULL AND "activities"."inclusion" IN ('included','additional') AND "activities"."inclusion_basis" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "foods" ADD CONSTRAINT "foods_serving_valid" CHECK (("foods"."serving_quantity" IS NULL AND "foods"."serving_unit" IS NULL) OR ("foods"."serving_quantity" IS NOT NULL AND "foods"."serving_unit" IS NOT NULL AND "foods"."serving_quantity">0 AND lower(trim("foods"."serving_unit"))<>lower(trim("foods"."unit")) AND length(trim("foods"."serving_unit"))>0));--> statement-breakpoint
ALTER TABLE "meal_items" ADD CONSTRAINT "meal_items_basis_valid" CHECK ("meal_items"."nutrition_basis" IN ('consumed_total','per_portion') AND ("meal_items"."nutrition_basis"<>'per_portion' OR "meal_items"."per_portion_nutrition" IS NOT NULL));