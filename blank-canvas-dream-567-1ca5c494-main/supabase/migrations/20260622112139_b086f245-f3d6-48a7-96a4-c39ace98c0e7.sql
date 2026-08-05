-- Drop legacy fashion affiliate architecture
DROP FUNCTION IF EXISTS public.fashion_affiliate_overview() CASCADE;
DROP TABLE IF EXISTS public.fashion_affiliate_conversions CASCADE;
DROP TABLE IF EXISTS public.fashion_affiliate_links CASCADE;
DROP TABLE IF EXISTS public.fashion_affiliate_clicks CASCADE;
DROP TABLE IF EXISTS public.fashion_stores CASCADE;

-- Curated affiliate product catalog
CREATE TABLE public.fashion_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category text NOT NULL,
  style text[] NOT NULL DEFAULT '{}',
  body_type text[] NOT NULL DEFAULT '{}',
  color_palette text[] NOT NULL DEFAULT '{}',
  occasion text[] NOT NULL DEFAULT '{}',
  budget text NOT NULL DEFAULT 'medium',
  store text NOT NULL,
  is_reference boolean NOT NULL DEFAULT false,
  price_cents integer NOT NULL DEFAULT 0,
  image_url text,
  affiliate_url text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.fashion_products TO anon, authenticated;
GRANT ALL ON public.fashion_products TO service_role;

ALTER TABLE public.fashion_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active products"
  ON public.fashion_products FOR SELECT
  USING (active = true OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert products"
  ON public.fashion_products FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update products"
  ON public.fashion_products FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete products"
  ON public.fashion_products FOR DELETE
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_fashion_products_active ON public.fashion_products(active);
CREATE INDEX idx_fashion_products_category ON public.fashion_products(category);
CREATE INDEX idx_fashion_products_style ON public.fashion_products USING GIN(style);
CREATE INDEX idx_fashion_products_body ON public.fashion_products USING GIN(body_type);
CREATE INDEX idx_fashion_products_palette ON public.fashion_products USING GIN(color_palette);

CREATE TRIGGER update_fashion_products_updated_at
  BEFORE UPDATE ON public.fashion_products
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Click tracking
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

CREATE POLICY "Users can insert own clicks"
  ON public.fashion_affiliate_clicks FOR INSERT
  WITH CHECK (user_id IS NULL OR user_id = auth.uid());

CREATE POLICY "Users can view own clicks"
  ON public.fashion_affiliate_clicks FOR SELECT
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_fashion_clicks_product ON public.fashion_affiliate_clicks(product_id);
CREATE INDEX idx_fashion_clicks_user ON public.fashion_affiliate_clicks(user_id);

-- Simplified analytics RPC for admin
CREATE OR REPLACE FUNCTION public.fashion_products_overview()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE r jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Not authorized'; END IF;
  SELECT jsonb_build_object(
    'total_products', (SELECT count(*) FROM fashion_products),
    'active_products', (SELECT count(*) FROM fashion_products WHERE active = true),
    'total_clicks', (SELECT count(*) FROM fashion_affiliate_clicks),
    'clicks_today', (SELECT count(*) FROM fashion_affiliate_clicks WHERE clicked_at >= date_trunc('day', now())),
    'clicks_month', (SELECT count(*) FROM fashion_affiliate_clicks WHERE clicked_at >= date_trunc('month', now())),
    'by_store', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'store', store, 'products', cnt, 'clicks', COALESCE(clk, 0)
      ) ORDER BY cnt DESC) FROM (
        SELECT p.store, count(*) cnt,
          (SELECT count(*) FROM fashion_affiliate_clicks c
           JOIN fashion_products fp ON fp.id = c.product_id
           WHERE fp.store = p.store) as clk
        FROM fashion_products p GROUP BY p.store
      ) s), '[]'::jsonb),
    'top_products', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', p.id, 'name', p.name, 'store', p.store, 'clicks', cnt
      ) ORDER BY cnt DESC) FROM (
        SELECT product_id, count(*) cnt FROM fashion_affiliate_clicks
        GROUP BY product_id ORDER BY cnt DESC LIMIT 10
      ) c JOIN fashion_products p ON p.id = c.product_id), '[]'::jsonb)
  ) INTO r;
  RETURN r;
END; $$;