
-- Create admin-only function to get stats
CREATE OR REPLACE FUNCTION public.admin_get_stats()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result json;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT json_build_object(
    'users', (SELECT count(*) FROM public.profiles),
    'diagnoses', (SELECT count(*) FROM public.diagnoses),
    'active_subscriptions', (SELECT count(*) FROM public.subscriptions WHERE status = 'active')
  ) INTO result;

  RETURN result;
END;
$$;

-- Create admin-only function to list all profiles
CREATE OR REPLACE FUNCTION public.admin_list_profiles()
RETURNS SETOF public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY SELECT * FROM public.profiles ORDER BY created_at DESC;
END;
$$;

-- Allow admins to read all plans (including inactive)
CREATE POLICY "Admins can view all plans"
  ON public.plans FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
