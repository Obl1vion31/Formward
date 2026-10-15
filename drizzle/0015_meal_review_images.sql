ALTER TABLE "meal_images" DROP CONSTRAINT "meal_images_size_valid";--> statement-breakpoint
ALTER TABLE "meal_items" ADD COLUMN "review_explanation" jsonb;--> statement-breakpoint
ALTER TABLE "meal_images" ADD CONSTRAINT "meal_images_size_valid" CHECK ("meal_images"."byte_size">0 AND "meal_images"."byte_size"<=20971520);