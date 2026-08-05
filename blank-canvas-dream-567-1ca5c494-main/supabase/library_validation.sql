-- Deve retornar 2.880 registros e nenhuma combinação duplicada.
select
  count(*) as total,
  count(*) filter (where status = 'done' and image_url is not null) as prontas,
  count(*) filter (where status = 'pending') as pendentes,
  count(*) filter (where status = 'failed') as falhas,
  count(distinct category) as categorias,
  count(distinct style) as estilos,
  count(distinct body_type) as biotipos,
  count(distinct color_season) as paletas
from public.library_assets
where source = 'catalog_seed_v1';

-- Esperado: zero linhas.
select category, style, body_type, color_season, variant_index, count(*)
from public.library_assets
where source = 'catalog_seed_v1'
group by category, style, body_type, color_season, variant_index
having count(*) > 1;

-- Cobertura esperada: 240 itens por categoria.
select category, count(*) as total
from public.library_assets
where source = 'catalog_seed_v1'
group by category
order by category;

-- Cobertura esperada: 720 itens por paleta.
select color_season, count(*) as total
from public.library_assets
where source = 'catalog_seed_v1'
group by color_season
order by color_season;

-- URLs duplicadas só são verificadas entre imagens já concluídas.
select image_url, count(*) as usos
from public.library_assets
where source = 'catalog_seed_v1'
  and status = 'done'
  and image_url is not null
group by image_url
having count(*) > 1
order by usos desc;

