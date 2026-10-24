CREATE TABLE "meal_days" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"date" date NOT NULL,
	"status" text NOT NULL,
	"content_digest" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"source" text NOT NULL,
	"updated_by" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "meal_days_status_valid" CHECK ("meal_days"."status" IN ('complete','incomplete','unconfirmed')),
	CONSTRAINT "meal_days_version_valid" CHECK ("meal_days"."version">0)
);
--> statement-breakpoint
CREATE TABLE "meal_day_events" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"date" date NOT NULL,
	"request_id" text NOT NULL,
	"request_digest" text NOT NULL,
	"actor_id" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "meal_days" ADD CONSTRAINT "meal_days_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_day_events" ADD CONSTRAINT "meal_day_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "meal_days_owner_date_idx" ON "meal_days" USING btree ("user_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "meal_day_events_owner_request_idx" ON "meal_day_events" USING btree ("user_id","request_id");--> statement-breakpoint
CREATE INDEX "meal_day_events_owner_date_idx" ON "meal_day_events" USING btree ("user_id","date");
