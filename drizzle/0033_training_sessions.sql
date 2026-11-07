CREATE TABLE "training_events" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"operation_id" text NOT NULL,
	"request_digest" text NOT NULL,
	"entity_id" text NOT NULL,
	"action" text NOT NULL,
	"origin" text DEFAULT 'manual' NOT NULL,
	"actor_id" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "training_plans" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"template_id" text NOT NULL,
	"local_date" date NOT NULL,
	"content" jsonb NOT NULL,
	"status" text DEFAULT 'planned' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "training_plans_valid" CHECK (version > 0 AND status IN ('planned','completed','skipped') AND jsonb_typeof(content) = 'object')
);
--> statement-breakpoint
CREATE TABLE "training_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"local_date" date NOT NULL,
	"timezone" text NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"exercises" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"elapsed_seconds" integer DEFAULT 0 NOT NULL,
	"plan_id" text,
	"started_at" timestamp with time zone NOT NULL,
	"resumed_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"source_system" text DEFAULT 'formward' NOT NULL,
	"source_unit" text DEFAULT 'kg' NOT NULL,
	"sync_status" text DEFAULT 'confirmed' NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "training_sessions_valid" CHECK (version > 0 AND elapsed_seconds >= 0 AND length(trim(name)) > 0 AND status IN ('active','paused','completed','discarded') AND jsonb_typeof(exercises) = 'array' AND source_unit = 'kg' AND sync_status = 'confirmed'),
	CONSTRAINT "training_sessions_clock_valid" CHECK ((status = 'active' AND resumed_at IS NOT NULL AND ended_at IS NULL) OR (status = 'paused' AND resumed_at IS NULL AND ended_at IS NULL) OR (status IN ('completed','discarded') AND resumed_at IS NULL AND ended_at IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "training_templates" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"content" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "training_templates_valid" CHECK (version > 0 AND jsonb_typeof(content) = 'object')
);
--> statement-breakpoint
CREATE UNIQUE INDEX "training_events_owner_request_idx" ON "training_events" USING btree ("user_id","operation_id");--> statement-breakpoint
CREATE INDEX "training_events_owner_entity_idx" ON "training_events" USING btree ("user_id","entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "training_plans_owner_id_idx" ON "training_plans" USING btree ("user_id","id");--> statement-breakpoint
CREATE INDEX "training_plans_owner_date_idx" ON "training_plans" USING btree ("user_id","local_date");--> statement-breakpoint
CREATE UNIQUE INDEX "training_plans_scheduled_idx" ON "training_plans" USING btree ("user_id","template_id","local_date") WHERE status = 'planned';--> statement-breakpoint
CREATE UNIQUE INDEX "training_sessions_owner_id_idx" ON "training_sessions" USING btree ("user_id","id");--> statement-breakpoint
CREATE INDEX "training_sessions_owner_date_idx" ON "training_sessions" USING btree ("user_id","local_date");--> statement-breakpoint
CREATE UNIQUE INDEX "training_sessions_open_idx" ON "training_sessions" USING btree ("user_id") WHERE status IN ('active','paused');--> statement-breakpoint
CREATE UNIQUE INDEX "training_templates_owner_id_idx" ON "training_templates" USING btree ("user_id","id");--> statement-breakpoint
ALTER TABLE "training_events" ADD CONSTRAINT "training_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_events" ADD CONSTRAINT "training_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_plans" ADD CONSTRAINT "training_plans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_plans" ADD CONSTRAINT "training_plans_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_plans" ADD CONSTRAINT "training_plans_user_id_template_id_training_templates_user_id_id_fk" FOREIGN KEY ("user_id","template_id") REFERENCES "public"."training_templates"("user_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_sessions" ADD CONSTRAINT "training_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_sessions" ADD CONSTRAINT "training_sessions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_sessions" ADD CONSTRAINT "training_sessions_user_id_plan_id_training_plans_user_id_id_fk" FOREIGN KEY ("user_id","plan_id") REFERENCES "public"."training_plans"("user_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_templates" ADD CONSTRAINT "training_templates_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_templates" ADD CONSTRAINT "training_templates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;