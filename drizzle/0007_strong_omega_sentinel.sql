-- 实际发生日期可从原始当地时间恢复，验证通过后才合并日期列。
DO $$ BEGIN
  LOCK TABLE "measurements" IN ACCESS EXCLUSIVE MODE;
  IF EXISTS (SELECT 1 FROM "measurements" WHERE "local_date"::text IS DISTINCT FROM left("source_local_time", 10)) THEN
    RAISE EXCEPTION '测量实际日期与来源时间不一致，日期迁移已停止';
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "measurements" RENAME COLUMN "analysis_date" TO "record_date";--> statement-breakpoint
ALTER TABLE "measurement_days" RENAME COLUMN "analysis_date" TO "record_date";--> statement-breakpoint
DROP INDEX "measurements_user_analysis_date_idx";--> statement-breakpoint
DROP INDEX "measurements_active_estimate_idx";--> statement-breakpoint
DROP INDEX "measurement_days_user_date_idx";--> statement-breakpoint
CREATE INDEX "measurements_user_record_date_idx" ON "measurements" USING btree ("user_id","record_date");--> statement-breakpoint
CREATE UNIQUE INDEX "measurements_active_estimate_idx" ON "measurements" USING btree ("user_id","record_date","period") WHERE "measurements"."record_kind" = 'estimated' AND "measurements"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "measurement_days_user_date_idx" ON "measurement_days" USING btree ("user_id","record_date");--> statement-breakpoint
ALTER TABLE "measurements" DROP COLUMN "local_date";