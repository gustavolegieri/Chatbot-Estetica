CREATE TABLE IF NOT EXISTS public.blog_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  excerpt text,
  content text NOT NULL,
  cover_image_url text,
  meta_title text,
  meta_description text,
  tags text[] DEFAULT '{}',
  published boolean NOT NULL DEFAULT true,
  author text DEFAULT 'EST ELITE',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS blog_posts_published_created_idx ON public.blog_posts (published, created_at DESC);

GRANT SELECT ON public.blog_posts TO anon, authenticated;
GRANT ALL ON public.blog_posts TO service_role;

ALTER TABLE public.blog_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read published posts" ON public.blog_posts FOR SELECT USING (published = true);
CREATE POLICY "Admins can manage posts" ON public.blog_posts FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.site_settings (key, value) VALUES
  ('seo_title', '"EST ELITE — Diagnóstico de Imagem Pessoal com IA"'),
  ('seo_description', '"7 inteligências artificiais analisam sua imagem pessoal e criam um diagnóstico completo e exclusivo com paleta de cores, estilo e guarda-roupa cápsula."'),
  ('seo_keywords', '"consultoria de imagem, diagnóstico de estilo, coloração pessoal, guarda-roupa cápsula, IA moda"'),
  ('seo_canonical', '"https://estelite.lovable.app"'),
  ('seo_og_image', '""'),
  ('seo_author', '"EST ELITE"'),
  ('seo_robots', '"index, follow"'),
  ('seo_ga_id', '""'),
  ('seo_gtm_id', '""'),
  ('seo_meta_pixel_id', '""'),
  ('seo_google_site_verification', '""'),
  ('seo_custom_head_code', '""'),
  ('seo_custom_body_code', '""'),
  ('blog_site_theme', '"Moda feminina, consultoria de imagem pessoal, coloração, estilo, guarda-roupa cápsula e autoestima."')
ON CONFLICT (key) DO NOTHING;