
CREATE TABLE public.look_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  diagnosis_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  look_name text NOT NULL,
  occasion text NOT NULL,
  occasion_description text,
  pieces jsonb NOT NULL DEFAULT '[]'::jsonb,
  styling_tips jsonb DEFAULT '[]'::jsonb,
  image_url text,
  metadata jsonb DEFAULT '{}'::jsonb
);

ALTER TABLE public.look_recommendations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own look recommendations" ON public.look_recommendations
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.diagnoses d
      WHERE d.id = look_recommendations.diagnosis_id
      AND d.user_id = auth.uid()
    )
  );

CREATE POLICY "Anyone can view shared look recommendations" ON public.look_recommendations
  FOR SELECT TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.diagnoses d
      WHERE d.id = look_recommendations.diagnosis_id
      AND d.share_token IS NOT NULL
    )
  );

CREATE POLICY "Service role can manage look recommendations" ON public.look_recommendations
  FOR ALL TO public
  USING (false);

CREATE INDEX idx_look_recommendations_diagnosis_id ON public.look_recommendations(diagnosis_id);
