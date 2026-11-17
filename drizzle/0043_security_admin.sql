CREATE TABLE "ai_budget_days" (
	"date" date PRIMARY KEY NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_daily_usage" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"date" date NOT NULL,
	"channel" text NOT NULL,
	"operation" text NOT NULL,
	"requests" integer DEFAULT 0 NOT NULL,
	"failures" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "api_usage_valid" CHECK ("api_daily_usage"."requests" >= 0 AND "api_daily_usage"."failures" BETWEEN 0 AND "api_daily_usage"."requests" AND "api_daily_usage"."channel" IN ('http','mcp','doubao'))
);
--> statement-breakpoint
CREATE TABLE "image_quota_leases" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"date" date NOT NULL,
	"bytes" integer NOT NULL,
	"state" text DEFAULT 'reserved' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "image_quota_valid" CHECK ("image_quota_leases"."bytes" BETWEEN 1 AND 20971520 AND "image_quota_leases"."state" IN ('reserved','complete','released'))
);
--> statement-breakpoint
CREATE TABLE "mfa_login_challenges" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"access_version" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "security_events" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"category" text NOT NULL,
	"source_hash" text,
	"request_id" text,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "two_factors" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"secret" text NOT NULL,
	"backup_codes" text NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"failed_verification_count" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	CONSTRAINT "two_factors_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "account_events" ADD COLUMN "details" jsonb;--> statement-breakpoint
ALTER TABLE "ai_tokens" ADD COLUMN "domains" jsonb;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "mfa_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "security_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "mfa_recovery_required" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "two_factor_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "ai_paused" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "ai_daily_budget_cents" integer;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "ai_daily_recognition_limit" integer;--> statement-breakpoint
ALTER TABLE "api_daily_usage" ADD CONSTRAINT "api_daily_usage_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "image_quota_leases" ADD CONSTRAINT "image_quota_leases_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mfa_login_challenges" ADD CONSTRAINT "mfa_login_challenges_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "security_events" ADD CONSTRAINT "security_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "two_factors" ADD CONSTRAINT "two_factors_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "api_usage_day_idx" ON "api_daily_usage" USING btree ("user_id","date","channel","operation");--> statement-breakpoint
CREATE INDEX "image_quota_owner_day_idx" ON "image_quota_leases" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX "mfa_challenges_expiry_idx" ON "mfa_login_challenges" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "security_events_created_idx" ON "security_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "security_events_user_idx" ON "security_events" USING btree ("user_id","created_at");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_ai_policy_valid" CHECK (("users"."ai_daily_budget_cents" IS NULL OR "users"."ai_daily_budget_cents" BETWEEN 0 AND 1000) AND ("users"."ai_daily_recognition_limit" IS NULL OR "users"."ai_daily_recognition_limit" BETWEEN 0 AND 100));