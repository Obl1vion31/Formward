DROP INDEX "foods_owner_identity_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "foods_owner_identity_idx" ON "foods" USING btree ("user_id","identity_key") WHERE "foods"."deleted_at" IS NULL;