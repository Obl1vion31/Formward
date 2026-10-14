CREATE TABLE "meal_images" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"pathname" text NOT NULL,
	"sha256" text NOT NULL,
	"mime_type" text NOT NULL,
	"byte_size" integer NOT NULL,
	"file_name" text NOT NULL,
	"source" text NOT NULL,
	"source_file_id" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "meal_images_size_valid" CHECK ("meal_images"."byte_size">0 AND "meal_images"."byte_size"<=4194304),
	CONSTRAINT "meal_images_type_valid" CHECK ("meal_images"."mime_type" IN ('image/jpeg','image/png','image/webp'))
);
--> statement-breakpoint
CREATE TABLE "meal_image_links" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"image_id" text NOT NULL,
	"meal_id" text,
	"food_id" text,
	"position" integer NOT NULL,
	CONSTRAINT "meal_image_links_target_valid" CHECK (num_nonnulls("meal_image_links"."meal_id","meal_image_links"."food_id")=1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "meal_images_owner_hash_idx" ON "meal_images" USING btree ("user_id","sha256");--> statement-breakpoint
CREATE UNIQUE INDEX "meal_images_owner_id_idx" ON "meal_images" USING btree ("user_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "meal_image_links_meal_idx" ON "meal_image_links" USING btree ("user_id","meal_id","image_id");--> statement-breakpoint
CREATE UNIQUE INDEX "meal_image_links_food_idx" ON "meal_image_links" USING btree ("user_id","food_id","image_id");--> statement-breakpoint
ALTER TABLE "meal_items" ADD COLUMN "amount_decision" text;--> statement-breakpoint
ALTER TABLE "meal_images" ADD CONSTRAINT "meal_images_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_image_links" ADD CONSTRAINT "meal_image_links_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_image_links" ADD CONSTRAINT "meal_image_links_user_id_image_id_meal_images_user_id_id_fk" FOREIGN KEY ("user_id","image_id") REFERENCES "public"."meal_images"("user_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_image_links" ADD CONSTRAINT "meal_image_links_user_id_meal_id_meals_user_id_id_fk" FOREIGN KEY ("user_id","meal_id") REFERENCES "public"."meals"("user_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_image_links" ADD CONSTRAINT "meal_image_links_user_id_food_id_foods_user_id_id_fk" FOREIGN KEY ("user_id","food_id") REFERENCES "public"."foods"("user_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_items" ADD CONSTRAINT "meal_items_amount_decision_valid" CHECK ("meal_items"."amount_decision" IS NULL OR "meal_items"."amount_decision" IN ('provided','estimate_accepted','unknown_accepted'));