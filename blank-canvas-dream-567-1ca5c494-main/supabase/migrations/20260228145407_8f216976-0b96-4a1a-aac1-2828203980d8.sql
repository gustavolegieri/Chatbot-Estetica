
-- Create app_role enum
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

-- Create user_roles table
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer function to check roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- RLS: users can view their own roles
CREATE POLICY "Users can view own roles"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- RLS: admins can manage all roles
CREATE POLICY "Admins can manage roles"
  ON public.user_roles FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Create plans table for configurable pricing
CREATE TABLE public.plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  price_cents integer NOT NULL DEFAULT 9700,
  currency text NOT NULL DEFAULT 'BRL',
  interval text NOT NULL DEFAULT 'monthly',
  features jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  is_popular boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;

-- Everyone can read active plans
CREATE POLICY "Anyone can view active plans"
  ON public.plans FOR SELECT
  USING (is_active = true);

-- Admins can manage plans
CREATE POLICY "Admins can manage plans"
  ON public.plans FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Create site_settings table for configurable options
CREATE TABLE public.site_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;

-- Everyone can read settings
CREATE POLICY "Anyone can view settings"
  ON public.site_settings FOR SELECT
  USING (true);

-- Admins can manage settings
CREATE POLICY "Admins can manage settings"
  ON public.site_settings FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Insert default plan
INSERT INTO public.plans (name, description, price_cents, currency, interval, features, is_active, is_popular, sort_order)
VALUES (
  'Plano Premium',
  'Acesso completo a todas as funcionalidades',
  9700,
  'BRL',
  'monthly',
  '["Diagnósticos ilimitados","Análise corporal completa","Coloração pessoal detalhada","Perfil de estilo personalizado","Guia de modelagens e tecidos","Armário cápsula personalizado","Sugestões de looks por ocasião","Download em PDF","Atualizações por 12 meses","Suporte prioritário"]'::jsonb,
  true,
  true,
  0
);

-- Insert default site settings
INSERT INTO public.site_settings (key, value) VALUES
  ('contact_email', '"contato@estelite.com.br"'),
  ('site_name', '"EST ELITE"'),
  ('demo_mode', 'true');
