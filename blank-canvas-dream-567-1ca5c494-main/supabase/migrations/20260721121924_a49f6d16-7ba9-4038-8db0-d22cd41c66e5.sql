
ALTER TABLE public.diagnosis_section_images
  ADD COLUMN IF NOT EXISTS diagnosis_id uuid REFERENCES public.diagnoses(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS query_used text,
  ADD COLUMN IF NOT EXISTS validated boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS validation_reason text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS diagnosis_section_images_diag_section_uidx
  ON public.diagnosis_section_images (diagnosis_id, section)
  WHERE diagnosis_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS diagnosis_section_images_diag_idx
  ON public.diagnosis_section_images (diagnosis_id);

-- Policy: dono do diagnóstico consegue ler as imagens pré-computadas dele.
DROP POLICY IF EXISTS "Owners read section images by diagnosis_id" ON public.diagnosis_section_images;
CREATE POLICY "Owners read section images by diagnosis_id"
  ON public.diagnosis_section_images
  FOR SELECT
  TO authenticated
  USING (
    diagnosis_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.diagnoses d
      WHERE d.id = diagnosis_section_images.diagnosis_id
        AND d.user_id = auth.uid()
    )
  );

GRANT SELECT ON public.diagnosis_section_images TO authenticated;
GRANT ALL ON public.diagnosis_section_images TO service_role;
