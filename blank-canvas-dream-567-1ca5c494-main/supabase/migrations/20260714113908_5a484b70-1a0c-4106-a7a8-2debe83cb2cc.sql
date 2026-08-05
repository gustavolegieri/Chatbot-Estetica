CREATE TABLE public.image_usage_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  image_url text NOT NULL UNIQUE,
  diagnosis_id uuid,
  source text,
  mode text,
  section text,
  normalized_key text,
  query text,
  query_fingerprint text,
  collision_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.image_usage_history TO service_role;

ALTER TABLE public.image_usage_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage image usage history"
ON public.image_usage_history
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE INDEX idx_image_usage_history_last_used_at
ON public.image_usage_history(last_used_at DESC);

CREATE INDEX idx_image_usage_history_diagnosis_id
ON public.image_usage_history(diagnosis_id);

CREATE INDEX idx_image_usage_history_query_fingerprint
ON public.image_usage_history(query_fingerprint);