
-- Affiliates: one row per user enrolled in the program
CREATE TABLE IF NOT EXISTS public.affiliates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  code text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'active',
  commission_percent_override numeric,
  total_clicks int NOT NULL DEFAULT 0,
  total_signups int NOT NULL DEFAULT 0,
  total_conversions int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.affiliates TO authenticated;
GRANT ALL ON public.affiliates TO service_role;
ALTER TABLE public.affiliates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Affiliates view own" ON public.affiliates FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Affiliates insert own" ON public.affiliates FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Affiliates update own" ON public.affiliates FOR UPDATE TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.affiliate_clicks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id uuid NOT NULL REFERENCES public.affiliates(id) ON DELETE CASCADE,
  referrer text,
  user_agent text,
  landing_path text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.affiliate_clicks TO authenticated;
GRANT INSERT ON public.affiliate_clicks TO anon, authenticated;
GRANT ALL ON public.affiliate_clicks TO service_role;
ALTER TABLE public.affiliate_clicks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can register click" ON public.affiliate_clicks FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Affiliate or admin reads clicks" ON public.affiliate_clicks FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(),'admin') OR affiliate_id IN (SELECT id FROM public.affiliates WHERE user_id = auth.uid())
);

CREATE TABLE IF NOT EXISTS public.affiliate_referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id uuid NOT NULL REFERENCES public.affiliates(id) ON DELETE CASCADE,
  referred_user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  converted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.affiliate_referrals TO authenticated;
GRANT ALL ON public.affiliate_referrals TO service_role;
ALTER TABLE public.affiliate_referrals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated insert own referral" ON public.affiliate_referrals FOR INSERT TO authenticated WITH CHECK (referred_user_id = auth.uid());
CREATE POLICY "Affiliate or admin reads referrals" ON public.affiliate_referrals FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(),'admin') OR affiliate_id IN (SELECT id FROM public.affiliates WHERE user_id = auth.uid())
);

CREATE TABLE IF NOT EXISTS public.affiliate_commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id uuid NOT NULL REFERENCES public.affiliates(id) ON DELETE CASCADE,
  referred_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  payment_id uuid REFERENCES public.payments(id) ON DELETE SET NULL,
  base_amount_cents int NOT NULL,
  commission_cents int NOT NULL,
  commission_percent numeric NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  notes text,
  approved_at timestamptz,
  paid_at timestamptz,
  rejected_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.affiliate_commissions TO authenticated;
GRANT ALL ON public.affiliate_commissions TO service_role;
ALTER TABLE public.affiliate_commissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Affiliate or admin reads commissions" ON public.affiliate_commissions FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(),'admin') OR affiliate_id IN (SELECT id FROM public.affiliates WHERE user_id = auth.uid())
);

CREATE TABLE IF NOT EXISTS public.affiliate_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id uuid NOT NULL REFERENCES public.affiliates(id) ON DELETE CASCADE,
  amount_cents int NOT NULL,
  status text NOT NULL DEFAULT 'paid',
  notes text,
  paid_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.affiliate_payouts TO authenticated;
GRANT ALL ON public.affiliate_payouts TO service_role;
ALTER TABLE public.affiliate_payouts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Affiliate or admin reads payouts" ON public.affiliate_payouts FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(),'admin') OR affiliate_id IN (SELECT id FROM public.affiliates WHERE user_id = auth.uid())
);

-- Default settings
INSERT INTO public.site_settings (key, value) VALUES
  ('affiliate_program_enabled', 'true'::jsonb),
  ('affiliate_commission_percent', '20'::jsonb),
  ('affiliate_recurring_enabled', 'true'::jsonb),
  ('affiliate_min_payout_cents', '5000'::jsonb),
  ('affiliate_approval_days', '7'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Trigger: when a payment is approved/paid, create a commission for the referring affiliate
CREATE OR REPLACE FUNCTION public.affiliate_create_commission_from_payment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_ref record;
  v_percent numeric;
  v_enabled boolean;
  v_recurring boolean;
  v_existing int;
  v_first_payment boolean;
BEGIN
  IF NEW.status NOT IN ('approved','paid') THEN RETURN NEW; END IF;
  SELECT (value::text)::boolean INTO v_enabled FROM site_settings WHERE key='affiliate_program_enabled';
  IF NOT COALESCE(v_enabled, true) THEN RETURN NEW; END IF;

  SELECT ar.*, a.commission_percent_override INTO v_ref
    FROM affiliate_referrals ar
    JOIN affiliates a ON a.id = ar.affiliate_id
    WHERE ar.referred_user_id = NEW.user_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  SELECT (value::text)::boolean INTO v_recurring FROM site_settings WHERE key='affiliate_recurring_enabled';
  SELECT count(*) INTO v_existing FROM affiliate_commissions WHERE referred_user_id = NEW.user_id;
  v_first_payment := v_existing = 0;
  IF NOT v_first_payment AND NOT COALESCE(v_recurring, true) THEN RETURN NEW; END IF;

  SELECT COALESCE(v_ref.commission_percent_override, (value::text)::numeric) INTO v_percent
    FROM site_settings WHERE key='affiliate_commission_percent';
  v_percent := COALESCE(v_percent, 20);

  INSERT INTO affiliate_commissions (affiliate_id, referred_user_id, payment_id, base_amount_cents, commission_cents, commission_percent, status)
  VALUES (v_ref.affiliate_id, NEW.user_id, NEW.id, NEW.amount_cents, floor(NEW.amount_cents * v_percent / 100)::int, v_percent, 'pending');

  IF v_first_payment THEN
    UPDATE affiliate_referrals SET converted_at = now() WHERE id = v_ref.id;
    UPDATE affiliates SET total_conversions = total_conversions + 1, updated_at = now() WHERE id = v_ref.affiliate_id;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_affiliate_commission_on_payment ON public.payments;
CREATE TRIGGER trg_affiliate_commission_on_payment
AFTER INSERT OR UPDATE OF status ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.affiliate_create_commission_from_payment();

-- Increment counters when a click is logged
CREATE OR REPLACE FUNCTION public.affiliate_increment_clicks()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE affiliates SET total_clicks = total_clicks + 1, updated_at = now() WHERE id = NEW.affiliate_id;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_affiliate_click_inc ON public.affiliate_clicks;
CREATE TRIGGER trg_affiliate_click_inc AFTER INSERT ON public.affiliate_clicks
FOR EACH ROW EXECUTE FUNCTION public.affiliate_increment_clicks();

-- Increment signups when a referral is created
CREATE OR REPLACE FUNCTION public.affiliate_increment_signups()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE affiliates SET total_signups = total_signups + 1, updated_at = now() WHERE id = NEW.affiliate_id;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_affiliate_signup_inc ON public.affiliate_referrals;
CREATE TRIGGER trg_affiliate_signup_inc AFTER INSERT ON public.affiliate_referrals
FOR EACH ROW EXECUTE FUNCTION public.affiliate_increment_signups();

-- RPCs ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_my_affiliate_dashboard()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_aff record;
  v_pending bigint;
  v_approved bigint;
  v_paid bigint;
  v_revenue bigint;
  v_percent numeric;
BEGIN
  SELECT * INTO v_aff FROM affiliates WHERE user_id = auth.uid();
  IF NOT FOUND THEN
    SELECT (value::text)::numeric INTO v_percent FROM site_settings WHERE key='affiliate_commission_percent';
    RETURN jsonb_build_object('enrolled', false, 'commission_percent', COALESCE(v_percent,20));
  END IF;
  SELECT COALESCE(sum(commission_cents),0) INTO v_pending FROM affiliate_commissions WHERE affiliate_id = v_aff.id AND status='pending';
  SELECT COALESCE(sum(commission_cents),0) INTO v_approved FROM affiliate_commissions WHERE affiliate_id = v_aff.id AND status='approved';
  SELECT COALESCE(sum(commission_cents),0) INTO v_paid FROM affiliate_commissions WHERE affiliate_id = v_aff.id AND status='paid';
  SELECT COALESCE(sum(base_amount_cents),0) INTO v_revenue FROM affiliate_commissions WHERE affiliate_id = v_aff.id;
  SELECT COALESCE(v_aff.commission_percent_override, (value::text)::numeric) INTO v_percent FROM site_settings WHERE key='affiliate_commission_percent';
  RETURN jsonb_build_object(
    'enrolled', true,
    'code', v_aff.code,
    'clicks', v_aff.total_clicks,
    'signups', v_aff.total_signups,
    'conversions', v_aff.total_conversions,
    'revenue_cents', v_revenue,
    'pending_cents', v_pending,
    'approved_cents', v_approved,
    'paid_cents', v_paid,
    'commission_percent', COALESCE(v_percent,20),
    'history', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', c.id, 'created_at', c.created_at, 'commission_cents', c.commission_cents,
        'base_amount_cents', c.base_amount_cents, 'status', c.status, 'paid_at', c.paid_at
      ) ORDER BY c.created_at DESC) FROM affiliate_commissions c WHERE c.affiliate_id = v_aff.id
    ), '[]'::jsonb)
  );
END; $$;

CREATE OR REPLACE FUNCTION public.enroll_as_affiliate()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_code text; v_id uuid; v_existing record;
BEGIN
  SELECT * INTO v_existing FROM affiliates WHERE user_id = auth.uid();
  IF FOUND THEN RETURN jsonb_build_object('code', v_existing.code); END IF;
  LOOP
    v_code := lower(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM affiliates WHERE code = v_code);
  END LOOP;
  INSERT INTO affiliates (user_id, code) VALUES (auth.uid(), v_code) RETURNING id INTO v_id;
  RETURN jsonb_build_object('code', v_code);
END; $$;

CREATE OR REPLACE FUNCTION public.track_affiliate_click(_code text, _path text DEFAULT NULL, _referrer text DEFAULT NULL, _ua text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_aff uuid;
BEGIN
  SELECT id INTO v_aff FROM affiliates WHERE code = _code AND status='active';
  IF v_aff IS NULL THEN RETURN; END IF;
  INSERT INTO affiliate_clicks (affiliate_id, landing_path, referrer, user_agent) VALUES (v_aff, _path, _referrer, _ua);
END; $$;

CREATE OR REPLACE FUNCTION public.attach_affiliate_referral(_code text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_aff uuid;
BEGIN
  IF auth.uid() IS NULL THEN RETURN; END IF;
  SELECT id INTO v_aff FROM affiliates WHERE code = _code AND status='active' AND user_id <> auth.uid();
  IF v_aff IS NULL THEN RETURN; END IF;
  INSERT INTO affiliate_referrals (affiliate_id, referred_user_id) VALUES (v_aff, auth.uid())
  ON CONFLICT (referred_user_id) DO NOTHING;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_affiliate_overview()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Not authorized'; END IF;
  SELECT jsonb_build_object(
    'total_affiliates', (SELECT count(*) FROM affiliates),
    'total_clicks', COALESCE((SELECT sum(total_clicks) FROM affiliates),0),
    'total_signups', COALESCE((SELECT sum(total_signups) FROM affiliates),0),
    'total_conversions', COALESCE((SELECT sum(total_conversions) FROM affiliates),0),
    'pending_cents', COALESCE((SELECT sum(commission_cents) FROM affiliate_commissions WHERE status='pending'),0),
    'approved_cents', COALESCE((SELECT sum(commission_cents) FROM affiliate_commissions WHERE status='approved'),0),
    'paid_cents', COALESCE((SELECT sum(commission_cents) FROM affiliate_commissions WHERE status='paid'),0),
    'affiliates', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', a.id, 'code', a.code, 'user_id', a.user_id, 'full_name', p.full_name, 'email', u.email,
        'clicks', a.total_clicks, 'signups', a.total_signups, 'conversions', a.total_conversions,
        'revenue_cents', COALESCE((SELECT sum(base_amount_cents) FROM affiliate_commissions WHERE affiliate_id=a.id),0),
        'commission_cents', COALESCE((SELECT sum(commission_cents) FROM affiliate_commissions WHERE affiliate_id=a.id),0),
        'status', a.status, 'created_at', a.created_at
      ) ORDER BY a.created_at DESC)
      FROM affiliates a
      LEFT JOIN profiles p ON p.user_id = a.user_id
      LEFT JOIN auth.users u ON u.id = a.user_id
    ), '[]'::jsonb),
    'commissions', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', c.id, 'affiliate_id', c.affiliate_id, 'code', a.code, 'full_name', p.full_name,
        'commission_cents', c.commission_cents, 'base_amount_cents', c.base_amount_cents,
        'status', c.status, 'created_at', c.created_at, 'paid_at', c.paid_at, 'notes', c.notes
      ) ORDER BY c.created_at DESC)
      FROM affiliate_commissions c
      JOIN affiliates a ON a.id = c.affiliate_id
      LEFT JOIN profiles p ON p.user_id = a.user_id
    ), '[]'::jsonb)
  ) INTO r;
  RETURN r;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_set_commission_status(_id uuid, _status text, _notes text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF _status NOT IN ('pending','approved','rejected','paid') THEN RAISE EXCEPTION 'Invalid status'; END IF;
  UPDATE affiliate_commissions SET
    status = _status,
    notes = COALESCE(_notes, notes),
    approved_at = CASE WHEN _status='approved' THEN now() ELSE approved_at END,
    paid_at = CASE WHEN _status='paid' THEN now() ELSE paid_at END,
    rejected_at = CASE WHEN _status='rejected' THEN now() ELSE rejected_at END,
    updated_at = now()
  WHERE id = _id;
END; $$;
