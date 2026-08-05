-- Reserva atômica de fotografias por posição do diagnóstico.
-- Impede que chamadas paralelas atribuam a mesma foto a peças diferentes.
create table if not exists public.diagnosis_image_assignments (
  id uuid primary key default gen_random_uuid(),
  diagnosis_id uuid not null references public.diagnoses(id) on delete cascade,
  asset_identity text not null,
  section text not null,
  piece_name text,
  category text,
  image_url text not null,
  image_canonical text not null,
  provider text not null,
  query_used text not null,
  semantic_score integer not null check (semantic_score between 0 and 100),
  content_type text,
  matched_terms text[] not null default '{}',
  matched_color_terms text[] not null default '{}',
  matched_fabric_terms text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (diagnosis_id, asset_identity),
  unique (diagnosis_id, image_canonical)
);

create index if not exists diagnosis_image_assignments_diagnosis_idx
  on public.diagnosis_image_assignments (diagnosis_id, section);

alter table public.diagnosis_image_assignments enable row level security;

drop policy if exists "Users can read own diagnosis image assignments" on public.diagnosis_image_assignments;
create policy "Users can read own diagnosis image assignments"
  on public.diagnosis_image_assignments
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.diagnoses d
      where d.id = diagnosis_image_assignments.diagnosis_id
        and d.user_id = auth.uid()
    )
  );

comment on table public.diagnosis_image_assignments is
  'Photographs validated as real raster images and atomically reserved per diagnosis visual slot.';
