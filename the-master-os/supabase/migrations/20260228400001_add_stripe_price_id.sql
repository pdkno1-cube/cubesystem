-- Add stripe_price_id to subscription_plans for Stripe Checkout integration
ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS stripe_price_id TEXT;

COMMENT ON COLUMN subscription_plans.stripe_price_id IS 'Stripe Price ID (price_xxx) — required for Checkout Session creation';
