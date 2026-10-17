CREATE TABLE "record_operations" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"operation_id" text NOT NULL,
	"measurement_revision" integer,
	"meal_revision" integer,
	"request_digest" text NOT NULL,
	"payload" jsonb NOT NULL,
	"draft" jsonb NOT NULL,
	"measurement_operation_id" text,
	"meal_operation_id" text,
	"revision" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmed_at" timestamp with time zone,
	CONSTRAINT "record_operations_status_valid" CHECK ("record_operations"."status" IN ('pending','confirmed','cancelled','completed'))
);
--> statement-breakpoint
ALTER TABLE "record_operations" ADD CONSTRAINT "record_operations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "record_operations" ADD CONSTRAINT "record_operations_measurement_operation_id_measurement_operations_id_fk" FOREIGN KEY ("measurement_operation_id") REFERENCES "public"."measurement_operations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "record_operations" ADD CONSTRAINT "record_operations_meal_operation_id_meal_operations_id_fk" FOREIGN KEY ("meal_operation_id") REFERENCES "public"."meal_operations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "record_operations_owner_request_idx" ON "record_operations" USING btree ("user_id","operation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "record_operations_measurement_idx" ON "record_operations" USING btree ("measurement_operation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "record_operations_meal_idx" ON "record_operations" USING btree ("meal_operation_id");--> statement-breakpoint
CREATE INDEX "record_operations_owner_created_idx" ON "record_operations" USING btree ("user_id","created_at");