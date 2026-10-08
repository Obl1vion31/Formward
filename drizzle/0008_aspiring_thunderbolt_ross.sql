CREATE TABLE "ai_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"token_hash" text NOT NULL,
	"prefix" text NOT NULL,
	"permission" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "ai_tokens_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "ai_tokens_permission_valid" CHECK ("ai_tokens"."permission" IN ('read', 'write'))
);
--> statement-breakpoint
CREATE TABLE "measurement_operations" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token_id" text NOT NULL,
	"operation_id" text NOT NULL,
	"request_digest" text NOT NULL,
	"snapshot_digest" text NOT NULL,
	"payload" jsonb NOT NULL,
	"preview" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"result" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"confirmed_at" timestamp with time zone,
	CONSTRAINT "measurement_operations_status_valid" CHECK ("measurement_operations"."status" IN ('pending', 'confirmed', 'cancelled'))
);
--> statement-breakpoint
ALTER TABLE "ai_tokens" ADD CONSTRAINT "ai_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "measurement_operations" ADD CONSTRAINT "measurement_operations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "measurement_operations" ADD CONSTRAINT "measurement_operations_token_id_ai_tokens_id_fk" FOREIGN KEY ("token_id") REFERENCES "public"."ai_tokens"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_tokens_user_idx" ON "ai_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "measurement_operations_user_request_idx" ON "measurement_operations" USING btree ("user_id","operation_id");--> statement-breakpoint
CREATE INDEX "measurement_operations_user_created_idx" ON "measurement_operations" USING btree ("user_id","created_at");