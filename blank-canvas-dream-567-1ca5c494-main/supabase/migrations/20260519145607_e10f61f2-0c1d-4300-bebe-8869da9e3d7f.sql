-- Limpa tudo que é cache/armazenado das abas Guarda-Roupa e Essenciais
TRUNCATE TABLE public.clothing_images;
TRUNCATE TABLE public.look_images;
TRUNCATE TABLE public.look_recommendations;

-- Garante que toda imagem futura seja vinculada ao diagnóstico (sem reuso global)
ALTER TABLE public.clothing_images
  ALTER COLUMN diagnosis_id SET NOT NULL;

-- Índice para busca eficiente por diagnóstico
CREATE INDEX IF NOT EXISTS idx_clothing_images_diagnosis
  ON public.clothing_images(diagnosis_id);

CREATE INDEX IF NOT EXISTS idx_clothing_images_diagnosis_key
  ON public.clothing_images(diagnosis_id, normalized_key);