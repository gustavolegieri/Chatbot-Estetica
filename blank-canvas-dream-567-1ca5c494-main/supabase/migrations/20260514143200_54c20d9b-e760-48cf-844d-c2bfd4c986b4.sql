-- Drop the overly permissive policy that exposes all shared diagnoses
DROP POLICY IF EXISTS "Anyone can view shared diagnoses" ON public.diagnoses;

-- Secure RPC: returns sanitized diagnosis only when token matches exactly
CREATE OR REPLACE FUNCTION public.get_shared_diagnosis(_token text)
RETURNS TABLE (
  id uuid,
  created_at timestamptz,
  body_analysis jsonb,
  color_analysis jsonb,
  style_analysis jsonb,
  modeling_analysis jsonb,
  wardrobe_essentials jsonb,
  capsule_wardrobe jsonb,
  final_diagnosis jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    d.id,
    d.created_at,
    d.body_analysis,
    d.color_analysis,
    d.style_analysis,
    d.modeling_analysis,
    d.wardrobe_essentials,
    d.capsule_wardrobe,
    d.final_diagnosis
  FROM public.diagnoses d
  WHERE _token IS NOT NULL
    AND length(_token) >= 16
    AND d.share_token = _token
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_shared_diagnosis(text) TO anon, authenticated;