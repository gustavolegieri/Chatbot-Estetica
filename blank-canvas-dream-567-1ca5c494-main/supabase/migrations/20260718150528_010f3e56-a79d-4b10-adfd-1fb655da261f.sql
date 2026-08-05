-- Create profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT, avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'inactive', plan TEXT DEFAULT 'monthly',
  stripe_customer_id TEXT, stripe_subscription_id TEXT,
  current_period_start TIMESTAMPTZ, current_period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE public.diagnoses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  photo_front_url TEXT, photo_side_url TEXT, photo_back_url TEXT, photo_face_url TEXT,
  questionnaire JSONB, body_analysis JSONB, color_analysis JSONB, style_analysis JSONB,
  modeling_analysis JSONB, wardrobe_essentials JSONB, capsule_wardrobe JSONB, final_diagnosis JSONB,
  created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()
);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.diagnoses TO authenticated;
GRANT SELECT ON public.diagnoses TO anon;
GRANT ALL ON public.diagnoses TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.diagnoses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own profile" ON public.profiles FOR SELECT USING (auth.uid()=user_id);
CREATE POLICY "Users insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid()=user_id);
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE USING (auth.uid()=user_id);
CREATE POLICY "Users view own sub" ON public.subscriptions FOR SELECT USING (auth.uid()=user_id);
CREATE POLICY "Users insert own sub" ON public.subscriptions FOR INSERT WITH CHECK (auth.uid()=user_id);
CREATE POLICY "Users update own sub" ON public.subscriptions FOR UPDATE USING (auth.uid()=user_id);
CREATE POLICY "Users view own diagnoses" ON public.diagnoses FOR SELECT USING (auth.uid()=user_id);
CREATE POLICY "Users insert own diagnoses" ON public.diagnoses FOR INSERT WITH CHECK (auth.uid()=user_id);
CREATE POLICY "Users update own diagnoses" ON public.diagnoses FOR UPDATE USING (auth.uid()=user_id);
CREATE POLICY "Users delete own diagnoses" ON public.diagnoses FOR DELETE USING (auth.uid()=user_id);

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN INSERT INTO public.profiles (user_id, full_name) VALUES (new.id, new.raw_user_meta_data->>'full_name'); RETURN new; END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE POLICY "Users upload own photos" ON storage.objects FOR INSERT WITH CHECK (bucket_id='diagnosis-photos' AND auth.uid()::text=(storage.foldername(name))[1]);
CREATE POLICY "Users view own photos" ON storage.objects FOR SELECT USING (bucket_id='diagnosis-photos' AND auth.uid()::text=(storage.foldername(name))[1]);
CREATE POLICY "Users delete own photos" ON storage.objects FOR DELETE USING (bucket_id='diagnosis-photos' AND auth.uid()::text=(storage.foldername(name))[1]);
CREATE POLICY "Public read diagnosis photos" ON storage.objects FOR SELECT TO public USING (bucket_id='diagnosis-photos');
CREATE POLICY "Users update own photos" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id='diagnosis-photos' AND (storage.foldername(name))[1]=auth.uid()::text);

CREATE TYPE public.app_role AS ENUM ('admin','user');
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL, UNIQUE(user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=_user_id AND role=_role) $$;
CREATE POLICY "Users view own roles" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid()=user_id);
CREATE POLICY "Admins manage roles" ON public.user_roles FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL, description text,
  price_cents integer NOT NULL DEFAULT 9700,
  currency text NOT NULL DEFAULT 'BRL',
  interval text NOT NULL DEFAULT 'monthly',
  features jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  is_popular boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  looks_per_month integer NOT NULL DEFAULT 3,
  can_download_pdf boolean NOT NULL DEFAULT true,
  can_share boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.plans TO anon, authenticated;
GRANT ALL ON public.plans TO service_role;
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone view active plans" ON public.plans FOR SELECT USING (is_active=true);
CREATE POLICY "Admins manage plans" ON public.plans FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins view all plans" ON public.plans FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.site_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.site_settings TO anon, authenticated;
GRANT ALL ON public.site_settings TO service_role;
ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone view non-sensitive settings" ON public.site_settings FOR SELECT USING (key <> ALL (ARRAY['stripe_secret_key','stripe_webhook_secret','mp_access_token','mp_public_key','mp_webhook_secret']));
CREATE POLICY "Admins manage settings" ON public.site_settings FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin'));

INSERT INTO public.plans (name, description, price_cents, currency, interval, features, is_active, is_popular, sort_order, looks_per_month, can_download_pdf, can_share) VALUES
  ('Plano Essencial','Comece a transformar seu estilo',4900,'BRL','monthly','["3 looks/mês","Análise básica"]'::jsonb,true,false,1,3,false,false),
  ('Plano Premium','Acesso completo',9700,'BRL','monthly','["5 looks/mês","Análise completa","Download PDF"]'::jsonb,true,true,2,5,true,false),
  ('Plano Elite','Diagnóstico premium',14700,'BRL','monthly','["7 looks/mês","Tudo incluso","Compartilhamento"]'::jsonb,true,false,3,7,true,true);
INSERT INTO public.site_settings (key, value) VALUES
  ('contact_email','"contato@estelite.com.br"'),
  ('site_name','"EST ELITE"'),
  ('demo_mode','true');

CREATE OR REPLACE FUNCTION public.admin_get_stats() RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r json; BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Not authorized'; END IF;
  SELECT json_build_object('users',(SELECT count(*) FROM public.profiles),'diagnoses',(SELECT count(*) FROM public.diagnoses),'active_subscriptions',(SELECT count(*) FROM public.subscriptions WHERE status='active')) INTO r; RETURN r;
END; $$;
CREATE OR REPLACE FUNCTION public.admin_list_profiles() RETURNS SETOF public.profiles LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Not authorized'; END IF;
  RETURN QUERY SELECT * FROM public.profiles ORDER BY created_at DESC; END; $$;

ALTER TABLE public.diagnoses ADD COLUMN processing_step text;
ALTER PUBLICATION supabase_realtime ADD TABLE public.diagnoses;
ALTER TABLE public.profiles ADD COLUMN preferences jsonb DEFAULT '{}'::jsonb;
CREATE POLICY "Admins manage subscriptions" ON public.subscriptions FOR ALL USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));
ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_user_id_key UNIQUE (user_id);

CREATE TABLE public.rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL, action text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.rate_limits TO service_role;
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role only rl" ON public.rate_limits FOR ALL USING (false);
CREATE INDEX idx_rate_limits_user_action ON public.rate_limits(user_id, action, created_at DESC);
CREATE OR REPLACE FUNCTION public.cleanup_rate_limits() RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
  DELETE FROM public.rate_limits WHERE created_at < now() - interval '1 hour'; $$;

ALTER TABLE public.diagnoses ADD COLUMN share_token text UNIQUE;
CREATE INDEX idx_diagnoses_share_token ON public.diagnoses(share_token) WHERE share_token IS NOT NULL;
CREATE POLICY "Anyone view shared diagnoses" ON public.diagnoses FOR SELECT TO anon, authenticated USING (share_token IS NOT NULL);
ALTER TABLE public.diagnoses
  ADD COLUMN height_cm INTEGER, ADD COLUMN weight_kg INTEGER,
  ADD COLUMN top_size TEXT, ADD COLUMN bottom_size TEXT,
  ADD COLUMN shoe_size TEXT, ADD COLUMN body_notes TEXT,
  ADD COLUMN hair_color TEXT, ADD COLUMN eye_color TEXT,
  ADD COLUMN skin_tone TEXT, ADD COLUMN fit_preference TEXT,
  ADD COLUMN formality_level TEXT,
  ADD COLUMN style_intensity_score JSONB,
  ADD COLUMN body_balance_score JSONB;

CREATE TABLE public.analysis_visual_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL, value text NOT NULL, image_url text NOT NULL,
  created_at timestamptz DEFAULT now(), UNIQUE(category,value)
);
GRANT SELECT ON public.analysis_visual_assets TO anon, authenticated;
GRANT ALL ON public.analysis_visual_assets TO service_role;
ALTER TABLE public.analysis_visual_assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone view visual assets" ON public.analysis_visual_assets FOR SELECT USING (true);
CREATE POLICY "Admins manage visual assets" ON public.analysis_visual_assets FOR ALL USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.clothing_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  piece_key text NOT NULL UNIQUE,
  image_url text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  diagnosis_id uuid NOT NULL,
  description text, category text, normalized_key text,
  style text, color text, fabric text, prompt_used text
);
GRANT SELECT ON public.clothing_images TO anon, authenticated;
GRANT ALL ON public.clothing_images TO service_role;
ALTER TABLE public.clothing_images ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone view clothing_images" ON public.clothing_images FOR SELECT USING (true);
CREATE POLICY "Service manage clothing_images" ON public.clothing_images FOR ALL USING (false);
CREATE INDEX idx_clothing_images_normalized_key ON public.clothing_images(normalized_key);
CREATE INDEX idx_clothing_images_category ON public.clothing_images(category);
CREATE INDEX idx_clothing_images_diagnosis ON public.clothing_images(diagnosis_id);
CREATE UNIQUE INDEX idx_clothing_images_unique_diagnosis_key ON public.clothing_images(diagnosis_id, normalized_key) WHERE normalized_key IS NOT NULL;

CREATE TABLE public.look_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  diagnosis_id uuid NOT NULL,
  look_name text NOT NULL,
  image_url text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.look_images TO anon, authenticated;
GRANT ALL ON public.look_images TO service_role;
ALTER TABLE public.look_images ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone view look_images" ON public.look_images FOR SELECT USING (true);
CREATE POLICY "Service manage look_images" ON public.look_images FOR ALL USING (false);

CREATE TABLE public.look_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  diagnosis_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  look_name text NOT NULL, occasion text NOT NULL,
  occasion_description text,
  pieces jsonb NOT NULL DEFAULT '[]'::jsonb,
  styling_tips jsonb DEFAULT '[]'::jsonb,
  image_url text, metadata jsonb DEFAULT '{}'::jsonb
);
GRANT SELECT ON public.look_recommendations TO anon, authenticated;
GRANT ALL ON public.look_recommendations TO service_role;
ALTER TABLE public.look_recommendations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own look_recs" ON public.look_recommendations FOR SELECT TO authenticated
  USING (EXISTS(SELECT 1 FROM public.diagnoses d WHERE d.id=look_recommendations.diagnosis_id AND d.user_id=auth.uid()));
CREATE POLICY "Anyone view shared look_recs" ON public.look_recommendations FOR SELECT TO anon, authenticated
  USING (EXISTS(SELECT 1 FROM public.diagnoses d WHERE d.id=look_recommendations.diagnosis_id AND d.share_token IS NOT NULL));
CREATE POLICY "Service manage look_recs" ON public.look_recommendations FOR ALL USING (false);
CREATE INDEX idx_look_recommendations_diagnosis_id ON public.look_recommendations(diagnosis_id);

ALTER TABLE public.profiles
  ADD COLUMN height_cm integer, ADD COLUMN weight_kg integer,
  ADD COLUMN top_size text, ADD COLUMN bottom_size text,
  ADD COLUMN shoe_size text, ADD COLUMN body_type text,
  ADD COLUMN body_notes text, ADD COLUMN hair_color text,
  ADD COLUMN eye_color text, ADD COLUMN skin_tone text,
  ADD COLUMN fit_preference text, ADD COLUMN formality_level text,
  ADD COLUMN is_suspended boolean NOT NULL DEFAULT false,
  ADD COLUMN phone text,
  ADD COLUMN terms_accepted_at timestamptz;

CREATE OR REPLACE FUNCTION public.get_shared_diagnosis(_token text)
RETURNS TABLE(id uuid, created_at timestamptz, body_analysis jsonb, color_analysis jsonb, style_analysis jsonb, modeling_analysis jsonb, wardrobe_essentials jsonb, capsule_wardrobe jsonb, final_diagnosis jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT d.id, d.created_at, d.body_analysis, d.color_analysis, d.style_analysis, d.modeling_analysis, d.wardrobe_essentials, d.capsule_wardrobe, d.final_diagnosis
  FROM public.diagnoses d
  WHERE _token IS NOT NULL AND length(_token) >= 16 AND d.share_token = _token LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.get_shared_diagnosis(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.update_updated_at_column() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TABLE public.library_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL, style text NOT NULL, body_type text NOT NULL, color_season text NOT NULL,
  variant_index int NOT NULL DEFAULT 0, tags text[] NOT NULL DEFAULT '{}',
  prompt text NOT NULL, image_url text, status text NOT NULL DEFAULT 'pending',
  attempts int NOT NULL DEFAULT 0, last_error text, source text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT library_assets_combo_unique UNIQUE (category, style, body_type, color_season, variant_index)
);
GRANT SELECT ON public.library_assets TO anon, authenticated;
GRANT ALL ON public.library_assets TO service_role;
CREATE INDEX library_assets_status_idx ON public.library_assets(status);
CREATE INDEX library_assets_category_idx ON public.library_assets(category);
ALTER TABLE public.library_assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone view library_assets" ON public.library_assets FOR SELECT USING (true);
CREATE POLICY "Admins manage library_assets" ON public.library_assets FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER library_assets_set_updated_at BEFORE UPDATE ON public.library_assets FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE POLICY "Library assets publicly readable" ON storage.objects FOR SELECT TO public USING (bucket_id='library-assets');

ALTER TABLE public.subscriptions ADD COLUMN plan_id uuid REFERENCES public.plans(id);
CREATE OR REPLACE FUNCTION public.get_user_plan_access(_user_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_is_admin boolean; v_sub record; v_plan record; v_used int; v_period_start timestamptz;
BEGIN
  v_is_admin := public.has_role(_user_id,'admin');
  IF v_is_admin THEN
    RETURN jsonb_build_object('is_admin',true,'has_subscription',true,'plan_name','Admin','looks_per_month',9999,'looks_used',0,'looks_remaining',9999,'can_download_pdf',true,'can_share',true);
  END IF;
  SELECT * INTO v_sub FROM public.subscriptions WHERE user_id=_user_id AND status='active' ORDER BY updated_at DESC NULLS LAST LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('is_admin',false,'has_subscription',false); END IF;
  SELECT * INTO v_plan FROM public.plans WHERE id=v_sub.plan_id;
  IF NOT FOUND THEN SELECT * INTO v_plan FROM public.plans WHERE name='Plano Essencial' LIMIT 1; END IF;
  v_period_start := COALESCE(v_sub.current_period_start, date_trunc('month', now()));
  SELECT count(*) INTO v_used FROM public.diagnoses WHERE user_id=_user_id AND status IN ('completed','processing','deleted') AND created_at >= v_period_start;
  RETURN jsonb_build_object('is_admin',false,'has_subscription',true,'plan_id',v_plan.id,'plan_name',v_plan.name,'looks_per_month',v_plan.looks_per_month,'looks_used',v_used,'looks_remaining',GREATEST(0,v_plan.looks_per_month-v_used),'can_download_pdf',COALESCE(v_plan.can_download_pdf,true),'can_share',COALESCE(v_plan.can_share,true),'period_end',v_sub.current_period_end);
END; $$;
GRANT EXECUTE ON FUNCTION public.get_user_plan_access(uuid) TO authenticated, service_role;