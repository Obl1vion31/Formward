CREATE TABLE "assistant_connections" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"provider" text NOT NULL,
	"token_id" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assistant_connections_provider_valid" CHECK (provider IN ('qwen','mimo','glm'))
);
--> statement-breakpoint
CREATE TABLE "assistant_conversations" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"provider" text DEFAULT 'qwen' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sequence" integer DEFAULT 0 NOT NULL,
	"followup" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assistant_conversations_valid" CHECK (sequence >= 0 AND provider IN ('qwen','mimo','glm'))
);
--> statement-breakpoint
CREATE TABLE "assistant_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"conversation_id" text NOT NULL,
	"seq" integer NOT NULL,
	"role" text NOT NULL,
	"text" text DEFAULT '' NOT NULL,
	"provider" text,
	"state" text DEFAULT 'complete' NOT NULL,
	"reply_to_id" text,
	"image_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"references" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assistant_messages_valid" CHECK (seq > 0 AND role IN ('user','assistant') AND (provider IS NULL OR provider IN ('qwen','mimo','glm')) AND state IN ('complete','working','stopped','truncated','error'))
);
--> statement-breakpoint
CREATE TABLE "assistant_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"conversation_id" text NOT NULL,
	"user_message_id" text NOT NULL,
	"assistant_message_id" text NOT NULL,
	"request_id" text NOT NULL,
	"request_digest" text NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"token_id" text,
	"state" text DEFAULT 'running' NOT NULL,
	"tool_results" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"heartbeat_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assistant_runs_valid" CHECK (provider IN ('qwen','mimo','glm') AND state IN ('running','complete','stopped','truncated','error'))
);
--> statement-breakpoint
CREATE TABLE "assistant_usage_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"run_id" text NOT NULL,
	"provider" text NOT NULL,
	"date" date NOT NULL,
	"state" text DEFAULT 'reserved' NOT NULL,
	"reserved_cny" numeric(18, 8) NOT NULL,
	"cost_cny" numeric(18, 8),
	"usage" jsonb,
	"rates" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assistant_usage_valid" CHECK (reserved_cny >= 0 AND (cost_cny IS NULL OR cost_cny >= 0) AND state IN ('reserved','settled','unknown') AND provider IN ('qwen','mimo','glm'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "assistant_connections_owner_provider_idx" ON "assistant_connections" USING btree ("user_id","provider") WHERE "assistant_connections"."enabled"=true;--> statement-breakpoint
CREATE UNIQUE INDEX "assistant_connections_token_idx" ON "assistant_connections" USING btree ("token_id");--> statement-breakpoint
CREATE UNIQUE INDEX "assistant_conversations_owner_id_idx" ON "assistant_conversations" USING btree ("user_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "assistant_conversations_active_idx" ON "assistant_conversations" USING btree ("user_id") WHERE "assistant_conversations"."active"=true;--> statement-breakpoint
CREATE UNIQUE INDEX "assistant_messages_owner_id_idx" ON "assistant_messages" USING btree ("user_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "assistant_messages_sequence_idx" ON "assistant_messages" USING btree ("conversation_id","seq");--> statement-breakpoint
CREATE INDEX "assistant_messages_history_idx" ON "assistant_messages" USING btree ("user_id","conversation_id","seq");--> statement-breakpoint
CREATE UNIQUE INDEX "assistant_runs_owner_request_idx" ON "assistant_runs" USING btree ("user_id","request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "assistant_runs_active_idx" ON "assistant_runs" USING btree ("user_id") WHERE "assistant_runs"."state"='running';--> statement-breakpoint
CREATE UNIQUE INDEX "assistant_runs_owner_id_idx" ON "assistant_runs" USING btree ("user_id","id");--> statement-breakpoint
CREATE INDEX "assistant_runs_message_idx" ON "assistant_runs" USING btree ("user_id","user_message_id");--> statement-breakpoint
CREATE INDEX "assistant_usage_day_idx" ON "assistant_usage_requests" USING btree ("user_id","date");--> statement-breakpoint
ALTER TABLE "assistant_connections" ADD CONSTRAINT "assistant_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistant_connections" ADD CONSTRAINT "assistant_connections_token_id_ai_tokens_id_fk" FOREIGN KEY ("token_id") REFERENCES "public"."ai_tokens"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistant_conversations" ADD CONSTRAINT "assistant_conversations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistant_messages" ADD CONSTRAINT "assistant_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistant_messages" ADD CONSTRAINT "assistant_messages_user_id_conversation_id_assistant_conversations_user_id_id_fk" FOREIGN KEY ("user_id","conversation_id") REFERENCES "public"."assistant_conversations"("user_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistant_runs" ADD CONSTRAINT "assistant_runs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistant_runs" ADD CONSTRAINT "assistant_runs_token_id_ai_tokens_id_fk" FOREIGN KEY ("token_id") REFERENCES "public"."ai_tokens"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistant_runs" ADD CONSTRAINT "assistant_runs_user_id_conversation_id_assistant_conversations_user_id_id_fk" FOREIGN KEY ("user_id","conversation_id") REFERENCES "public"."assistant_conversations"("user_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistant_runs" ADD CONSTRAINT "assistant_runs_user_id_user_message_id_assistant_messages_user_id_id_fk" FOREIGN KEY ("user_id","user_message_id") REFERENCES "public"."assistant_messages"("user_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistant_runs" ADD CONSTRAINT "assistant_runs_user_id_assistant_message_id_assistant_messages_user_id_id_fk" FOREIGN KEY ("user_id","assistant_message_id") REFERENCES "public"."assistant_messages"("user_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistant_usage_requests" ADD CONSTRAINT "assistant_usage_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistant_usage_requests" ADD CONSTRAINT "assistant_usage_requests_user_id_run_id_assistant_runs_user_id_id_fk" FOREIGN KEY ("user_id","run_id") REFERENCES "public"."assistant_runs"("user_id","id") ON DELETE no action ON UPDATE no action;