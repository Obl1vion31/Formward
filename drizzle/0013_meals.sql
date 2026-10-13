CREATE TABLE "foods" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"brand" text,
	"preparation" text,
	"identity_key" text NOT NULL,
	"base_quantity" numeric(14, 4) NOT NULL,
	"unit" text NOT NULL,
	"calories_kcal" numeric(14, 4),
	"protein_g" numeric(14, 4),
	"carbs_g" numeric(14, 4),
	"fat_g" numeric(14, 4),
	"source_kind" text NOT NULL,
	"basis" text,
	"evidence_url" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "foods_quantity_valid" CHECK ("foods"."base_quantity">0),
	CONSTRAINT "foods_nutrition_valid" CHECK (("foods"."calories_kcal" IS NULL OR "foods"."calories_kcal">=0) AND ("foods"."protein_g" IS NULL OR "foods"."protein_g">=0) AND ("foods"."carbs_g" IS NULL OR "foods"."carbs_g">=0) AND ("foods"."fat_g" IS NULL OR "foods"."fat_g">=0)),
	CONSTRAINT "foods_source_valid" CHECK ("foods"."source_kind" IN ('label','composition_table','estimated','unknown'))
);
--> statement-breakpoint
CREATE TABLE "meals" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"local_date" date NOT NULL,
	"meal_type" text NOT NULL,
	"occurred_at" timestamp with time zone,
	"timezone" text,
	"notes" text,
	"source" text NOT NULL,
	"source_system" text,
	"source_record_id" text,
	"sync_status" text DEFAULT 'local' NOT NULL,
	"import_id" text,
	"source_row" integer,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "meals_source_valid" CHECK ("meals"."source" IN ('manual','ai','initialization')),
	CONSTRAINT "meals_time_valid" CHECK ("meals"."occurred_at" IS NULL OR "meals"."timezone" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "meal_events" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"record_id" text NOT NULL,
	"record_type" text NOT NULL,
	"operation_id" text NOT NULL,
	"actor_type" text NOT NULL,
	"actor_id" text NOT NULL,
	"confirmed_by" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meal_imports" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"file_digest" text NOT NULL,
	"source_label" text NOT NULL,
	"original_rows" jsonb NOT NULL,
	"decisions" jsonb NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "meal_items" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"meal_id" text NOT NULL,
	"position" integer NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"quantity" numeric(14, 4),
	"unit" text,
	"food_id" text,
	"food_snapshot" jsonb,
	"calories_kcal" numeric(14, 4),
	"protein_g" numeric(14, 4),
	"carbs_g" numeric(14, 4),
	"fat_g" numeric(14, 4),
	"source_kind" text NOT NULL,
	"basis" text,
	"evidence_url" text,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "meal_items_quantity_valid" CHECK ("meal_items"."quantity" IS NULL OR "meal_items"."quantity">0),
	CONSTRAINT "meal_items_kind_valid" CHECK ("meal_items"."kind" IN ('food','misc','whole')),
	CONSTRAINT "meal_items_nutrition_valid" CHECK (("meal_items"."calories_kcal" IS NULL OR "meal_items"."calories_kcal">=0) AND ("meal_items"."protein_g" IS NULL OR "meal_items"."protein_g">=0) AND ("meal_items"."carbs_g" IS NULL OR "meal_items"."carbs_g">=0) AND ("meal_items"."fat_g" IS NULL OR "meal_items"."fat_g">=0))
);
--> statement-breakpoint
CREATE TABLE "meal_operations" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"operation_id" text NOT NULL,
	"origin" text NOT NULL,
	"token_id" text,
	"oauth_connection_id" text,
	"import_id" text,
	"request_digest" text NOT NULL,
	"snapshot_digest" text NOT NULL,
	"payload" jsonb NOT NULL,
	"draft" jsonb NOT NULL,
	"preview" jsonb NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"result" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"confirmed_at" timestamp with time zone,
	CONSTRAINT "meal_operations_credential_valid" CHECK (("meal_operations"."origin"='ai' AND num_nonnulls("meal_operations"."token_id","meal_operations"."oauth_connection_id")=1 AND "meal_operations"."import_id" IS NULL) OR ("meal_operations"."origin"='manual' AND num_nonnulls("meal_operations"."token_id","meal_operations"."oauth_connection_id","meal_operations"."import_id")=0) OR ("meal_operations"."origin"='initialization' AND num_nonnulls("meal_operations"."token_id","meal_operations"."oauth_connection_id")=0 AND "meal_operations"."import_id" IS NOT NULL)),
	CONSTRAINT "meal_operations_status_valid" CHECK ("meal_operations"."status" IN ('pending','confirmed','cancelled'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "foods_owner_identity_idx" ON "foods" USING btree ("user_id","identity_key");--> statement-breakpoint
CREATE UNIQUE INDEX "foods_owner_id_idx" ON "foods" USING btree ("user_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "meals_owner_id_idx" ON "meals" USING btree ("user_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "meals_owner_source_idx" ON "meals" USING btree ("user_id","source_system","source_record_id");--> statement-breakpoint
CREATE INDEX "meals_owner_date_idx" ON "meals" USING btree ("user_id","local_date");--> statement-breakpoint
CREATE INDEX "meal_events_owner_record_idx" ON "meal_events" USING btree ("user_id","record_id");--> statement-breakpoint
CREATE UNIQUE INDEX "meal_imports_owner_digest_idx" ON "meal_imports" USING btree ("user_id","file_digest");--> statement-breakpoint
CREATE UNIQUE INDEX "meal_imports_owner_id_idx" ON "meal_imports" USING btree ("user_id","id");--> statement-breakpoint
CREATE INDEX "meal_items_owner_meal_idx" ON "meal_items" USING btree ("user_id","meal_id");--> statement-breakpoint
CREATE UNIQUE INDEX "meal_operations_owner_request_idx" ON "meal_operations" USING btree ("user_id","operation_id");--> statement-breakpoint
CREATE INDEX "meal_operations_owner_created_idx" ON "meal_operations" USING btree ("user_id","created_at");--> statement-breakpoint
ALTER TABLE "foods" ADD CONSTRAINT "foods_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meals" ADD CONSTRAINT "meals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meals" ADD CONSTRAINT "meals_user_id_import_id_meal_imports_user_id_id_fk" FOREIGN KEY ("user_id","import_id") REFERENCES "public"."meal_imports"("user_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_events" ADD CONSTRAINT "meal_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_events" ADD CONSTRAINT "meal_events_operation_id_meal_operations_id_fk" FOREIGN KEY ("operation_id") REFERENCES "public"."meal_operations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_imports" ADD CONSTRAINT "meal_imports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_items" ADD CONSTRAINT "meal_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_items" ADD CONSTRAINT "meal_items_user_id_meal_id_meals_user_id_id_fk" FOREIGN KEY ("user_id","meal_id") REFERENCES "public"."meals"("user_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_items" ADD CONSTRAINT "meal_items_user_id_food_id_foods_user_id_id_fk" FOREIGN KEY ("user_id","food_id") REFERENCES "public"."foods"("user_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_operations" ADD CONSTRAINT "meal_operations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_operations" ADD CONSTRAINT "meal_operations_token_id_ai_tokens_id_fk" FOREIGN KEY ("token_id") REFERENCES "public"."ai_tokens"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_operations" ADD CONSTRAINT "meal_operations_oauth_connection_id_oauth_connections_id_fk" FOREIGN KEY ("oauth_connection_id") REFERENCES "public"."oauth_connections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_operations" ADD CONSTRAINT "meal_operations_user_id_import_id_meal_imports_user_id_id_fk" FOREIGN KEY ("user_id","import_id") REFERENCES "public"."meal_imports"("user_id","id") ON DELETE no action ON UPDATE no action;