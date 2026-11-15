CREATE TABLE "assistant_recognitions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"conversation_id" text NOT NULL,
	"input_digest" text NOT NULL,
	"date" date NOT NULL,
	"state" text DEFAULT 'prepared' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assistant_recognitions_state_valid" CHECK ("assistant_recognitions"."state" IN ('prepared','reserved','used','refunded'))
);
--> statement-breakpoint
ALTER TABLE "assistant_connections" DROP CONSTRAINT "assistant_connections_provider_valid";--> statement-breakpoint
DROP INDEX "assistant_connections_owner_provider_idx";--> statement-breakpoint
ALTER TABLE "assistant_connections" ADD COLUMN "purpose" text DEFAULT 'chat' NOT NULL;--> statement-breakpoint
ALTER TABLE "assistant_messages" ADD COLUMN "supplemental_answer" jsonb;--> statement-breakpoint
ALTER TABLE "assistant_runs" ADD COLUMN "recognition_id" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "membership_tier" text DEFAULT 'free' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "entitlement_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "assistant_recognitions" ADD CONSTRAINT "assistant_recognitions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistant_recognitions" ADD CONSTRAINT "assistant_recognitions_user_id_conversation_id_assistant_conversations_user_id_id_fk" FOREIGN KEY ("user_id","conversation_id") REFERENCES "public"."assistant_conversations"("user_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "assistant_recognitions_owner_id_idx" ON "assistant_recognitions" USING btree ("user_id","id");--> statement-breakpoint
CREATE INDEX "assistant_recognitions_day_idx" ON "assistant_recognitions" USING btree ("user_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "assistant_connections_owner_provider_idx" ON "assistant_connections" USING btree ("user_id","provider","purpose") WHERE "assistant_connections"."enabled"=true;--> statement-breakpoint
ALTER TABLE "assistant_connections" ADD CONSTRAINT "assistant_connections_provider_valid" CHECK (provider IN ('qwen','mimo','glm') AND purpose IN ('chat','meal_entry'));--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_membership_valid" CHECK ("users"."membership_tier" IN ('free','beta','plus','pro') AND "users"."entitlement_version" >= 0);