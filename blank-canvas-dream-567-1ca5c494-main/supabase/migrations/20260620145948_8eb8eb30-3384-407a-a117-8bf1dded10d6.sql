
-- ============ FASHION AFFILIATE SYSTEM ============

-- 1) LOJAS
CREATE TABLE public.fashion_stores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  logo_url text,
  category text,
  affiliate_enabled boolean NOT NULL DEFAULT false,
  affiliate_network text,
  commission_percent numeric NOT NULL DEFAULT 0,
  base_url text,
  search_url_template text,
  postback_secret text,
  active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.fashion_stores TO anon, authenticated;
GRANT ALL ON public.fashion_stores TO service_role;
ALTER TABLE public.fashion_stores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Stores public read" ON public.fashion_stores FOR SELECT USING (active = true OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admin manage stores" ON public.fashion_stores FOR ALL USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_fs_upd BEFORE UPDATE ON public.fashion_stores FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) LINKS AFILIADOS
CREATE TABLE public.fashion_affiliate_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.fashion_stores(id) ON DELETE CASCADE,
  product_name text NOT NULL,
  search_keyword text,
  affiliate_url text NOT NULL,
  image_url text,
  price_cents int,
  category text,
  click_count int NOT NULL DEFAULT 0,
  conversion_count int NOT NULL DEFAULT 0,
  revenue_cents bigint NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_fal_store ON public.fashion_affiliate_links(store_id);
CREATE INDEX idx_fal_keyword ON public.fashion_affiliate_links(search_keyword);
GRANT SELECT ON public.fashion_affiliate_links TO anon, authenticated;
GRANT ALL ON public.fashion_affiliate_links TO service_role;
ALTER TABLE public.fashion_affiliate_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Links public read" ON public.fashion_affiliate_links FOR SELECT USING (active = true OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admin manage links" ON public.fashion_affiliate_links FOR ALL USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_fal_upd BEFORE UPDATE ON public.fashion_affiliate_links FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) CLICKS
CREATE TABLE public.fashion_affiliate_clicks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  link_id uuid REFERENCES public.fashion_affiliate_links(id) ON DELETE SET NULL,
  store_id uuid REFERENCES public.fashion_stores(id) ON DELETE SET NULL,
  product_name text,
  search_keyword text,
  destination_url text,
  source_page text,
  user_agent text,
  ip_hash text,
  converted boolean NOT NULL DEFAULT false,
  click_token text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_fac_user ON public.fashion_affiliate_clicks(user_id);
CREATE INDEX idx_fac_store ON public.fashion_affiliate_clicks(store_id);
CREATE INDEX idx_fac_created ON public.fashion_affiliate_clicks(created_at DESC);
GRANT SELECT, INSERT ON public.fashion_affiliate_clicks TO anon, authenticated;
GRANT ALL ON public.fashion_affiliate_clicks TO service_role;
ALTER TABLE public.fashion_affiliate_clicks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can insert click" ON public.fashion_affiliate_clicks FOR INSERT WITH CHECK (true);
CREATE POLICY "Admin read clicks" ON public.fashion_affiliate_clicks FOR SELECT USING (public.has_role(auth.uid(),'admin'));

-- 4) CONVERSIONS
CREATE TABLE public.fashion_affiliate_conversions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  click_id uuid REFERENCES public.fashion_affiliate_clicks(id) ON DELETE SET NULL,
  click_token text,
  store_id uuid REFERENCES public.fashion_stores(id) ON DELETE SET NULL,
  external_order_id text,
  amount_cents bigint NOT NULL DEFAULT 0,
  commission_cents bigint NOT NULL DEFAULT 0,
  commission_percent numeric,
  status text NOT NULL DEFAULT 'pending',
  source text,
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_fac2_store ON public.fashion_affiliate_conversions(store_id);
CREATE INDEX idx_fac2_created ON public.fashion_affiliate_conversions(created_at DESC);
GRANT SELECT ON public.fashion_affiliate_conversions TO authenticated;
GRANT ALL ON public.fashion_affiliate_conversions TO service_role;
ALTER TABLE public.fashion_affiliate_conversions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin read conversions" ON public.fashion_affiliate_conversions FOR SELECT USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admin manage conversions" ON public.fashion_affiliate_conversions FOR ALL USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_fac2_upd BEFORE UPDATE ON public.fashion_affiliate_conversions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed lojas iniciais
INSERT INTO public.fashion_stores (name, slug, category, affiliate_enabled, affiliate_network, commission_percent, base_url, search_url_template, sort_order) VALUES
  ('SHEIN','shein','fast-fashion',true,'admitad',12,'https://www.shein.com.br','https://www.shein.com.br/pdsearch/{q}/',1),
  ('Shopee','shopee','marketplace',true,'shopee-affiliate',8,'https://shopee.com.br','https://shopee.com.br/search?keyword={q}',2),
  ('Amazon Fashion','amazon','marketplace',true,'amazon-associates',4,'https://www.amazon.com.br','https://www.amazon.com.br/s?k={q}&i=fashion',3),
  ('Dafiti','dafiti','fashion',true,'awin',10,'https://www.dafiti.com.br','https://www.dafiti.com.br/catalog/?q={q}',4),
  ('Renner','renner','fashion',true,'awin',6,'https://www.lojasrenner.com.br','https://www.lojasrenner.com.br/busca?termo={q}',5),
  ('C&A','cea','fashion',true,'awin',6,'https://www.cea.com.br','https://www.cea.com.br/busca?termo={q}',6),
  ('Zara','zara','fashion',false,'manual',0,'https://www.zara.com/br','https://www.zara.com/br/pt/search?searchTerm={q}',7),
  ('AliExpress','aliexpress','marketplace',true,'admitad',7,'https://pt.aliexpress.com','https://pt.aliexpress.com/w/wholesale-{q}.html',8);

-- 5) Analytics function
CREATE OR REPLACE FUNCTION public.fashion_affiliate_overview()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE r jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Not authorized'; END IF;
  SELECT jsonb_build_object(
    'total_clicks',(SELECT count(*) FROM fashion_affiliate_clicks),
    'clicks_today',(SELECT count(*) FROM fashion_affiliate_clicks WHERE created_at>=date_trunc('day',now())),
    'clicks_month',(SELECT count(*) FROM fashion_affiliate_clicks WHERE created_at>=date_trunc('month',now())),
    'total_conversions',(SELECT count(*) FROM fashion_affiliate_conversions),
    'revenue_total_cents',COALESCE((SELECT sum(commission_cents) FROM fashion_affiliate_conversions WHERE status IN ('approved','paid')),0),
    'revenue_today_cents',COALESCE((SELECT sum(commission_cents) FROM fashion_affiliate_conversions WHERE status IN ('approved','paid') AND created_at>=date_trunc('day',now())),0),
    'revenue_month_cents',COALESCE((SELECT sum(commission_cents) FROM fashion_affiliate_conversions WHERE status IN ('approved','paid') AND created_at>=date_trunc('month',now())),0),
    'gmv_total_cents',COALESCE((SELECT sum(amount_cents) FROM fashion_affiliate_conversions WHERE status IN ('approved','paid')),0),
    'conversion_rate',CASE WHEN (SELECT count(*) FROM fashion_affiliate_clicks)>0
      THEN round(((SELECT count(*) FROM fashion_affiliate_conversions)::numeric/(SELECT count(*) FROM fashion_affiliate_clicks)::numeric)*100,2)
      ELSE 0 END,
    'avg_ticket_cents',COALESCE((SELECT avg(amount_cents)::int FROM fashion_affiliate_conversions WHERE status IN ('approved','paid')),0),
    'by_store',COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'store_id',s.id,'name',s.name,'slug',s.slug,
        'clicks',COALESCE(c.cnt,0),
        'conversions',COALESCE(cv.cnt,0),
        'revenue_cents',COALESCE(cv.rev,0),
        'gmv_cents',COALESCE(cv.gmv,0)
      ) ORDER BY COALESCE(cv.rev,0) DESC, COALESCE(c.cnt,0) DESC)
      FROM fashion_stores s
      LEFT JOIN (SELECT store_id,count(*) cnt FROM fashion_affiliate_clicks GROUP BY store_id) c ON c.store_id=s.id
      LEFT JOIN (SELECT store_id,count(*) cnt,sum(commission_cents) rev,sum(amount_cents) gmv FROM fashion_affiliate_conversions WHERE status IN ('approved','paid') GROUP BY store_id) cv ON cv.store_id=s.id
    ),'[]'::jsonb),
    'top_products',COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'product_name',product_name,'clicks',cnt,'store',store_name
      ) ORDER BY cnt DESC) FROM (
        SELECT fac.product_name,s.name store_name,count(*) cnt
        FROM fashion_affiliate_clicks fac LEFT JOIN fashion_stores s ON s.id=fac.store_id
        WHERE fac.product_name IS NOT NULL
        GROUP BY fac.product_name,s.name ORDER BY cnt DESC LIMIT 10
      ) t),'[]'::jsonb),
    'series_30d',COALESCE((
      WITH days AS (SELECT generate_series(date_trunc('day',now())-interval '29 days',date_trunc('day',now()),interval '1 day')::date d),
      cl AS (SELECT date_trunc('day',created_at)::date d,count(*) c FROM fashion_affiliate_clicks WHERE created_at>=now()-interval '30 days' GROUP BY 1),
      cv AS (SELECT date_trunc('day',created_at)::date d,sum(commission_cents) c FROM fashion_affiliate_conversions WHERE status IN ('approved','paid') AND created_at>=now()-interval '30 days' GROUP BY 1)
      SELECT jsonb_agg(jsonb_build_object('date',to_char(days.d,'DD/MM'),'clicks',COALESCE(cl.c,0),'revenue',COALESCE(cv.c,0)/100.0) ORDER BY days.d)
      FROM days LEFT JOIN cl ON cl.d=days.d LEFT JOIN cv ON cv.d=days.d
    ),'[]'::jsonb)
  ) INTO r;
  RETURN r;
END; $$;
