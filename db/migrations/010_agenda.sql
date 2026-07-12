-- =====================================================================
-- Migración 010 — Módulo "Agenda" (landing pública "Comunidad Melody")
-- =====================================================================
-- Correr una sola vez en el SQL Editor de Supabase. Idempotente (create
-- table if not exists / on conflict do nothing), salvo las políticas de
-- RLS (create policy no admite "if not exists" en Postgres) — si se
-- corre dos veces, comentar/borrar las 2 policies antes de re-crearlas.
--
-- Tabla nueva, 100% aditiva: no toca ninguna tabla existente. Sigue la
-- convención de prefijo `vidriera_` y el mismo patrón de RLS que
-- vidriera_eventos (lectura pública, escritura solo admin de la propia
-- academia vía vidriera_rol()/vidriera_academia_id(), ya definidas en
-- db/policies.sql).
--
-- `orden` (int, not null default 0): a diferencia de vidriera_publicaciones
-- (donde `orden` nullable "cae" a created_at desc), acá el pedido es que
-- el orden por defecto sea cronológico (fecha asc) y `orden` sirva solo
-- de desempate manual entre eventos del mismo día — por eso NOT NULL con
-- default 0, sin el patrón "null = sin ordenar". GET /api/agenda ordena
-- por fecha asc, orden asc.
-- =====================================================================

create table if not exists vidriera_agenda (
  id          uuid primary key default gen_random_uuid(),
  academia_id uuid not null references vidriera_academias(id) on delete cascade,
  titulo      text not null,
  lugar       text not null,
  fecha       date not null,
  hora        time not null,
  orden       int not null default 0,
  activo      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_vidriera_agenda_academia on vidriera_agenda(academia_id);
create index if not exists idx_vidriera_agenda_fecha    on vidriera_agenda(fecha);

-- ---------------------------------------------------------------------
-- RLS: lectura pública solo de filas activas; escritura solo admin de
-- la propia academia (mismo criterio que vidriera_eventos).
-- ---------------------------------------------------------------------
alter table vidriera_agenda enable row level security;

create policy "agenda_select_public"
  on vidriera_agenda for select
  using (activo = true);

create policy "agenda_write_admin"
  on vidriera_agenda for all
  using (
    vidriera_rol() = 'admin'
    and academia_id = vidriera_academia_id()
  )
  with check (
    vidriera_rol() = 'admin'
    and academia_id = vidriera_academia_id()
  );

-- ---------------------------------------------------------------------
-- Alta del módulo en el catálogo (mismo patrón que db/seed.sql).
-- `incluido = false`: adicional pago, igual que galería/estadísticas/QR;
-- el super-admin lo activa por academia desde "Configuración de la
-- plataforma" (Etapa E), no queda activado automáticamente para nadie.
-- ---------------------------------------------------------------------
insert into vidriera_modulos (clave, nombre, descripcion, incluido, orden) values
  ('agenda', 'Agenda de la comunidad', 'Eventos de la landing pública "Comunidad Melody"', false, 5)
on conflict (clave) do nothing;
