CREATE TABLE public.diagnosis_section_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  diagnosis_key text NOT NULL,
  section text NOT NULL,
  variant text NOT NULL DEFAULT 'primary',
  image_url text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(diagnosis_key, section, variant)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.diagnosis_section_images TO authenticated;
GRANT SELECT, INSERT ON public.diagnosis_section_images TO anon;
GRANT ALL ON public.diagnosis_section_images TO service_role;
ALTER TABLE public.diagnosis_section_images ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read section images" ON public.diagnosis_section_images FOR SELECT USING (true);
CREATE POLICY "Anyone can insert section images" ON public.diagnosis_section_images FOR INSERT WITH CHECK (true);
CREATE INDEX idx_dsi_key ON public.diagnosis_section_images(diagnosis_key);