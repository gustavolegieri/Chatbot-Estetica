-- Add processing_step column to track progress
ALTER TABLE public.diagnoses ADD COLUMN IF NOT EXISTS processing_step text DEFAULT null;

-- Enable realtime for diagnoses table
ALTER PUBLICATION supabase_realtime ADD TABLE public.diagnoses;