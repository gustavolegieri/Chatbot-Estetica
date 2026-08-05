-- Biblioteca de imagens EST ELITE: 2.880 combinações determinísticas.
-- 12 categorias x 6 estilos x 5 biotipos x 4 paletas x 2 variações.
-- A geração das imagens é feita posteriormente pela Edge Function
-- library-generate-batch, que preenche image_url e altera status para done.

with
categories(category, category_label, category_prompt) as (
  values
    ('blusas', 'blusas e tops', 'a blouse or top'),
    ('camisas', 'camisas', 'a tailored shirt'),
    ('calcas', 'calças', 'trousers'),
    ('saias', 'saias', 'a skirt'),
    ('vestidos', 'vestidos', 'a dress'),
    ('blazers', 'blazers', 'a blazer'),
    ('casacos', 'casacos', 'a coat or jacket'),
    ('calcados', 'calçados', 'shoes'),
    ('bolsas', 'bolsas', 'a handbag'),
    ('acessorios', 'acessórios', 'fashion accessories'),
    ('looks_completos', 'looks completos', 'a complete coordinated outfit'),
    ('guarda_roupa_capsula', 'guarda-roupa cápsula', 'a capsule wardrobe outfit')
),
styles(style, style_label, style_prompt) as (
  values
    ('classico', 'clássico', 'classic, polished and timeless'),
    ('romantico', 'romântico', 'romantic, delicate and graceful'),
    ('natural', 'natural', 'natural, relaxed and effortless'),
    ('moderno', 'moderno', 'modern, clean and contemporary'),
    ('dramatico', 'dramático', 'dramatic, structured and high impact'),
    ('criativo', 'criativo', 'creative, artistic and unexpected')
),
body_types(body_type, body_label, body_prompt) as (
  values
    ('ampulheta', 'ampulheta', 'balanced hourglass silhouette'),
    ('triangulo', 'triângulo', 'triangle silhouette with fuller hips'),
    ('triangulo_invertido', 'triângulo invertido', 'inverted triangle silhouette with broader shoulders'),
    ('retangulo', 'retângulo', 'straight rectangle silhouette'),
    ('oval', 'oval', 'soft oval silhouette')
),
palettes(color_season, palette_label, palette_prompt, palette_tags) as (
  values
    ('frios_profundos', 'frios profundos', 'navy blue, cobalt blue, burgundy, plum, charcoal and icy pink', array['azul-marinho','azul-cobalto','bordo','ameixa','chumbo','rosa-gelo']),
    ('neutros_quentes', 'neutros quentes', 'camel, beige, cream, chocolate brown, olive and terracotta', array['caramelo','bege','creme','marrom-chocolate','oliva','terracota']),
    ('rosados_poeticos', 'rosados poéticos', 'blush pink, dusty rose, mauve, lavender, pearl and berry', array['rosa-blush','rosa-antigo','malva','lavanda','perola','framboesa']),
    ('vibrante', 'vibrante', 'true red, royal blue, emerald green, fuchsia, vivid orange and sunny yellow', array['vermelho','azul-royal','verde-esmeralda','fucsia','laranja','amarelo'])
),
variants(variant_index, variant_label, variant_prompt) as (
  values
    (0, 'estúdio', 'clean premium fashion studio photography, neutral background, full garment visible'),
    (1, 'editorial', 'premium lifestyle fashion editorial photography, elegant real-world setting, full outfit visible')
),
seed_rows as (
  select
    c.category,
    s.style,
    b.body_type,
    p.color_season,
    v.variant_index,
    array[
      c.category,
      s.style,
      b.body_type,
      p.color_season,
      v.variant_label,
      'moda-feminina',
      'fotorealista'
    ] || p.palette_tags as tags,
    concat(
      'Photorealistic premium women fashion image featuring ', c.category_prompt,
      '. Style direction: ', s.style_prompt,
      '. Designed to flatter a ', b.body_prompt,
      '. Color palette must be visibly dominated by ', p.palette_prompt,
      '. ', v.variant_prompt,
      '. Brazilian fashion audience, inclusive adult woman, realistic fabric texture, accurate garment construction, elegant styling, no logos, no text, no watermark.'
    ) as prompt
  from categories c
  cross join styles s
  cross join body_types b
  cross join palettes p
  cross join variants v
)
insert into public.library_assets (
  category,
  style,
  body_type,
  color_season,
  variant_index,
  tags,
  prompt,
  image_url,
  status,
  attempts,
  last_error,
  source
)
select
  category,
  style,
  body_type,
  color_season,
  variant_index,
  tags,
  prompt,
  null,
  'pending',
  0,
  null,
  'catalog_seed_v1'
from seed_rows
on conflict (category, style, body_type, color_season, variant_index)
do update set
  tags = excluded.tags,
  prompt = excluded.prompt,
  source = excluded.source,
  updated_at = now();

create index if not exists library_assets_lookup_idx
on public.library_assets (status, category, style, body_type, color_season);

