
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS height_cm integer,
  ADD COLUMN IF NOT EXISTS weight_kg integer,
  ADD COLUMN IF NOT EXISTS top_size text,
  ADD COLUMN IF NOT EXISTS bottom_size text,
  ADD COLUMN IF NOT EXISTS shoe_size text,
  ADD COLUMN IF NOT EXISTS body_type text,
  ADD COLUMN IF NOT EXISTS body_notes text,
  ADD COLUMN IF NOT EXISTS hair_color text,
  ADD COLUMN IF NOT EXISTS eye_color text,
  ADD COLUMN IF NOT EXISTS skin_tone text,
  ADD COLUMN IF NOT EXISTS fit_preference text,
  ADD COLUMN IF NOT EXISTS formality_level text;
