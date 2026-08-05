-- Rate limiting table for edge functions
CREATE TABLE public.rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  action text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

-- Only service role can access this table (used by edge functions)
CREATE POLICY "Service role only" ON public.rate_limits FOR ALL USING (false);

-- Index for efficient lookups
CREATE INDEX idx_rate_limits_user_action ON public.rate_limits (user_id, action, created_at DESC);

-- Cleanup function to remove old entries (older than 1 hour)
CREATE OR REPLACE FUNCTION public.cleanup_rate_limits()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.rate_limits WHERE created_at < now() - interval '1 hour';
$$;