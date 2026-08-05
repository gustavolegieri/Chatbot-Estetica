-- Create profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create subscriptions table
CREATE TABLE public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'inactive',
  plan TEXT DEFAULT 'monthly',
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  current_period_start TIMESTAMP WITH TIME ZONE,
  current_period_end TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create diagnoses table
CREATE TABLE public.diagnoses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  
  -- Photo URLs (stored in storage)
  photo_front_url TEXT,
  photo_side_url TEXT,
  photo_back_url TEXT,
  photo_face_url TEXT,
  
  -- Questionnaire data
  questionnaire JSONB,
  
  -- AI Results
  body_analysis JSONB,
  color_analysis JSONB,
  style_analysis JSONB,
  modeling_analysis JSONB,
  wardrobe_essentials JSONB,
  capsule_wardrobe JSONB,
  final_diagnosis JSONB,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.diagnoses ENABLE ROW LEVEL SECURITY;

-- RLS Policies for profiles
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = user_id);

-- RLS Policies for subscriptions
CREATE POLICY "Users can view own subscription" ON public.subscriptions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own subscription" ON public.subscriptions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own subscription" ON public.subscriptions
  FOR UPDATE USING (auth.uid() = user_id);

-- RLS Policies for diagnoses
CREATE POLICY "Users can view own diagnoses" ON public.diagnoses
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own diagnoses" ON public.diagnoses
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own diagnoses" ON public.diagnoses
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own diagnoses" ON public.diagnoses
  FOR DELETE USING (auth.uid() = user_id);

-- Create function to handle new user profile
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (new.id, new.raw_user_meta_data ->> 'full_name');
  RETURN new;
END;
$$;

-- Trigger for auto-creating profile
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Create storage bucket for photos
INSERT INTO storage.buckets (id, name, public) VALUES ('diagnosis-photos', 'diagnosis-photos', false);

-- Storage policies
CREATE POLICY "Users can upload own photos" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'diagnosis-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can view own photos" ON storage.objects
  FOR SELECT USING (bucket_id = 'diagnosis-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete own photos" ON storage.objects
  FOR DELETE USING (bucket_id = 'diagnosis-photos' AND auth.uid()::text = (storage.foldername(name))[1]);