
-- Add share_token column to diagnoses table
ALTER TABLE public.diagnoses ADD COLUMN share_token text UNIQUE;

-- Create index for fast lookups
CREATE INDEX idx_diagnoses_share_token ON public.diagnoses (share_token) WHERE share_token IS NOT NULL;

-- Allow public read access via share_token (no auth required)
CREATE POLICY "Anyone can view shared diagnoses"
  ON public.diagnoses
  FOR SELECT
  USING (share_token IS NOT NULL AND share_token = share_token);
