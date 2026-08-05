CREATE OR REPLACE FUNCTION public.get_diagnosis_by_share_token(_token text)
RETURNS SETOF public.diagnoses
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT d.*
  FROM public.diagnoses d
  WHERE _token IS NOT NULL
    AND length(_token) >= 16
    AND d.share_token = _token
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_diagnosis_by_share_token(text) TO anon, authenticated, service_role;