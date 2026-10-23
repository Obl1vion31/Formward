CREATE TABLE "energy_sources" (
	"user_id" text NOT NULL,
	"label" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by" text,
	CONSTRAINT "energy_sources_label_valid" CHECK (length("energy_sources"."label") BETWEEN 1 AND 200 AND "energy_sources"."label" = btrim("energy_sources"."label"))
);
--> statement-breakpoint
ALTER TABLE "energy_sources" ADD CONSTRAINT "energy_sources_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "energy_sources" ADD CONSTRAINT "energy_sources_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "energy_sources_user_label_idx" ON "energy_sources" USING btree ("user_id","label");--> statement-breakpoint
CREATE INDEX "energy_sources_user_last_used_idx" ON "energy_sources" USING btree ("user_id","last_used_at");
--> statement-breakpoint
INSERT INTO "energy_sources" ("user_id", "label", "created_at", "last_used_at")
SELECT "user_id", btrim("label"), min("created_at"), max("updated_at")
FROM (
  SELECT d."user_id", s."label", d."created_at", d."updated_at"
  FROM "energy_days" d
  CROSS JOIN LATERAL (VALUES (d."source_system"), (d."resting_source_system"), (d."active_source_system")) s("label")
  WHERE d."deleted_at" IS NULL
  UNION ALL
  SELECT "user_id", "source_system", "created_at", "updated_at"
  FROM "activities" WHERE "deleted_at" IS NULL
) sources
WHERE length(btrim("label")) BETWEEN 1 AND 200 AND "label" !~ '[[:cntrl:]]'
GROUP BY "user_id", btrim("label");
