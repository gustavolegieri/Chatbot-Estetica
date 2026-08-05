ALTER TABLE public.diagnosis_section_images
  ADD COLUMN IF NOT EXISTS signature_style text,
  ADD COLUMN IF NOT EXISTS signature_color text,
  ADD COLUMN IF NOT EXISTS signature_fabric text;

CREATE INDEX IF NOT EXISTS diagnosis_section_images_signature_idx
  ON public.diagnosis_section_images
  (diagnosis_id, signature_style, signature_color, signature_fabric);

-- Entries from the old style+color cache are not deleted. The semantic_v2
-- namespace makes them unreachable while preserving rollback safety.
