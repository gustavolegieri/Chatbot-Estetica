ALTER TABLE public.clothing_images 
  ADD COLUMN IF NOT EXISTS style text,
  ADD COLUMN IF NOT EXISTS color text,
  ADD COLUMN IF NOT EXISTS fabric text,
  ADD COLUMN IF NOT EXISTS prompt_used text;