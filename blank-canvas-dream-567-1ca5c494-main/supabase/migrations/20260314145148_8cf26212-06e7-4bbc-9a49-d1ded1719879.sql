
ALTER TABLE public.clothing_images 
ADD COLUMN IF NOT EXISTS description text,
ADD COLUMN IF NOT EXISTS category text,
ADD COLUMN IF NOT EXISTS normalized_key text;

CREATE INDEX IF NOT EXISTS idx_clothing_images_normalized_key ON public.clothing_images(normalized_key);
CREATE INDEX IF NOT EXISTS idx_clothing_images_category ON public.clothing_images(category);
