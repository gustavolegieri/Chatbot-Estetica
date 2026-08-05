-- Keep personal diagnosis photos private while restoring authenticated uploads.
INSERT INTO storage.buckets (id, name, public)
VALUES ('diagnosis-photos', 'diagnosis-photos', false)
ON CONFLICT (id) DO UPDATE SET public = false;

DROP POLICY IF EXISTS "Users can upload own photos" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload their own photos" ON storage.objects;
DROP POLICY IF EXISTS "Users upload own photos" ON storage.objects;
DROP POLICY IF EXISTS "Users can view own photos" ON storage.objects;
DROP POLICY IF EXISTS "Users view own photos" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own photos" ON storage.objects;
DROP POLICY IF EXISTS "Users update own photos" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own photos" ON storage.objects;
DROP POLICY IF EXISTS "Users delete own photos" ON storage.objects;
DROP POLICY IF EXISTS "Public read access for diagnosis photos" ON storage.objects;
DROP POLICY IF EXISTS "Public read diagnosis photos" ON storage.objects;
DROP POLICY IF EXISTS "Diagnosis photo owners insert" ON storage.objects;
DROP POLICY IF EXISTS "Diagnosis photo owners read" ON storage.objects;
DROP POLICY IF EXISTS "Diagnosis photo owners update" ON storage.objects;
DROP POLICY IF EXISTS "Diagnosis photo owners delete" ON storage.objects;

CREATE POLICY "Diagnosis photo owners insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'diagnosis-photos'
  AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
);

CREATE POLICY "Diagnosis photo owners read"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'diagnosis-photos'
  AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
);

CREATE POLICY "Diagnosis photo owners update"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'diagnosis-photos'
  AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
)
WITH CHECK (
  bucket_id = 'diagnosis-photos'
  AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
);

CREATE POLICY "Diagnosis photo owners delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'diagnosis-photos'
  AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
);
