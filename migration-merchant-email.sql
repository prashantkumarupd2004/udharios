-- Add email column to merchants for Google OAuth login matching
-- Run this in Supabase SQL Editor

ALTER TABLE "merchants" ADD COLUMN "email" TEXT;

-- Unique index (allows multiple NULLs in Postgres)
CREATE UNIQUE INDEX "merchants_email_key" ON "merchants"("email");
