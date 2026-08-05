
CREATE TABLE public.clothing_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  piece_key text NOT NULL UNIQUE,
  image_url text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.clothing_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view clothing images" ON public.clothing_images FOR SELECT USING (true);
CREATE POLICY "Service role can manage clothing images" ON public.clothing_images FOR ALL USING (false);
