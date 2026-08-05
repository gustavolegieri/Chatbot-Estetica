alter table public.diagnosis_image_assignments
  add column if not exists color_pixel_validated boolean not null default false,
  add column if not exists color_coverage numeric(7, 6),
  add column if not exists color_component_coverage numeric(7, 6),
  add column if not exists sampled_color text,
  add column if not exists validation_version text;

alter table public.diagnosis_image_assignments
  drop constraint if exists diagnosis_image_assignments_sampled_color_check;

alter table public.diagnosis_image_assignments
  add constraint diagnosis_image_assignments_sampled_color_check
  check (sampled_color is null or sampled_color ~ '^#[0-9A-Fa-f]{6}$');

create index if not exists diagnosis_image_assignments_pixel_validation_idx
  on public.diagnosis_image_assignments (diagnosis_id, validation_version, color_pixel_validated);

comment on column public.diagnosis_image_assignments.color_pixel_validated is
  'True only when the requested color was measured in the target garment ROI pixels.';

comment on column public.diagnosis_image_assignments.validation_version is
  'Visual validation contract version. Current value: pixel-color-v1.';
