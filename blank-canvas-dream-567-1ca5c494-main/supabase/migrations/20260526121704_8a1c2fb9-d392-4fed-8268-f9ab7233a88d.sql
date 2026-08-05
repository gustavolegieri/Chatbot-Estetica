create or replace function public.update_updated_at_column()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.library_assets (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  style text not null,
  body_type text not null,
  color_season text not null,
  variant_index int not null default 0,
  tags text[] not null default '{}',
  prompt text not null,
  image_url text,
  status text not null default 'pending',
  attempts int not null default 0,
  last_error text,
  source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint library_assets_combo_unique unique (category, style, body_type, color_season, variant_index)
);

create index if not exists library_assets_status_idx on public.library_assets (status);
create index if not exists library_assets_category_idx on public.library_assets (category);

alter table public.library_assets enable row level security;

drop policy if exists "Anyone can view library_assets" on public.library_assets;
create policy "Anyone can view library_assets"
on public.library_assets for select
to public
using (true);

drop policy if exists "Admins can manage library_assets" on public.library_assets;
create policy "Admins can manage library_assets"
on public.library_assets for all
to authenticated
using (public.has_role(auth.uid(), 'admin'::app_role))
with check (public.has_role(auth.uid(), 'admin'::app_role));

drop trigger if exists library_assets_set_updated_at on public.library_assets;
create trigger library_assets_set_updated_at
before update on public.library_assets
for each row execute function public.update_updated_at_column();

insert into storage.buckets (id, name, public)
values ('library-assets', 'library-assets', true)
on conflict (id) do update set public = true;

drop policy if exists "Library assets are publicly readable" on storage.objects;
create policy "Library assets are publicly readable"
on storage.objects for select
to public
using (bucket_id = 'library-assets');