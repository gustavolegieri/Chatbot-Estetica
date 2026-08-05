
-- Payments table
CREATE TABLE IF NOT EXISTS public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  subscription_id uuid REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  plan_id uuid REFERENCES public.plans(id) ON DELETE SET NULL,
  provider text NOT NULL DEFAULT 'mercadopago',
  provider_payment_id text,
  provider_preapproval_id text,
  status text NOT NULL DEFAULT 'pending',
  amount_cents integer NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'BRL',
  payment_method text,
  raw_payload jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own payments" ON public.payments FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins manage payments" ON public.payments FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE INDEX IF NOT EXISTS idx_payments_user ON public.payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_created ON public.payments(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_status ON public.payments(status);

-- Webhook logs
CREATE TABLE IF NOT EXISTS public.webhook_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  event_type text,
  payload jsonb DEFAULT '{}'::jsonb,
  status text DEFAULT 'received',
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.webhook_logs TO authenticated;
GRANT ALL ON public.webhook_logs TO service_role;

ALTER TABLE public.webhook_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins view webhook logs" ON public.webhook_logs FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- Hide MP keys in site_settings
DROP POLICY IF EXISTS "Anyone can view non-sensitive settings" ON public.site_settings;
CREATE POLICY "Anyone can view non-sensitive settings" ON public.site_settings FOR SELECT USING (
  key <> ALL (ARRAY['stripe_secret_key','stripe_webhook_secret','mp_access_token','mp_public_key','mp_webhook_secret'])
);

-- Seed MP keys
INSERT INTO public.site_settings (key, value) VALUES
  ('mp_access_token', to_jsonb('APP_USR-2307907731439262-020218-c0b5e7bd6f1ba43fdfd7fffaa5d3d2e4-1008081234'::text)),
  ('mp_public_key',   to_jsonb('APP_USR-33b5683d-480c-4a02-829f-1d7e4d5cf368'::text))
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

-- Admin: full users list
CREATE OR REPLACE FUNCTION public.admin_list_users_full()
RETURNS TABLE(
  user_id uuid,
  full_name text,
  email text,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  plan_name text,
  subscription_status text,
  diagnoses_count bigint,
  total_spent_cents bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  RETURN QUERY
  SELECT
    p.user_id,
    p.full_name,
    u.email::text,
    p.created_at,
    u.last_sign_in_at,
    pl.name AS plan_name,
    s.status AS subscription_status,
    (SELECT count(*) FROM public.diagnoses d WHERE d.user_id = p.user_id),
    COALESCE((SELECT sum(amount_cents) FROM public.payments py WHERE py.user_id = p.user_id AND py.status IN ('approved','paid')),0)
  FROM public.profiles p
  LEFT JOIN auth.users u ON u.id = p.user_id
  LEFT JOIN LATERAL (
    SELECT * FROM public.subscriptions s2 WHERE s2.user_id = p.user_id ORDER BY updated_at DESC NULLS LAST LIMIT 1
  ) s ON true
  LEFT JOIN public.plans pl ON pl.id = s.plan_id
  ORDER BY p.created_at DESC;
END;
$$;

-- Admin: financial stats
CREATE OR REPLACE FUNCTION public.admin_financial_stats()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE r jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  SELECT jsonb_build_object(
    'mrr_cents', COALESCE((SELECT sum(pl.price_cents) FROM public.subscriptions s JOIN public.plans pl ON pl.id = s.plan_id WHERE s.status = 'active' AND pl.interval = 'monthly'),0),
    'arr_cents', COALESCE((SELECT sum(pl.price_cents) FROM public.subscriptions s JOIN public.plans pl ON pl.id = s.plan_id WHERE s.status = 'active' AND pl.interval = 'monthly'),0) * 12,
    'total_revenue_cents', COALESCE((SELECT sum(amount_cents) FROM public.payments WHERE status IN ('approved','paid')),0),
    'monthly_revenue_cents', COALESCE((SELECT sum(amount_cents) FROM public.payments WHERE status IN ('approved','paid') AND created_at >= date_trunc('month', now())),0),
    'active_subscriptions', (SELECT count(*) FROM public.subscriptions WHERE status = 'active'),
    'canceled_subscriptions', (SELECT count(*) FROM public.subscriptions WHERE status IN ('canceled','cancelled')),
    'total_users', (SELECT count(*) FROM public.profiles),
    'new_users_month', (SELECT count(*) FROM public.profiles WHERE created_at >= date_trunc('month', now())),
    'approved_payments', (SELECT count(*) FROM public.payments WHERE status IN ('approved','paid')),
    'failed_payments', (SELECT count(*) FROM public.payments WHERE status IN ('rejected','failed')),
    'avg_ticket_cents', COALESCE((SELECT avg(amount_cents)::int FROM public.payments WHERE status IN ('approved','paid')),0),
    'conversion_rate', CASE WHEN (SELECT count(*) FROM public.profiles) > 0 THEN
      round(((SELECT count(*) FROM public.subscriptions WHERE status='active')::numeric / (SELECT count(*) FROM public.profiles)::numeric) * 100, 2)
      ELSE 0 END,
    'subs_by_plan', COALESCE((SELECT jsonb_agg(jsonb_build_object('plan', pl.name, 'count', cnt))
      FROM (SELECT plan_id, count(*) cnt FROM public.subscriptions WHERE status='active' GROUP BY plan_id) x
      JOIN public.plans pl ON pl.id = x.plan_id),'[]'::jsonb)
  ) INTO r;
  RETURN r;
END;
$$;

-- Admin: growth time-series (last 30 days)
CREATE OR REPLACE FUNCTION public.admin_growth_series()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE r jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  WITH days AS (
    SELECT generate_series(date_trunc('day', now()) - interval '29 days', date_trunc('day', now()), interval '1 day')::date AS d
  ),
  users_per_day AS (
    SELECT date_trunc('day', created_at)::date AS d, count(*) AS c
    FROM public.profiles WHERE created_at >= now() - interval '30 days' GROUP BY 1
  ),
  revenue_per_day AS (
    SELECT date_trunc('day', created_at)::date AS d, sum(amount_cents) AS c
    FROM public.payments WHERE status IN ('approved','paid') AND created_at >= now() - interval '30 days' GROUP BY 1
  )
  SELECT jsonb_agg(jsonb_build_object(
    'date', to_char(days.d,'DD/MM'),
    'users', COALESCE(u.c,0),
    'revenue', COALESCE(r2.c,0) / 100.0
  ) ORDER BY days.d)
  INTO r
  FROM days
  LEFT JOIN users_per_day u ON u.d = days.d
  LEFT JOIN revenue_per_day r2 ON r2.d = days.d;

  RETURN COALESCE(r, '[]'::jsonb);
END;
$$;
