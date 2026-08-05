DROP INDEX IF EXISTS public.idx_clothing_images_unique_normalized_key;
DROP INDEX IF EXISTS public.idx_clothing_images_diagnosis_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_clothing_images_unique_diagnosis_key
  ON public.clothing_images(diagnosis_id, normalized_key)
  WHERE normalized_key IS NOT NULL;