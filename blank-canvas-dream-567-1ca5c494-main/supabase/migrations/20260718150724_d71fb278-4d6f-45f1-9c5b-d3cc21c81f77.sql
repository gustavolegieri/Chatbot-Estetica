-- Payments
CREATE TABLE public.payments (
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
  external_reference text,
  discount_cents integer NOT NULL DEFAULT 0,
  coupon_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own payments" ON public.payments FOR SELECT TO authenticated USING (auth.uid()=user_id);
CREATE POLICY "Admins manage payments" ON public.payments FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE INDEX idx_payments_user ON public.payments(user_id);
CREATE INDEX idx_payments_created ON public.payments(created_at DESC);
CREATE INDEX idx_payments_status ON public.payments(status);

CREATE TABLE public.webhook_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL, event_type text,
  payload jsonb DEFAULT '{}'::jsonb, status text DEFAULT 'received', error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.webhook_logs TO authenticated;
GRANT ALL ON public.webhook_logs TO service_role;
ALTER TABLE public.webhook_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins view webhook logs" ON public.webhook_logs FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

ALTER TABLE public.subscriptions
  ADD COLUMN mercadopago_id text,
  ADD COLUMN next_billing_date timestamptz,
  ADD COLUMN expires_at timestamptz,
  ADD COLUMN cancel_at_period_end boolean NOT NULL DEFAULT false;

CREATE TABLE public.payment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid, payment_id uuid REFERENCES public.payments(id) ON DELETE SET NULL,
  subscription_id uuid REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  provider text NOT NULL DEFAULT 'mercadopago',
  provider_event_id text, payload jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.payment_events TO authenticated;
GRANT ALL ON public.payment_events TO service_role;
ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own payment events" ON public.payment_events FOR SELECT TO authenticated USING (auth.uid()=user_id);
CREATE POLICY "Admins manage payment events" ON public.payment_events FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Coupons
CREATE TABLE public.coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE, description text,
  discount_type text NOT NULL DEFAULT 'percent',
  discount_value numeric NOT NULL DEFAULT 0,
  starts_at timestamptz, ends_at timestamptz,
  usage_limit integer, per_user_limit integer DEFAULT 1,
  uses_count integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  applies_to_plan_id uuid, created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.coupons TO authenticated;
GRANT ALL ON public.coupons TO service_role;
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth view active coupons" ON public.coupons FOR SELECT TO authenticated USING (is_active=true);
CREATE POLICY "Admins manage coupons" ON public.coupons FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.coupon_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id uuid NOT NULL, user_id uuid NOT NULL,
  payment_id uuid, discount_cents integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.coupon_redemptions TO authenticated;
GRANT ALL ON public.coupon_redemptions TO service_role;
ALTER TABLE public.coupon_redemptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own redemptions" ON public.coupon_redemptions FOR SELECT TO authenticated USING (auth.uid()=user_id OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins manage redemptions" ON public.coupon_redemptions FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE OR REPLACE FUNCTION public.validate_coupon(_code text, _plan_id uuid, _user_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE c record; pl record; user_uses int; discount_cents int:=0; final_cents int;
BEGIN
  SELECT * INTO c FROM public.coupons WHERE lower(code)=lower(_code) AND is_active=true;
  IF NOT FOUND THEN RETURN jsonb_build_object('valid',false,'error','Cupom não encontrado'); END IF;
  IF c.starts_at IS NOT NULL AND now()<c.starts_at THEN RETURN jsonb_build_object('valid',false,'error','Cupom ainda não válido'); END IF;
  IF c.ends_at IS NOT NULL AND now()>c.ends_at THEN RETURN jsonb_build_object('valid',false,'error','Cupom expirado'); END IF;
  IF c.usage_limit IS NOT NULL AND c.uses_count>=c.usage_limit THEN RETURN jsonb_build_object('valid',false,'error','Cupom esgotado'); END IF;
  IF c.applies_to_plan_id IS NOT NULL AND c.applies_to_plan_id<>_plan_id THEN RETURN jsonb_build_object('valid',false,'error','Não aplicável'); END IF;
  IF c.per_user_limit IS NOT NULL AND _user_id IS NOT NULL THEN
    SELECT count(*) INTO user_uses FROM public.coupon_redemptions WHERE coupon_id=c.id AND user_id=_user_id;
    IF user_uses>=c.per_user_limit THEN RETURN jsonb_build_object('valid',false,'error','Já utilizado'); END IF;
  END IF;
  SELECT * INTO pl FROM public.plans WHERE id=_plan_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('valid',false,'error','Plano inválido'); END IF;
  IF c.discount_type='percent' THEN discount_cents:=floor(pl.price_cents*(LEAST(c.discount_value,100)/100.0))::int;
  ELSIF c.discount_type='fixed' THEN discount_cents:=LEAST(c.discount_value::int,pl.price_cents);
  ELSE discount_cents:=0; END IF;
  final_cents:=GREATEST(0,pl.price_cents-discount_cents);
  RETURN jsonb_build_object('valid',true,'coupon_id',c.id,'code',c.code,'discount_type',c.discount_type,'discount_value',c.discount_value,'discount_cents',discount_cents,'original_cents',pl.price_cents,'final_cents',final_cents);
END; $$;

-- Blog
CREATE TABLE public.blog_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title text NOT NULL, excerpt text, content text NOT NULL,
  cover_image_url text, meta_title text, meta_description text,
  tags text[] DEFAULT '{}', published boolean NOT NULL DEFAULT true,
  author text DEFAULT 'EST ELITE',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX blog_posts_pub_created_idx ON public.blog_posts(published, created_at DESC);
GRANT SELECT ON public.blog_posts TO anon, authenticated;
GRANT ALL ON public.blog_posts TO service_role;
ALTER TABLE public.blog_posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read published posts" ON public.blog_posts FOR SELECT USING (published=true);
CREATE POLICY "Admins manage posts" ON public.blog_posts FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Affiliates
CREATE TABLE public.affiliates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  code text NOT NULL UNIQUE, status text NOT NULL DEFAULT 'active',
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
CREATE POLICY "Aff view own" ON public.affiliates FOR SELECT TO authenticated USING (user_id=auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Aff insert own" ON public.affiliates FOR INSERT TO authenticated WITH CHECK (user_id=auth.uid());
CREATE POLICY "Aff update own" ON public.affiliates FOR UPDATE TO authenticated USING (user_id=auth.uid() OR public.has_role(auth.uid(),'admin'));

CREATE TABLE public.affiliate_clicks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id uuid NOT NULL REFERENCES public.affiliates(id) ON DELETE CASCADE,
  referrer text, user_agent text, landing_path text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.affiliate_clicks TO authenticated;
GRANT INSERT ON public.affiliate_clicks TO anon, authenticated;
GRANT ALL ON public.affiliate_clicks TO service_role;
ALTER TABLE public.affiliate_clicks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone register click" ON public.affiliate_clicks FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Aff or admin reads clicks" ON public.affiliate_clicks FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin') OR affiliate_id IN (SELECT id FROM public.affiliates WHERE user_id=auth.uid()));

CREATE TABLE public.affiliate_referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id uuid NOT NULL REFERENCES public.affiliates(id) ON DELETE CASCADE,
  referred_user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  converted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.affiliate_referrals TO authenticated;
GRANT ALL ON public.affiliate_referrals TO service_role;
ALTER TABLE public.affiliate_referrals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Insert own referral" ON public.affiliate_referrals FOR INSERT TO authenticated WITH CHECK (referred_user_id=auth.uid());
CREATE POLICY "Aff or admin reads referrals" ON public.affiliate_referrals FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin') OR affiliate_id IN (SELECT id FROM public.affiliates WHERE user_id=auth.uid()));

CREATE TABLE public.affiliate_commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id uuid NOT NULL REFERENCES public.affiliates(id) ON DELETE CASCADE,
  referred_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  payment_id uuid REFERENCES public.payments(id) ON DELETE SET NULL,
  base_amount_cents int NOT NULL, commission_cents int NOT NULL,
  commission_percent numeric NOT NULL,
  status text NOT NULL DEFAULT 'pending', notes text,
  approved_at timestamptz, paid_at timestamptz, rejected_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.affiliate_commissions TO authenticated;
GRANT ALL ON public.affiliate_commissions TO service_role;
ALTER TABLE public.affiliate_commissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Aff or admin reads commissions" ON public.affiliate_commissions FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin') OR affiliate_id IN (SELECT id FROM public.affiliates WHERE user_id=auth.uid()));

CREATE TABLE public.affiliate_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id uuid NOT NULL REFERENCES public.affiliates(id) ON DELETE CASCADE,
  amount_cents int NOT NULL, status text NOT NULL DEFAULT 'paid', notes text,
  paid_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.affiliate_payouts TO authenticated;
GRANT ALL ON public.affiliate_payouts TO service_role;
ALTER TABLE public.affiliate_payouts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Aff or admin reads payouts" ON public.affiliate_payouts FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin') OR affiliate_id IN (SELECT id FROM public.affiliates WHERE user_id=auth.uid()));

INSERT INTO public.site_settings (key, value) VALUES
  ('affiliate_program_enabled','true'::jsonb),
  ('affiliate_commission_percent','20'::jsonb),
  ('affiliate_recurring_enabled','true'::jsonb),
  ('affiliate_min_payout_cents','5000'::jsonb),
  ('affiliate_approval_days','7'::jsonb),
  ('seo_title','"EST ELITE — Diagnóstico de Imagem Pessoal com IA"'),
  ('seo_description','"7 inteligências artificiais analisam sua imagem pessoal e criam um diagnóstico completo."'),
  ('seo_keywords','"consultoria de imagem, diagnóstico de estilo"'),
  ('seo_canonical','"https://estelite.lovable.app"'),
  ('seo_og_image','""'),
  ('seo_author','"EST ELITE"'),
  ('seo_robots','"index, follow"'),
  ('seo_ga_id','""'),
  ('seo_gtm_id','""'),
  ('seo_meta_pixel_id','""'),
  ('seo_google_site_verification','""'),
  ('seo_custom_head_code','""'),
  ('seo_custom_body_code','""'),
  ('blog_site_theme','"Moda feminina, consultoria de imagem."')
ON CONFLICT (key) DO NOTHING;

-- Fashion products
CREATE TABLE public.fashion_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL, category text NOT NULL,
  style text[] NOT NULL DEFAULT '{}',
  body_type text[] NOT NULL DEFAULT '{}',
  color_palette text[] NOT NULL DEFAULT '{}',
  occasion text[] NOT NULL DEFAULT '{}',
  budget text NOT NULL DEFAULT 'medium',
  store text NOT NULL, is_reference boolean NOT NULL DEFAULT false,
  price_cents integer NOT NULL DEFAULT 0,
  image_url text, affiliate_url text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.fashion_products TO anon, authenticated;
GRANT ALL ON public.fashion_products TO service_role;
ALTER TABLE public.fashion_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone view active fashion products" ON public.fashion_products FOR SELECT USING (active=true OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins insert fashion products" ON public.fashion_products FOR INSERT WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins update fashion products" ON public.fashion_products FOR UPDATE USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins delete fashion products" ON public.fashion_products FOR DELETE USING (public.has_role(auth.uid(),'admin'));
CREATE INDEX idx_fashion_products_active ON public.fashion_products(active);
CREATE INDEX idx_fashion_products_category ON public.fashion_products(category);
CREATE TRIGGER update_fashion_products_updated_at BEFORE UPDATE ON public.fashion_products FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.fashion_affiliate_clicks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  product_id uuid REFERENCES public.fashion_products(id) ON DELETE CASCADE,
  diagnosis_id uuid,
  clicked_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.fashion_affiliate_clicks TO authenticated;
GRANT INSERT ON public.fashion_affiliate_clicks TO anon;
GRANT ALL ON public.fashion_affiliate_clicks TO service_role;
ALTER TABLE public.fashion_affiliate_clicks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Insert own fa clicks" ON public.fashion_affiliate_clicks FOR INSERT WITH CHECK (user_id IS NULL OR user_id=auth.uid());
CREATE POLICY "View own fa clicks" ON public.fashion_affiliate_clicks FOR SELECT USING (user_id=auth.uid() OR public.has_role(auth.uid(),'admin'));

CREATE TABLE public.fashion_search_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key text NOT NULL UNIQUE,
  results jsonb NOT NULL DEFAULT '[]'::jsonb,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now()+interval '24 hours')
);
GRANT ALL ON public.fashion_search_cache TO service_role;
ALTER TABLE public.fashion_search_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service role only fsc" ON public.fashion_search_cache FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX idx_fashion_search_cache_expires ON public.fashion_search_cache(expires_at);

CREATE TABLE public.image_usage_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  image_url text NOT NULL UNIQUE,
  diagnosis_id uuid, source text, mode text, section text,
  normalized_key text, query text, query_fingerprint text,
  collision_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.image_usage_history TO service_role;
ALTER TABLE public.image_usage_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service manage image_usage_history" ON public.image_usage_history FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX idx_iuh_last_used ON public.image_usage_history(last_used_at DESC);
CREATE INDEX idx_iuh_diagnosis ON public.image_usage_history(diagnosis_id);
CREATE INDEX idx_iuh_fp ON public.image_usage_history(query_fingerprint);

-- Additional RPCs
CREATE OR REPLACE FUNCTION public.get_diagnosis_by_share_token(_token text) RETURNS SETOF public.diagnoses LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT d.* FROM public.diagnoses d WHERE _token IS NOT NULL AND length(_token)>=16 AND d.share_token=_token LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.get_diagnosis_by_share_token(text) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_list_users_full() RETURNS TABLE(user_id uuid, full_name text, email text, created_at timestamptz, last_sign_in_at timestamptz, plan_name text, subscription_status text, diagnoses_count bigint, total_spent_cents bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Not authorized'; END IF;
  RETURN QUERY SELECT p.user_id, p.full_name, u.email::text, p.created_at, u.last_sign_in_at, pl.name, s.status, (SELECT count(*) FROM public.diagnoses d WHERE d.user_id=p.user_id), COALESCE((SELECT sum(amount_cents) FROM public.payments py WHERE py.user_id=p.user_id AND py.status IN ('approved','paid')),0)
  FROM public.profiles p LEFT JOIN auth.users u ON u.id=p.user_id
  LEFT JOIN LATERAL(SELECT * FROM public.subscriptions s2 WHERE s2.user_id=p.user_id ORDER BY updated_at DESC NULLS LAST LIMIT 1) s ON true
  LEFT JOIN public.plans pl ON pl.id=s.plan_id ORDER BY p.created_at DESC;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_financial_stats() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE r jsonb; BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Not authorized'; END IF;
  SELECT jsonb_build_object(
    'mrr_cents',COALESCE((SELECT sum(pl.price_cents) FROM public.subscriptions s JOIN public.plans pl ON pl.id=s.plan_id WHERE s.status='active' AND pl.interval='monthly'),0),
    'total_revenue_cents',COALESCE((SELECT sum(amount_cents) FROM public.payments WHERE status IN ('approved','paid')),0),
    'monthly_revenue_cents',COALESCE((SELECT sum(amount_cents) FROM public.payments WHERE status IN ('approved','paid') AND created_at >= date_trunc('month', now())),0),
    'active_subscriptions',(SELECT count(*) FROM public.subscriptions WHERE status='active'),
    'total_users',(SELECT count(*) FROM public.profiles),
    'new_users_month',(SELECT count(*) FROM public.profiles WHERE created_at >= date_trunc('month', now())),
    'approved_payments',(SELECT count(*) FROM public.payments WHERE status IN ('approved','paid')),
    'failed_payments',(SELECT count(*) FROM public.payments WHERE status IN ('rejected','failed'))
  ) INTO r; RETURN r;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_growth_series() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE r jsonb; BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Not authorized'; END IF;
  WITH days AS (SELECT generate_series(date_trunc('day',now())-interval '29 days', date_trunc('day',now()), interval '1 day')::date d),
  u AS (SELECT date_trunc('day',created_at)::date d, count(*) c FROM public.profiles WHERE created_at>=now()-interval '30 days' GROUP BY 1),
  rv AS (SELECT date_trunc('day',created_at)::date d, sum(amount_cents) c FROM public.payments WHERE status IN ('approved','paid') AND created_at>=now()-interval '30 days' GROUP BY 1)
  SELECT jsonb_agg(jsonb_build_object('date',to_char(days.d,'DD/MM'),'users',COALESCE(u.c,0),'revenue',COALESCE(rv.c,0)/100.0) ORDER BY days.d) INTO r
  FROM days LEFT JOIN u ON u.d=days.d LEFT JOIN rv ON rv.d=days.d;
  RETURN COALESCE(r,'[]'::jsonb);
END; $$;

CREATE OR REPLACE FUNCTION public.admin_get_user_detail(_user_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE r jsonb; BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Not authorized'; END IF;
  SELECT jsonb_build_object('profile',to_jsonb(p.*),'auth',jsonb_build_object('email',u.email,'last_sign_in_at',u.last_sign_in_at,'created_at',u.created_at,'email_confirmed_at',u.email_confirmed_at),'roles',COALESCE((SELECT jsonb_agg(role) FROM public.user_roles WHERE user_id=p.user_id),'[]'::jsonb),'subscription',(SELECT to_jsonb(s.*) FROM public.subscriptions s WHERE s.user_id=p.user_id ORDER BY updated_at DESC NULLS LAST LIMIT 1),'plan',(SELECT to_jsonb(pl.*) FROM public.subscriptions s JOIN public.plans pl ON pl.id=s.plan_id WHERE s.user_id=p.user_id ORDER BY s.updated_at DESC NULLS LAST LIMIT 1),'diagnoses_count',(SELECT count(*) FROM public.diagnoses WHERE user_id=p.user_id),'diagnoses',(SELECT COALESCE(jsonb_agg(jsonb_build_object('id',d.id,'status',d.status,'created_at',d.created_at) ORDER BY d.created_at DESC),'[]'::jsonb) FROM public.diagnoses d WHERE d.user_id=p.user_id),'payments',(SELECT COALESCE(jsonb_agg(to_jsonb(py.*) ORDER BY py.created_at DESC),'[]'::jsonb) FROM public.payments py WHERE py.user_id=p.user_id),'total_spent_cents',COALESCE((SELECT sum(amount_cents) FROM public.payments WHERE user_id=p.user_id AND status IN ('approved','paid')),0)) INTO r
  FROM public.profiles p LEFT JOIN auth.users u ON u.id=p.user_id WHERE p.user_id=_user_id;
  RETURN r;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_update_profile(_user_id uuid, _full_name text DEFAULT NULL, _phone text DEFAULT NULL, _avatar_url text DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Not authorized'; END IF;
  UPDATE public.profiles SET full_name=COALESCE(_full_name,full_name), phone=COALESCE(_phone,phone), avatar_url=COALESCE(_avatar_url,avatar_url), updated_at=now() WHERE user_id=_user_id;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_set_suspended(_user_id uuid, _suspended boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Not authorized'; END IF;
  UPDATE public.profiles SET is_suspended=_suspended, updated_at=now() WHERE user_id=_user_id;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_grant_plan(_user_id uuid, _plan_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Not authorized'; END IF;
  INSERT INTO public.subscriptions (user_id, plan_id, plan, status, current_period_start, current_period_end, updated_at) VALUES (_user_id,_plan_id,'monthly','active',now(),now()+interval '30 days',now())
  ON CONFLICT (user_id) DO UPDATE SET plan_id=EXCLUDED.plan_id, status='active', current_period_start=EXCLUDED.current_period_start, current_period_end=EXCLUDED.current_period_end, cancel_at_period_end=false, updated_at=now();
END; $$;

CREATE OR REPLACE FUNCTION public.admin_remove_plan(_user_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Not authorized'; END IF;
  UPDATE public.subscriptions SET status='canceled', cancel_at_period_end=true, updated_at=now() WHERE user_id=_user_id;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_force_renew(_user_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Not authorized'; END IF;
  UPDATE public.subscriptions SET status='active', current_period_start=now(), current_period_end=now()+interval '30 days', cancel_at_period_end=false, updated_at=now() WHERE user_id=_user_id;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_plans_overview() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE r jsonb; BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Not authorized'; END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('plan_id',pl.id,'name',pl.name,'price_cents',pl.price_cents,'subscribers',COALESCE(sub.cnt,0),'revenue_cents',COALESCE(pay.total,0)) ORDER BY pl.sort_order),'[]'::jsonb) INTO r
  FROM public.plans pl
  LEFT JOIN (SELECT plan_id, count(*) cnt FROM public.subscriptions WHERE status='active' GROUP BY plan_id) sub ON sub.plan_id=pl.id
  LEFT JOIN (SELECT plan_id, sum(amount_cents) total FROM public.payments WHERE status IN ('approved','paid') GROUP BY plan_id) pay ON pay.plan_id=pl.id
  WHERE pl.is_active=true;
  RETURN r;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_advanced_metrics() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE total_revenue bigint; paying_users int; active_subs int; total_users int;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Not authorized'; END IF;
  SELECT COALESCE(sum(amount_cents),0) INTO total_revenue FROM public.payments WHERE status IN ('approved','paid');
  SELECT count(DISTINCT user_id) INTO paying_users FROM public.payments WHERE status IN ('approved','paid');
  SELECT count(*) INTO active_subs FROM public.subscriptions WHERE status='active';
  SELECT count(*) INTO total_users FROM public.profiles;
  RETURN jsonb_build_object('ltv_cents',CASE WHEN paying_users>0 THEN (total_revenue/paying_users)::int ELSE 0 END,'paying_users',paying_users,'active_subscriptions',active_subs,'total_users',total_users);
END; $$;

-- Affiliate RPCs
CREATE OR REPLACE FUNCTION public.get_my_affiliate_dashboard() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_aff record; v_pending bigint; v_approved bigint; v_paid bigint; v_revenue bigint; v_percent numeric;
BEGIN
  SELECT * INTO v_aff FROM affiliates WHERE user_id=auth.uid();
  IF NOT FOUND THEN
    SELECT (value::text)::numeric INTO v_percent FROM site_settings WHERE key='affiliate_commission_percent';
    RETURN jsonb_build_object('enrolled',false,'commission_percent',COALESCE(v_percent,20));
  END IF;
  SELECT COALESCE(sum(commission_cents),0) INTO v_pending FROM affiliate_commissions WHERE affiliate_id=v_aff.id AND status='pending';
  SELECT COALESCE(sum(commission_cents),0) INTO v_approved FROM affiliate_commissions WHERE affiliate_id=v_aff.id AND status='approved';
  SELECT COALESCE(sum(commission_cents),0) INTO v_paid FROM affiliate_commissions WHERE affiliate_id=v_aff.id AND status='paid';
  SELECT COALESCE(sum(base_amount_cents),0) INTO v_revenue FROM affiliate_commissions WHERE affiliate_id=v_aff.id;
  SELECT COALESCE(v_aff.commission_percent_override,(value::text)::numeric) INTO v_percent FROM site_settings WHERE key='affiliate_commission_percent';
  RETURN jsonb_build_object('enrolled',true,'code',v_aff.code,'clicks',v_aff.total_clicks,'signups',v_aff.total_signups,'conversions',v_aff.total_conversions,'revenue_cents',v_revenue,'pending_cents',v_pending,'approved_cents',v_approved,'paid_cents',v_paid,'commission_percent',COALESCE(v_percent,20));
END; $$;

CREATE OR REPLACE FUNCTION public.enroll_as_affiliate() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_code text; v_id uuid; v_existing record;
BEGIN
  SELECT * INTO v_existing FROM affiliates WHERE user_id=auth.uid();
  IF FOUND THEN RETURN jsonb_build_object('code',v_existing.code); END IF;
  LOOP v_code := lower(substr(md5(random()::text||clock_timestamp()::text),1,8));
    EXIT WHEN NOT EXISTS(SELECT 1 FROM affiliates WHERE code=v_code); END LOOP;
  INSERT INTO affiliates (user_id, code) VALUES (auth.uid(), v_code) RETURNING id INTO v_id;
  RETURN jsonb_build_object('code',v_code);
END; $$;

CREATE OR REPLACE FUNCTION public.track_affiliate_click(_code text, _path text DEFAULT NULL, _referrer text DEFAULT NULL, _ua text DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_aff uuid; BEGIN
  SELECT id INTO v_aff FROM affiliates WHERE code=_code AND status='active';
  IF v_aff IS NULL THEN RETURN; END IF;
  INSERT INTO affiliate_clicks (affiliate_id, landing_path, referrer, user_agent) VALUES (v_aff,_path,_referrer,_ua);
END; $$;

CREATE OR REPLACE FUNCTION public.attach_affiliate_referral(_code text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_aff uuid; BEGIN
  IF auth.uid() IS NULL THEN RETURN; END IF;
  SELECT id INTO v_aff FROM affiliates WHERE code=_code AND status='active' AND user_id<>auth.uid();
  IF v_aff IS NULL THEN RETURN; END IF;
  INSERT INTO affiliate_referrals (affiliate_id, referred_user_id) VALUES (v_aff, auth.uid()) ON CONFLICT (referred_user_id) DO NOTHING;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_affiliate_overview() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE r jsonb; BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Not authorized'; END IF;
  SELECT jsonb_build_object('total_affiliates',(SELECT count(*) FROM affiliates),'total_clicks',COALESCE((SELECT sum(total_clicks) FROM affiliates),0),'total_signups',COALESCE((SELECT sum(total_signups) FROM affiliates),0),'total_conversions',COALESCE((SELECT sum(total_conversions) FROM affiliates),0)) INTO r;
  RETURN r;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_set_commission_status(_id uuid, _status text, _notes text DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Not authorized'; END IF;
  UPDATE affiliate_commissions SET status=_status, notes=COALESCE(_notes,notes), approved_at=CASE WHEN _status='approved' THEN now() ELSE approved_at END, paid_at=CASE WHEN _status='paid' THEN now() ELSE paid_at END, rejected_at=CASE WHEN _status='rejected' THEN now() ELSE rejected_at END, updated_at=now() WHERE id=_id;
END; $$;

CREATE OR REPLACE FUNCTION public.fashion_products_overview() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE r jsonb; BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Not authorized'; END IF;
  SELECT jsonb_build_object('total_products',(SELECT count(*) FROM fashion_products),'active_products',(SELECT count(*) FROM fashion_products WHERE active=true),'total_clicks',(SELECT count(*) FROM fashion_affiliate_clicks),'clicks_today',(SELECT count(*) FROM fashion_affiliate_clicks WHERE clicked_at>=date_trunc('day',now())),'clicks_month',(SELECT count(*) FROM fashion_affiliate_clicks WHERE clicked_at>=date_trunc('month',now()))) INTO r;
  RETURN r;
END; $$;