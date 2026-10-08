-- Ugaahi: Per-merchant payment gateway config
-- Har merchant apna gateway (Razorpay/Cashfree/PayU/PhonePe/Direct UPI)
-- select karke apni keys save karega.

-- 1. Gateway columns merchants table me
ALTER TABLE merchants
  ADD COLUMN IF NOT EXISTS payment_gateway TEXT DEFAULT 'upi_vpa',
  ADD COLUMN IF NOT EXISTS gateway_credentials TEXT,
  ADD COLUMN IF NOT EXISTS gateway_test_mode BOOLEAN DEFAULT true;

-- 2. Valid gateway values ke liye check
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'merchants_payment_gateway_check'
  ) THEN
    ALTER TABLE merchants ADD CONSTRAINT merchants_payment_gateway_check
      CHECK (payment_gateway IN ('razorpay', 'cashfree', 'payu', 'phonepe', 'upi_vpa'));
  END IF;
END $$;

-- 3. Payment links table — gateway-agnostic tracking
CREATE TABLE IF NOT EXISTS payment_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  outstanding_id UUID REFERENCES outstandings(id) ON DELETE SET NULL,
  gateway TEXT NOT NULL,
  gateway_link_id TEXT NOT NULL,
  amount_paise INTEGER NOT NULL,
  currency TEXT DEFAULT 'INR',
  short_url TEXT NOT NULL,
  status TEXT DEFAULT 'created'
    CHECK (status IN ('created', 'active', 'paid', 'expired', 'cancelled')),
  reference_id TEXT,
  expires_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (gateway, gateway_link_id)
);

CREATE INDEX IF NOT EXISTS idx_payment_links_merchant
  ON payment_links (merchant_id, status);
CREATE INDEX IF NOT EXISTS idx_payment_links_outstanding
  ON payment_links (outstanding_id);

COMMENT ON COLUMN merchants.gateway_credentials IS
  'Encrypted JSON: gateway API keys. App layer pe encrypt/decrypt hota hai.';

-- Bank details for non-gateway merchants (WhatsApp fallback)
ALTER TABLE merchants
  ADD COLUMN IF NOT EXISTS account_holder_name TEXT,
  ADD COLUMN IF NOT EXISTS account_number TEXT,
  ADD COLUMN IF NOT EXISTS bank_name TEXT,
  ADD COLUMN IF NOT EXISTS ifsc_code TEXT;

-- Verifications table — Business Background Check
CREATE TABLE IF NOT EXISTS verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  check_type TEXT NOT NULL,
  input TEXT NOT NULL,
  provider TEXT DEFAULT 'mock',
  status TEXT DEFAULT 'success',
  result JSONB,
  cost_paise INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_verifications_merchant
  ON verifications (merchant_id, check_type);
CREATE INDEX IF NOT EXISTS idx_verifications_customer
  ON verifications (customer_id);

-- Merchant profile fields — enhanced onboarding
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS owner_name TEXT;
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS gst_number TEXT;
