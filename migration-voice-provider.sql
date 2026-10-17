-- migration-voice-provider.sql — Voice call provider toggle (Vobiz primary, Exotel backup)
-- Run in Supabase SQL Editor (or via prisma migrate).
-- Safe to re-run (IF NOT EXISTS).

-- Kaun sa provider voice calls karega: 'exotel' (default) ya 'vobiz'
ALTER TABLE "merchants"
  ADD COLUMN IF NOT EXISTS "voice_provider" TEXT NOT NULL DEFAULT 'exotel';
