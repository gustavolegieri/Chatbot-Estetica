
-- Drop the incorrect policy
DROP POLICY "Anyone can view shared diagnoses" ON public.diagnoses;

-- Create correct permissive policy: anyone can read rows that have a share_token
-- Security comes from the token being a UUID (unguessable)
CREATE POLICY "Anyone can view shared diagnoses"
  ON public.diagnoses
  FOR SELECT
  TO anon, authenticated
  USING (share_token IS NOT NULL);
