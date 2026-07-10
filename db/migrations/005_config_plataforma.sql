-- =====================================================================
-- Migración 005 — configuración general de la plataforma + catálogo de
-- módulos editable (Etapa E, panel super-admin — "Configuración de la
-- plataforma")
-- =====================================================================
-- Correr una sola vez en el SQL Editor de Supabase, después de las
-- migraciones 001-004 ya aplicadas. Idempotente.
--
-- 1. vidriera_modulos gana una columna `activo` (soft delete): antes el
--    catálogo era fijo en el seed, ahora se puede crear/editar/dar de baja
--    desde el panel. "Dar de baja" NO borra la fila (evitaría romper la FK
--    de vidriera_academia_modulos.modulo_clave para clientes que ya lo
--    tengan activado) — solo pone activo=false, y el backend deja de
--    ofrecerlo para nuevas activaciones (ver getModulosAcademia en
--    src/repos/superadmin.repo.js).
--
-- 2. Tabla nueva vidriera_config_plataforma: ajustes globales (no por
--    cliente). Patrón singleton (id fijo en 1, con check) en vez de
--    key/value como vidriera_textos — acá el set de campos es chico y fijo
--    (nombre de la plataforma, email de soporte), no un catálogo abierto.
--    Sí necesita su propio RLS (tabla nueva) — ver también el bloque
--    agregado en db/policies.sql.
-- =====================================================================

alter table vidriera_modulos add column if not exists activo boolean not null default true;

create table if not exists vidriera_config_plataforma (
  id                smallint primary key default 1 check (id = 1),  -- singleton: una sola fila posible
  nombre_plataforma text not null default 'GIZA',
  email_soporte     text,
  updated_at        timestamptz not null default now()
);

insert into vidriera_config_plataforma (id) values (1)
on conflict (id) do nothing;

alter table vidriera_config_plataforma enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'vidriera_config_plataforma' and policyname = 'config_plataforma_select_superadmin'
  ) then
    create policy "config_plataforma_select_superadmin"
      on vidriera_config_plataforma for select
      using (vidriera_rol() = 'super_admin');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'vidriera_config_plataforma' and policyname = 'config_plataforma_write_superadmin'
  ) then
    create policy "config_plataforma_write_superadmin"
      on vidriera_config_plataforma for all
      using (vidriera_rol() = 'super_admin')
      with check (vidriera_rol() = 'super_admin');
  end if;
end $$;
