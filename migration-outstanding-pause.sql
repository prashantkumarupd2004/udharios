-- migration-outstanding-pause.sql — Per-ledger manual reminder pause
-- Run in Supabase SQL Editor (or via prisma migrate).
-- Safe to re-run (IF NOT EXISTS).

-- Manual pause flag: merchant ne is outstanding ke reminders rok diye hain
ALTER TABLE "outstandings"
  ADD COLUMN IF NOT EXISTS "reminders_paused" BOOLEAN NOT NULL DEFAULT false;

-- Kab pause kiya tha (resume par NULL ho jata hai)
ALTER TABLE "outstandings"
  ADD COLUMN IF NOT EXISTS "paused_at" TIMESTAMP(3);
