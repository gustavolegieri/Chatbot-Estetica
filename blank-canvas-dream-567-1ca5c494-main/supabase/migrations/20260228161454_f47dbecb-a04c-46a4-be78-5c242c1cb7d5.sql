-- Drop the overly permissive public read policy
DROP POLICY IF EXISTS "Anyone can view settings" ON public.site_settings;

-- Create a restricted public read policy that excludes sensitive keys
CREATE POLICY "Anyone can view non-sensitive settings"
ON public.site_settings
FOR SELECT
USING (
  key NOT IN ('stripe_secret_key', 'stripe_webhook_secret')
);

-- Add admin policy for subscriptions management
CREATE POLICY "Admins can manage subscriptions"
ON public.subscriptions
FOR ALL
USING (has_role(auth.uid(), 'admin'))
WITH CHECK (has_role(auth.uid(), 'admin'));

-- Add unique constraint on subscriptions.user_id for upsert operations
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'subscriptions_user_id_key'
  ) THEN
    ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_user_id_key UNIQUE (user_id);
  END IF;
END $$;