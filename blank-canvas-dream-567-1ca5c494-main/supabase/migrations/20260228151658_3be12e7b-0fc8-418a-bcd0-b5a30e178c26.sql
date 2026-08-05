-- Make the diagnosis-photos bucket public so URLs are accessible
UPDATE storage.buckets SET public = true WHERE id = 'diagnosis-photos';

-- Allow authenticated users to upload to their own folder
CREATE POLICY "Users can upload their own photos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'diagnosis-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Allow public read access (bucket is public)
CREATE POLICY "Public read access for diagnosis photos"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'diagnosis-photos');

-- Allow users to update/overwrite their own photos
CREATE POLICY "Users can update their own photos"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'diagnosis-photos' AND (storage.foldername(name))[1] = auth.uid()::text);
