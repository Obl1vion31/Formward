ALTER TABLE "assistant_runs" ADD COLUMN "execution_input" jsonb;--> statement-breakpoint
ALTER TABLE "assistant_runs" ADD COLUMN "claimed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "assistant_runs" ADD COLUMN "worker_id" text;--> statement-breakpoint
ALTER TABLE "assistant_runs" ADD COLUMN "request_diagnostics" jsonb DEFAULT '[]'::jsonb NOT NULL;