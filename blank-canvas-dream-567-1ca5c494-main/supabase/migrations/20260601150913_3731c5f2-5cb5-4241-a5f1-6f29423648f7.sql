
-- =====================
-- COUPONS
-- =====================
CREATE TABLE IF NOT EXISTS public.coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  description text,
  discount_type text NOT NULL DEFAULT 'percent', -- percent | fixed | free_shipping
  discount_value numeric NOT NULL DEFAULT 0,     -- percent (0-100) or cents
  starts_at timestamptz,
  ends_at timestamptz,
  usage_limit integer,        -- total uses, null = unlimited
  per_user_limit integer DEFAULT 1, -- per user, null = unlimited
  uses_count integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  applies_to_plan_id uuid, -- null = any plan
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.coupons TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.coupons TO authenticated;
GRANT ALL ON public.coupons TO service_role;

ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view active coupons"
ON public.coupons FOR SELECT TO authenticated
USING (is_active = true);

CREATE POLICY "Admins manage coupons"
ON public.coupons FOR ALL TO authenticated
USING (public.has_role(auth.uid(),'admin'))
WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.coupon_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id uuid NOT NULL,
  user_id uuid NOT NULL,
  payment_id uuid,
  discount_cents integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.coupon_redemptions TO authenticated;
GRANT ALL ON public.coupon_redemptions TO service_role;

ALTER TABLE public.coupon_redemptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own redemptions"
ON public.coupon_redemptions FOR SELECT TO authenticated
USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));

CREATE POLICY "Admins manage redemptions"
ON public.coupon_redemptions FOR ALL TO authenticated
USING (public.has_role(auth.uid(),'admin'))
WITH CHECK (public.has_role(auth.uid(),'admin'));

-- =====================
-- PROFILE FIELDS
-- =====================
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_suspended boolean NOT NULL DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone text;

-- =====================
-- PAYMENT FIELDS
-- =====================
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS discount_cents integer NOT NULL DEFAULT 0;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS coupon_code text;

-- =====================
-- COUPON VALIDATION
-- =====================
CREATE OR REPLACE FUNCTION public.validate_coupon(_code text, _plan_id uuid, _user_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  c record;
  pl record;
  user_uses int;
  discount_cents int := 0;
  final_cents int;
BEGIN
  SELECT * INTO c FROM public.coupons WHERE lower(code) = lower(_code) AND is_active = true;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Cupom não encontrado');
  END IF;
  IF c.starts_at IS NOT NULL AND now() < c.starts_at THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Cupom ainda não está válido');
  END IF;
  IF c.ends_at IS NOT NULL AND now() > c.ends_at THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Cupom expirado');
  END IF;
  IF c.usage_limit IS NOT NULL AND c.uses_count >= c.usage_limit THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Cupom esgotado');
  END IF;
  IF c.applies_to_plan_id IS NOT NULL AND c.applies_to_plan_id <> _plan_id THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Cupom não aplicável a este plano');
  END IF;
  IF c.per_user_limit IS NOT NULL AND _user_id IS NOT NULL THEN
    SELECT count(*) INTO user_uses FROM public.coupon_redemptions WHERE coupon_id = c.id AND user_id = _user_id;
    IF user_uses >= c.per_user_limit THEN
      RETURN jsonb_build_object('valid', false, 'error', 'Você já utilizou este cupom');
    END IF;
  END IF;

  SELECT * INTO pl FROM public.plans WHERE id = _plan_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Plano inválido');
  END IF;

  IF c.discount_type = 'percent' THEN
    discount_cents := floor(pl.price_cents * (LEAST(c.discount_value,100) / 100.0))::int;
  ELSIF c.discount_type = 'fixed' THEN
    discount_cents := LEAST(c.discount_value::int, pl.price_cents);
  ELSE
    discount_cents := 0;
  END IF;

  final_cents := GREATEST(0, pl.price_cents - discount_cents);

  RETURN jsonb_build_object(
    'valid', true,
    'coupon_id', c.id,
    'code', c.code,
    'discount_type', c.discount_type,
    'discount_value', c.discount_value,
    'discount_cents', discount_cents,
    'original_cents', pl.price_cents,
    'final_cents', final_cents
  );
END;
$$;

-- =====================
-- ADMIN: USER DETAIL
-- =====================
CREATE OR REPLACE FUNCTION public.admin_get_user_detail(_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  SELECT jsonb_build_object(
    'profile', to_jsonb(p.*),
    'auth', jsonb_build_object(
      'email', u.email,
      'phone', u.phone,
      'last_sign_in_at', u.last_sign_in_at,
      'created_at', u.created_at,
      'banned_until', u.banned_until,
      'email_confirmed_at', u.email_confirmed_at
    ),
    'roles', COALESCE((SELECT jsonb_agg(role) FROM public.user_roles WHERE user_id = p.user_id), '[]'::jsonb),
    'subscription', (SELECT to_jsonb(s.*) FROM public.subscriptions s WHERE s.user_id = p.user_id ORDER BY updated_at DESC NULLS LAST LIMIT 1),
    'plan', (SELECT to_jsonb(pl.*) FROM public.subscriptions s JOIN public.plans pl ON pl.id = s.plan_id WHERE s.user_id = p.user_id ORDER BY s.updated_at DESC NULLS LAST LIMIT 1),
    'diagnoses_count', (SELECT count(*) FROM public.diagnoses WHERE user_id = p.user_id),
    'diagnoses', (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', d.id, 'status', d.status, 'created_at', d.created_at) ORDER BY d.created_at DESC), '[]'::jsonb) FROM public.diagnoses d WHERE d.user_id = p.user_id),
    'payments', (SELECT COALESCE(jsonb_agg(to_jsonb(py.*) ORDER BY py.created_at DESC), '[]'::jsonb) FROM public.payments py WHERE py.user_id = p.user_id),
    'total_spent_cents', COALESCE((SELECT sum(amount_cents) FROM public.payments WHERE user_id = p.user_id AND status IN ('approved','paid')),0),
    'sign_in_count', 0
  ) INTO r
  FROM public.profiles p
  LEFT JOIN auth.users u ON u.id = p.user_id
  WHERE p.user_id = _user_id;
  RETURN r;
END;
$$;

-- =====================
-- ADMIN: UPDATE PROFILE
-- =====================
CREATE OR REPLACE FUNCTION public.admin_update_profile(
  _user_id uuid,
  _full_name text DEFAULT NULL,
  _phone text DEFAULT NULL,
  _avatar_url text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  UPDATE public.profiles SET
    full_name = COALESCE(_full_name, full_name),
    phone = COALESCE(_phone, phone),
    avatar_url = COALESCE(_avatar_url, avatar_url),
    updated_at = now()
  WHERE user_id = _user_id;
END;
$$;

-- =====================
-- ADMIN: SUSPEND / REACTIVATE
-- =====================
CREATE OR REPLACE FUNCTION public.admin_set_suspended(_user_id uuid, _suspended boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  UPDATE public.profiles SET is_suspended = _suspended, updated_at = now() WHERE user_id = _user_id;
END;
$$;

-- =====================
-- ADMIN: GRANT / REMOVE PLAN
-- =====================
CREATE OR REPLACE FUNCTION public.admin_grant_plan(_user_id uuid, _plan_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  INSERT INTO public.subscriptions (user_id, plan_id, plan, status, current_period_start, current_period_end, updated_at)
  VALUES (_user_id, _plan_id, 'monthly', 'active', now(), now() + interval '30 days', now())
  ON CONFLICT (user_id) DO UPDATE SET
    plan_id = EXCLUDED.plan_id,
    status = 'active',
    current_period_start = EXCLUDED.current_period_start,
    current_period_end = EXCLUDED.current_period_end,
    cancel_at_period_end = false,
    updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_remove_plan(_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  UPDATE public.subscriptions SET status = 'canceled', cancel_at_period_end = true, updated_at = now()
  WHERE user_id = _user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_force_renew(_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  UPDATE public.subscriptions SET
    status = 'active',
    current_period_start = now(),
    current_period_end = now() + interval '30 days',
    cancel_at_period_end = false,
    updated_at = now()
  WHERE user_id = _user_id;
END;
$$;

-- =====================
-- ADMIN: PLANS OVERVIEW
-- =====================
CREATE OR REPLACE FUNCTION public.admin_plans_overview()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'plan_id', pl.id,
    'name', pl.name,
    'price_cents', pl.price_cents,
    'subscribers', COALESCE(sub.cnt,0),
    'revenue_cents', COALESCE(pay.total,0),
    'conversion_rate', CASE WHEN (SELECT count(*) FROM public.profiles) > 0
      THEN round((COALESCE(sub.cnt,0)::numeric / (SELECT count(*) FROM public.profiles)::numeric)*100,2)
      ELSE 0 END
  ) ORDER BY pl.sort_order), '[]'::jsonb) INTO r
  FROM public.plans pl
  LEFT JOIN (SELECT plan_id, count(*) cnt FROM public.subscriptions WHERE status='active' GROUP BY plan_id) sub ON sub.plan_id = pl.id
  LEFT JOIN (SELECT plan_id, sum(amount_cents) total FROM public.payments WHERE status IN ('approved','paid') GROUP BY plan_id) pay ON pay.plan_id = pl.id
  WHERE pl.is_active = true;
  RETURN r;
END;
$$;

-- =====================
-- ADMIN: ADVANCED METRICS (LTV, etc.)
-- =====================
CREATE OR REPLACE FUNCTION public.admin_advanced_metrics()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  total_revenue bigint;
  paying_users int;
  active_subs int;
  total_users int;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  SELECT COALESCE(sum(amount_cents),0) INTO total_revenue FROM public.payments WHERE status IN ('approved','paid');
  SELECT count(DISTINCT user_id) INTO paying_users FROM public.payments WHERE status IN ('approved','paid');
  SELECT count(*) INTO active_subs FROM public.subscriptions WHERE status='active';
  SELECT count(*) INTO total_users FROM public.profiles;

  RETURN jsonb_build_object(
    'ltv_cents', CASE WHEN paying_users > 0 THEN (total_revenue / paying_users)::int ELSE 0 END,
    'paying_users', paying_users,
    'active_subscriptions', active_subs,
    'total_users', total_users,
    'conversion_rate', CASE WHEN total_users>0 THEN round((active_subs::numeric/total_users::numeric)*100,2) ELSE 0 END
  );
END;
$$;
