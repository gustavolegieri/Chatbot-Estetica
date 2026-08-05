CREATE TABLE public.look_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  diagnosis_id uuid NOT NULL,
  look_name text NOT NULL,
  image_url text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.look_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view look images" ON public.look_images FOR SELECT TO public USING (true);
CREATE POLICY "Service role can manage look images" ON public.look_images FOR ALL TO public USING (false);