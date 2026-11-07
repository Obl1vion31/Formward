CREATE TABLE "data_connections" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"provider" text NOT NULL,
	"label" text NOT NULL,
	"credential" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"metrics" jsonb NOT NULL,
	"timezone" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"access_version" integer NOT NULL,
	"adopted_at" timestamp with time zone,
	"sync_token" text,
	"sync_started_at" timestamp with time zone,
	"last_attempt_at" timestamp with time zone,
	"last_success_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "data_connections_valid" CHECK ("data_connections"."status" IN ('active','paused') AND "data_connections"."version">0 AND jsonb_typeof("data_connections"."metrics")='array')
);
--> statement-breakpoint
CREATE TABLE "data_source_conflicts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"fact_id" text NOT NULL,
	"candidates" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"linked_activity_id" text,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "data_source_conflicts_valid" CHECK ("data_source_conflicts"."status" IN ('pending','adopted','linked','ignored') AND "data_source_conflicts"."version">0)
);
--> statement-breakpoint
CREATE TABLE "data_source_events" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"connection_id" text,
	"action" text NOT NULL,
	"actor" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "data_source_facts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"connection_id" text NOT NULL,
	"kind" text NOT NULL,
	"source_record_id" text NOT NULL,
	"local_date" date NOT NULL,
	"occurred_at" timestamp with time zone,
	"timezone" text NOT NULL,
	"unit" text DEFAULT 'kcal' NOT NULL,
	"payload" jsonb NOT NULL,
	"digest" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	CONSTRAINT "data_source_facts_valid" CHECK ("data_source_facts"."kind" IN ('day','activity') AND "data_source_facts"."version">0 AND "data_source_facts"."unit"='kcal')
);
--> statement-breakpoint
CREATE TABLE "data_source_policies" (
	"user_id" text PRIMARY KEY NOT NULL,
	"strategy" text DEFAULT 'total' NOT NULL,
	"sources" jsonb NOT NULL,
	"effective_from" date NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "data_source_policies_valid" CHECK ("data_source_policies"."strategy" IN ('total','components') AND "data_source_policies"."version">0)
);
--> statement-breakpoint
CREATE TABLE "energy_day_adoptions" (
	"user_id" text NOT NULL,
	"local_date" date NOT NULL,
	"mode" text NOT NULL,
	"metadata" jsonb,
	"protected_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "energy_day_adoptions_valid" CHECK ("energy_day_adoptions"."mode" IN ('source','manual') AND "energy_day_adoptions"."version">0 AND ("energy_day_adoptions"."mode"<>'source' OR "energy_day_adoptions"."metadata" IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "data_connections_owner_id_idx" ON "data_connections" USING btree ("user_id","id");
--> statement-breakpoint
CREATE UNIQUE INDEX "data_source_facts_owner_id_idx" ON "data_source_facts" USING btree ("user_id","id");
--> statement-breakpoint
ALTER TABLE "energy_days" ADD COLUMN "steps" integer;--> statement-breakpoint
ALTER TABLE "data_connections" ADD CONSTRAINT "data_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_source_conflicts" ADD CONSTRAINT "data_source_conflicts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_source_conflicts" ADD CONSTRAINT "data_source_conflicts_user_id_fact_id_data_source_facts_user_id_id_fk" FOREIGN KEY ("user_id","fact_id") REFERENCES "public"."data_source_facts"("user_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_source_events" ADD CONSTRAINT "data_source_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_source_events" ADD CONSTRAINT "data_source_events_user_id_connection_id_data_connections_user_id_id_fk" FOREIGN KEY ("user_id","connection_id") REFERENCES "public"."data_connections"("user_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_source_facts" ADD CONSTRAINT "data_source_facts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_source_facts" ADD CONSTRAINT "data_source_facts_user_id_connection_id_data_connections_user_id_id_fk" FOREIGN KEY ("user_id","connection_id") REFERENCES "public"."data_connections"("user_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_source_policies" ADD CONSTRAINT "data_source_policies_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "energy_day_adoptions" ADD CONSTRAINT "energy_day_adoptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "data_connections_owner_provider_idx" ON "data_connections" USING btree ("user_id","provider");--> statement-breakpoint
CREATE UNIQUE INDEX "data_source_conflicts_fact_idx" ON "data_source_conflicts" USING btree ("user_id","fact_id");--> statement-breakpoint
CREATE INDEX "data_source_events_owner_created_idx" ON "data_source_events" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "data_source_facts_source_idx" ON "data_source_facts" USING btree ("connection_id","kind","source_record_id");--> statement-breakpoint
CREATE INDEX "data_source_facts_owner_date_idx" ON "data_source_facts" USING btree ("user_id","local_date");--> statement-breakpoint
CREATE UNIQUE INDEX "energy_day_adoptions_owner_date_idx" ON "energy_day_adoptions" USING btree ("user_id","local_date");--> statement-breakpoint
ALTER TABLE "energy_days" ADD CONSTRAINT "energy_days_steps_valid" CHECK ("energy_days"."steps" IS NULL OR "energy_days"."steps" BETWEEN 0 AND 10000000);