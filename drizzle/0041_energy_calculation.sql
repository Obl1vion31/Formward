ALTER TABLE "account_preferences" ADD COLUMN "energy_resting_method" text DEFAULT 'estimate' NOT NULL;--> statement-breakpoint
ALTER TABLE "account_preferences" ADD COLUMN "energy_formula" text DEFAULT 'auto' NOT NULL;--> statement-breakpoint
ALTER TABLE "energy_days" ADD COLUMN "resting_input_method" text;--> statement-breakpoint
ALTER TABLE "energy_days" ADD COLUMN "calculation_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "personal_profiles" ADD COLUMN "sex_for_calculation" text;--> statement-breakpoint
ALTER TABLE "account_preferences" ADD CONSTRAINT "account_preferences_energy_valid" CHECK ("account_preferences"."energy_resting_method" IN ('manual','device','estimate') AND "account_preferences"."energy_formula" IN ('auto','cunningham','mifflin-st-jeor'));--> statement-breakpoint
ALTER TABLE "energy_days" ADD CONSTRAINT "energy_days_resting_method_valid" CHECK ("energy_days"."resting_input_method" IS NULL OR "energy_days"."resting_input_method" IN ('manual','device','estimate'));--> statement-breakpoint
ALTER TABLE "personal_profiles" ADD CONSTRAINT "personal_profiles_sex_valid" CHECK ("personal_profiles"."sex_for_calculation" IS NULL OR "personal_profiles"."sex_for_calculation" IN ('male','female'));