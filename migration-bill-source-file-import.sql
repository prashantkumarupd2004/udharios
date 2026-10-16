-- migration-bill-source-file-import.sql — Universal Bill Import ke liye naya BillSource
-- Run in Supabase SQL Editor (ya prisma migrate ke through).
-- Safe to re-run (DO block check karta hai).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'BillSource' AND e.enumlabel = 'file_import'
  ) THEN
    ALTER TYPE "BillSource" ADD VALUE 'file_import';
  END IF;
END $$;
