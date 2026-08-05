-- Security hardening:
-- 1) Drop the arbitrary SQL execution RPC.
-- 2) Null out any historic hardcoded Mercado Pago credentials in site_settings.
-- 3) Make the diagnosis-photos bucket private and remove public read policy.
DROP FUNCTION IF EXISTS public.exec_sql(text);
DROP FUNCTION IF EXISTS public.exec_sql(sql_query text);

UPDATE public.site_settings
SET value = 'null'::jsonb
WHERE key IN ('mp_access_token','mp_public_key','mp_webhook_secret');

UPDATE storage.buckets SET public = false WHERE id = 'diagnosis-photos';
DROP POLICY IF EXISTS "Public read diagnosis photos" ON storage.objects;
