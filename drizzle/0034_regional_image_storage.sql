ALTER TABLE "meal_images" ADD COLUMN "storage_provider" text DEFAULT 'blob' NOT NULL;--> statement-breakpoint
ALTER TABLE "meal_images" ADD COLUMN "storage_location" text DEFAULT 'legacy' NOT NULL;