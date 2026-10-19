-- Customer per-day call limit (merchant manual setting)
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "max_calls_per_day" INTEGER;
