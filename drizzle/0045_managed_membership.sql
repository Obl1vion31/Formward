CREATE TABLE "membership_tiers" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"system_only" boolean DEFAULT false NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"daily_budget_cents" integer,
	"daily_recognition_limit" integer,
	"chat_enabled" boolean DEFAULT false NOT NULL,
	"meal_recognition_enabled" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "membership_tiers_policy_valid" CHECK (length(trim("membership_tiers"."name")) BETWEEN 1 AND 40 AND "membership_tiers"."version" >= 0 AND ("membership_tiers"."daily_budget_cents" IS NULL OR "membership_tiers"."daily_budget_cents" BETWEEN 0 AND 1000) AND ("membership_tiers"."daily_recognition_limit" IS NULL OR "membership_tiers"."daily_recognition_limit" BETWEEN 0 AND 100) AND (NOT "membership_tiers"."chat_enabled" OR "membership_tiers"."daily_budget_cents" IS NOT NULL) AND (NOT "membership_tiers"."is_default" OR ("membership_tiers"."active" AND NOT "membership_tiers"."system_only" AND "membership_tiers"."archived_at" IS NULL)))
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "membership_tier_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "membership_tiers_name_idx" ON "membership_tiers" USING btree (lower("name")) WHERE "membership_tiers"."archived_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "membership_tiers_default_idx" ON "membership_tiers" USING btree ("is_default") WHERE "membership_tiers"."is_default";--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_membership_tier_id_membership_tiers_id_fk" FOREIGN KEY ("membership_tier_id") REFERENCES "public"."membership_tiers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "users_membership_tier_idx" ON "users" USING btree ("membership_tier_id");
--> statement-breakpoint
INSERT INTO "membership_tiers" ("id","name","active","system_only","is_default","daily_budget_cents","daily_recognition_limit","chat_enabled","meal_recognition_enabled") VALUES
 ('free','Free',true,false,true,NULL,4,false,true),
 ('beta','内测版',true,false,false,100,NULL,true,true),
 ('plus','Plus',true,false,false,200,NULL,true,true),
 ('pro','Pro',false,false,false,0,0,false,false),
 ('admin','管理员',true,true,false,200,NULL,true,true);
--> statement-breakpoint
UPDATE "users" SET "membership_tier_id"="membership_tier";
