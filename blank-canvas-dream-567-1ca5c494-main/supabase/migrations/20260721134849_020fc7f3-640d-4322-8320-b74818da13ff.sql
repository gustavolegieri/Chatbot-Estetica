DROP INDEX IF EXISTS public.diagnosis_section_images_diag_section_uidx;

CREATE UNIQUE INDEX IF NOT EXISTS diagnosis_section_images_diag_section_variant_uidx
  ON public.diagnosis_section_images (diagnosis_id, section, variant)
  WHERE diagnosis_id IS NOT NULL;