CREATE TABLE "measurement_sources" (
	"user_id" text NOT NULL,
	"label" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "measurement_sources_label_valid" CHECK (length("measurement_sources"."label") BETWEEN 1 AND 300 AND "measurement_sources"."label" = btrim("measurement_sources"."label"))
);
--> statement-breakpoint
ALTER TABLE "measurements" DROP CONSTRAINT "measurements_bmi_valid";--> statement-breakpoint
ALTER TABLE "measurements" ADD COLUMN "device_label" text;--> statement-breakpoint
ALTER TABLE "measurement_sources" ADD CONSTRAINT "measurement_sources_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "measurement_sources_user_label_idx" ON "measurement_sources" USING btree ("user_id","label");--> statement-breakpoint
CREATE INDEX "measurement_sources_user_last_used_idx" ON "measurement_sources" USING btree ("user_id","last_used_at");--> statement-breakpoint
-- 在旧列删除前合并来源并保存审计；原始输入、旧指纹和既有审计不重写。
WITH previous AS MATERIALIZED (
  SELECT *, to_jsonb(measurements) AS before_snapshot FROM measurements
  WHERE record_kind = 'observed' AND (NULLIF(btrim(device_name), '') IS NOT NULL OR NULLIF(btrim(companion_app), '') IS NOT NULL)
), changed AS (
  UPDATE measurements m SET device_label = concat_ws('-', NULLIF(btrim(p.device_name), ''), NULLIF(btrim(p.companion_app), ''))
  FROM previous p WHERE m.id = p.id RETURNING m.*
)
INSERT INTO measurement_events (id, user_id, measurement_id, action, actor_type, actor_id, snapshot)
SELECT 'source-merge-' || c.id, c.user_id, c.id, 'update', 'development_backend', c.user_id,
  jsonb_build_object('before', p.before_snapshot, 'after', to_jsonb(c) - 'bmi' - 'device_name' - 'companion_app', 'reason', 'schema_device_label_merge')
FROM changed c JOIN previous p ON c.id = p.id;
--> statement-breakpoint
INSERT INTO measurement_sources (user_id, label, created_at, last_used_at)
SELECT user_id, device_label, min(created_at), max(updated_at) FROM measurements
WHERE record_kind = 'observed' AND device_label IS NOT NULL GROUP BY user_id, device_label;
--> statement-breakpoint
ALTER TABLE "measurements" DROP COLUMN "bmi";--> statement-breakpoint
ALTER TABLE "measurements" DROP COLUMN "device_name";--> statement-breakpoint
ALTER TABLE "measurements" DROP COLUMN "companion_app";