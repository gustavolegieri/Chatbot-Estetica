-- Create image_cache table for auto-growing image database
CREATE TABLE IF NOT EXISTS public.image_cache (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  cache_key TEXT NOT NULL,
  image_url TEXT NOT NULL,
  provider TEXT NOT NULL,
  query TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index on cache_key for fast lookups
CREATE INDEX IF NOT EXISTS idx_image_cache_cache_key ON public.image_cache(cache_key);

-- Create index on created_at for cleanup
CREATE INDEX IF NOT EXISTS idx_image_cache_created_at ON public.image_cache(created_at);

-- Enable RLS
ALTER TABLE public.image_cache ENABLE ROW LEVEL SECURITY;

-- Allow read access to authenticated users
CREATE POLICY "Allow read access to authenticated users"
  ON public.image_cache FOR SELECT
  TO authenticated
  USING (true);

-- Allow insert access to service role
CREATE POLICY "Allow insert to service role"
  ON public.image_cache FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Grant necessary permissions
GRANT SELECT ON public.image_cache TO authenticated;
GRANT INSERT ON public.image_cache TO service_role;
