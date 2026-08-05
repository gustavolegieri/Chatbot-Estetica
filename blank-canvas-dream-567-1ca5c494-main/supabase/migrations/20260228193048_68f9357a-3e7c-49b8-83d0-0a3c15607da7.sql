
CREATE TABLE public.analysis_visual_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL,
  value text NOT NULL,
  image_url text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  UNIQUE(category, value)
);

ALTER TABLE public.analysis_visual_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view visual assets" ON public.analysis_visual_assets
  FOR SELECT USING (true);

CREATE POLICY "Admins can manage visual assets" ON public.analysis_visual_assets
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));
