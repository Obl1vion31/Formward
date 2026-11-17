CREATE INDEX "api_usage_global_day_idx" ON "api_daily_usage" USING btree ("date","channel");--> statement-breakpoint
CREATE INDEX "assistant_recognitions_global_day_idx" ON "assistant_recognitions" USING btree ("date","state");--> statement-breakpoint
CREATE INDEX "assistant_usage_global_day_idx" ON "assistant_usage_requests" USING btree ("date","user_id","provider");