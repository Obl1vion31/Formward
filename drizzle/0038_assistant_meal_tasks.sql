ALTER TABLE "assistant_conversations" ADD COLUMN "purpose" text DEFAULT 'chat' NOT NULL;--> statement-breakpoint
ALTER TABLE "assistant_conversations" ADD COLUMN "context" jsonb;