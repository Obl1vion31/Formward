ALTER TABLE "measurement_sources" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "measurement_sources" ADD COLUMN "deleted_by" text;--> statement-breakpoint
ALTER TABLE "measurement_sources" ADD CONSTRAINT "measurement_sources_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;