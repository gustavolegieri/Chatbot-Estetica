CREATE TABLE public.fashion_search_cache (
  id uuid primary key default gen_random_uuid(),
  cache_key text not null unique,
  results jsonb not null default '[]'::jsonb,
  fetched_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours')
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fashion_search_cache TO service_role;
ALTER TABLE public.fashion_search_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service role only" ON public.fashion_search_cache FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX idx_fashion_search_cache_expires ON public.fashion_search_cache(expires_at);