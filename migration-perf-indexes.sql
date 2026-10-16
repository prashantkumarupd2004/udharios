-- migration-perf-indexes.sql — Dashboard performance indexes
-- Run in Supabase SQL Editor (or via prisma migrate).
-- Targets the hot query paths of the admin + merchant dashboards.
-- All statements are IF NOT EXISTS → safe to re-run.

-- outstandings: aging buckets + overdue lists (merchant + status + dueDate ordering)
CREATE INDEX IF NOT EXISTS "outstandings_merchant_status_duedate_idx"
  ON "outstandings" ("merchant_id", "status", "due_date");

-- outstandings: trend "new dues" (merchant + createdAt range)
CREATE INDEX IF NOT EXISTS "outstandings_merchant_created_idx"
  ON "outstandings" ("merchant_id", "created_at");

-- payments: summary week/month aggregates + trend (merchant + paidAt range)
CREATE INDEX IF NOT EXISTS "payments_merchant_paid_idx"
  ON "payments" ("merchant_id", "paid_at");

-- payments: admin 30-day revenue buckets (global paidAt range)
CREATE INDEX IF NOT EXISTS "payments_paid_idx"
  ON "payments" ("paid_at");

-- calls: admin 24h health counts (global createdAt range)
CREATE INDEX IF NOT EXISTS "calls_created_idx"
  ON "calls" ("created_at");

-- merchants: admin "recent merchants" (createdAt desc, take 8)
CREATE INDEX IF NOT EXISTS "merchants_created_idx"
  ON "merchants" ("created_at");

-- access_requests: admin "recent requests" (createdAt desc, take 8)
CREATE INDEX IF NOT EXISTS "access_requests_created_idx"
  ON "access_requests" ("created_at");

-- audit_logs: merchant activity feed (merchant + createdAt desc)
CREATE INDEX IF NOT EXISTS "audit_logs_merchant_created_idx"
  ON "audit_logs" ("merchant_id", "created_at" DESC);

-- promises: summary "open promises" count (merchant + status)
CREATE INDEX IF NOT EXISTS "promises_merchant_status_idx"
  ON "promises" ("merchant_id", "status");

-- disputes: summary "open disputes" count (merchant + status)
CREATE INDEX IF NOT EXISTS "disputes_merchant_status_idx"
  ON "disputes" ("merchant_id", "status");
