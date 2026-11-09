-- 仅退役明确标记为估计的有效行；实测与原始导入不变，审计外键继续有效。
WITH retiring AS MATERIALIZED (
  SELECT * FROM measurements WHERE record_kind = 'estimated' AND deleted_at IS NULL FOR UPDATE
), audited AS (
  INSERT INTO measurement_events (id, user_id, measurement_id, action, actor_type, actor_id, snapshot)
  SELECT 'body-retired-0035-' || md5(id), user_id, id, 'retire', 'system', user_id,
    jsonb_build_object('reason', 'body_estimate_feature_removed', 'migration', '0035_retire_body_estimates',
      'before', to_jsonb(retiring), 'after', to_jsonb(retiring) || jsonb_build_object('deleted_at', CURRENT_TIMESTAMP))
  FROM retiring ON CONFLICT (id) DO NOTHING RETURNING measurement_id
)
UPDATE measurements SET deleted_at = CURRENT_TIMESTAMP
WHERE id IN (SELECT id FROM retiring);
--> statement-breakpoint
DROP INDEX "measurements_active_estimate_idx";--> statement-breakpoint
ALTER TABLE "measurements" ADD CONSTRAINT "measurements_observed_active" CHECK ("measurements"."record_kind" = 'observed' OR "measurements"."deleted_at" IS NOT NULL);