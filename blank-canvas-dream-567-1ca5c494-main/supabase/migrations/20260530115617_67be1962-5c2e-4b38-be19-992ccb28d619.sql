
-- payment_events table
CREATE TABLE IF NOT EXISTS public.payment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  payment_id uuid REFERENCES public.payments(id) ON DELETE SET NULL,
  subscription_id uuid REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  provider text NOT NULL DEFAULT 'mercadopago',
  provider_event_id text,
  payload jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.payment_events TO authenticated;
GRANT ALL ON public.payment_events TO service_role;

ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own payment events" ON public.payment_events;
CREATE POLICY "Users view own payment events" ON public.payment_events
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins manage payment events" ON public.payment_events;
CREATE POLICY "Admins manage payment events" ON public.payment_events
  FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Extra columns
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS mercadopago_id text;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS next_billing_date timestamptz;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS expires_at timestamptz;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS cancel_at_period_end boolean NOT NULL DEFAULT false;

ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS external_reference text;

-- Update plan prices
UPDATE public.plans SET price_cents = 4900, looks_per_month = 3 WHERE lower(name) LIKE '%essencial%';
UPDATE public.plans SET price_cents = 9700, looks_per_month = 5 WHERE lower(name) LIKE '%premium%';
UPDATE public.plans SET price_cents = 14700, looks_per_month = 7 WHERE lower(name) LIKE '%elite%';

-- Store MP credentials in site_settings (RLS already hides mp_access_token from non-admins)
INSERT INTO public.site_settings (key, value) VALUES
  ('mp_access_token', '"APP_USR-2307907731439262-020218-c0b5e7bd6f1ba43fdfd7fffaa5d3d2e4-1008081234"'::jsonb),
  ('mp_public_key',   '"APP_USR-33b5683d-480c-4a02-829f-1d7e4d5cf368"'::jsonb)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
