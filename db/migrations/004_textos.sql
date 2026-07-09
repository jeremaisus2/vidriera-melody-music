-- =====================================================================
-- Migración 004 — textos fijos editables de la vidriera pública (Etapa D,
-- panel admin — sección "Textos de la página")
-- =====================================================================
-- Correr una sola vez en el SQL Editor de Supabase, después de las
-- migraciones 001-003 ya aplicadas. Idempotente.
--
-- A diferencia de las migraciones 001-003 (que solo agregaban columnas a
-- tablas ya existentes y cubiertas por policies.sql), esta crea una tabla
-- NUEVA: sí necesita su propio RLS. Ver también el bloque agregado en
-- db/policies.sql ("vidriera_textos") para que quede documentado ahí.
-- =====================================================================

create table if not exists vidriera_textos (
  id           uuid primary key default gen_random_uuid(),
  academia_id  uuid not null references vidriera_academias(id) on delete cascade,
  clave        text not null,
  contenido    text not null,
  negrita      boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (academia_id, clave)
);

alter table vidriera_textos enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'vidriera_textos' and policyname = 'textos_select_public'
  ) then
    create policy "textos_select_public"
      on vidriera_textos for select
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'vidriera_textos' and policyname = 'textos_write_admin'
  ) then
    create policy "textos_write_admin"
      on vidriera_textos for all
      using (vidriera_rol() = 'admin' and academia_id = vidriera_academia_id())
      with check (vidriera_rol() = 'admin' and academia_id = vidriera_academia_id());
  end if;
end $$;
