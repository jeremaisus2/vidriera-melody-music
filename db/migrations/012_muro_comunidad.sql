-- =====================================================================
-- Migración 012 — Módulo "Muro de la comunidad"
-- =====================================================================
-- Correr en el SQL Editor de Supabase. Idempotente (create table if not
-- exists / on conflict do nothing), salvo las políticas de RLS (create
-- policy no admite "if not exists" en Postgres) — si se corre dos veces,
-- borrar antes las políticas de esta migración.
--
-- 100% aditiva: no toca ninguna tabla ni módulo existente.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Catálogo de categorías del muro — GLOBAL, no por academia (mismo
-- criterio que vidriera_categorias: catálogo compartido, en tabla por
-- extensibilidad). A diferencia de vidriera_categorias (fija, sin RLS de
-- escritura), esta SÍ es editable desde el panel de admin (pedido
-- explícito: crear/editar/activar/desactivar/reordenar) — mismo patrón
-- de catálogo soft-delete que vidriera_modulos (Etapa E).
--
-- `id` uuid separado de `clave`: el pedido especificó ambos campos
-- (a diferencia de vidriera_categorias/vidriera_modulos, donde `clave` es
-- la propia PK). `clave` igual queda unique + not null: es lo que
-- referencia vidriera_muro.categoria.
-- ---------------------------------------------------------------------
create table if not exists vidriera_muro_categorias (
  id      uuid primary key default gen_random_uuid(),
  clave   text not null unique,
  nombre  text not null,
  color   text,              -- hex de fondo del tag (ej. "#E9D9CB"); el texto del tag usa un tono de tinta fijo
  activo  boolean not null default true,
  orden   int not null default 0
);

-- Categorías iniciales: las 3 que ya existían hardcodeadas en el mockup de
-- comunidad-melody-landing.html (necesito/ofrezco/agradezco), con los
-- mismos colores que ya usaban sus clases .wall-tag.* — para que cuando se
-- conecte la landing (próxima sesión) el resultado visual sea idéntico al
-- actual, no un cambio de paleta sorpresa.
insert into vidriera_muro_categorias (clave, nombre, color, activo, orden) values
  ('necesito',   'Necesito',   '#E9D9CB', true, 1),
  ('ofrezco',    'Ofrezco',    '#EAE3C4', true, 2),
  ('agradezco',  'Agradezco',  '#DCE6CE', true, 3)
on conflict (clave) do nothing;

-- ---------------------------------------------------------------------
-- Posts del muro — ACADEMIA-scoped (a diferencia de las categorías).
-- `academia_id` no estaba en la lista de campos del pedido original, mismo
-- criterio que el resto de las tablas de contenido del proyecto
-- (vidriera_publicaciones, vidriera_eventos, vidriera_agenda): sin este
-- campo el admin no podría filtrar "los posts de mi academia" ni la RLS
-- podría scopear moderación por academia, que es el patrón que se pidió
-- explícitamente seguir.
--
-- `familia_id` referencia auth.users(id) directo (no
-- vidriera_codigos_familia) — mismo criterio que vidriera_publicaciones.
-- owner_user_id, vidriera_testimonios.user_id, vidriera_rsvp.user_id: la
-- identidad real de quién publica siempre es la cuenta de Supabase Auth,
-- nunca la fila de códigos_familia (que es 1:1 con esa cuenta, pero no es
-- la que usan auth.uid()/RLS).
--
-- Sin `motivo_rechazo`: el pedido original listó los campos explícitos de
-- esta tabla y no lo incluyó (a diferencia de vidriera_publicaciones, que
-- sí lo tiene) — se respetó el schema tal cual se pidió en vez de asumir
-- que hacía falta. Fácil de agregar después con un alter table si se
-- necesita.
-- ---------------------------------------------------------------------
create table if not exists vidriera_muro (
  id          uuid primary key default gen_random_uuid(),
  academia_id uuid not null references vidriera_academias(id) on delete cascade,
  contenido   text not null,
  categoria   text not null references vidriera_muro_categorias(clave),
  familia_id  uuid not null references auth.users(id) on delete cascade,
  estado      text not null default 'pendiente' check (estado in ('pendiente', 'aprobado', 'rechazado')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_vidriera_muro_academia on vidriera_muro(academia_id);
create index if not exists idx_vidriera_muro_estado   on vidriera_muro(estado);
create index if not exists idx_vidriera_muro_familia  on vidriera_muro(familia_id);

-- ---------------------------------------------------------------------
-- RLS — vidriera_muro_categorias
-- Lectura: pública solo de las activas (GET /api/muro/categorias); mismo
-- criterio que vidriera_modulos, cualquier usuario autenticado puede ver
-- el catálogo completo (activas e inactivas) sin filtrar por rol
-- específico, ya que no es información sensible. Escritura: solo admin
-- (no está scopeada por academia porque la tabla no tiene academia_id,
-- ver nota arriba — limitación conocida para cuando convivan varias
-- academias reales en la misma instalación, mismo tipo de limitación ya
-- documentada para otras rutas públicas del proyecto).
-- ---------------------------------------------------------------------
alter table vidriera_muro_categorias enable row level security;

create policy "muro_categorias_select_public"
  on vidriera_muro_categorias for select
  using (activo = true);

create policy "muro_categorias_select_authenticated"
  on vidriera_muro_categorias for select
  using (auth.uid() is not null);

create policy "muro_categorias_write_admin"
  on vidriera_muro_categorias for all
  using (vidriera_rol() = 'admin')
  with check (vidriera_rol() = 'admin');

-- ---------------------------------------------------------------------
-- RLS — vidriera_muro
-- SELECT: público ve solo aprobados; el dueño ve también sus propios
-- pendientes/rechazados (mismo criterio que vidriera_publicaciones);
-- admin ve todo lo de su academia; super_admin ve todo.
-- INSERT: solo cliente autenticado, para su propio familia_id y academia,
-- siempre arranca en 'pendiente'.
-- UPDATE/DELETE: sin políticas de cliente — la moderación (cambiar
-- estado) va por service_role desde el panel de admin, mismo patrón que
-- moderarPublicacion/moderarEdicion.
-- ---------------------------------------------------------------------
alter table vidriera_muro enable row level security;

create policy "muro_select"
  on vidriera_muro for select
  using (
    estado = 'aprobado'
    or familia_id = auth.uid()
    or (
      vidriera_rol() = 'admin'
      and academia_id = vidriera_academia_id()
    )
    or vidriera_rol() = 'super_admin'
  );

create policy "muro_insert_cliente"
  on vidriera_muro for insert
  with check (
    vidriera_rol() = 'cliente'
    and familia_id = auth.uid()
    and academia_id = vidriera_academia_id()
    and estado = 'pendiente'
  );

-- ---------------------------------------------------------------------
-- Alta del módulo en el catálogo (mismo patrón que 010/011). incluido =
-- false (adicional pago, igual que agenda/eventos/sponsors).
-- activo = false para Melody Music a propósito: esta sesión construye
-- solo backend + panel de admin, todavía no conecta con la landing
-- pública (queda para la próxima sesión) — mismo criterio ya usado con
-- Eventos/Sponsors: no se expone en el sidebar hasta que el módulo esté
-- completo de punta a punta. El super-admin puede activarlo en cualquier
-- momento desde su panel sin que haga falta otra migración.
-- ---------------------------------------------------------------------
insert into vidriera_modulos (clave, nombre, descripcion, incluido, orden) values
  ('muro', 'Muro de la comunidad', 'Mensajes de familias (necesito/ofrezco/agradezco) con moderación', false, 8)
on conflict (clave) do nothing;

insert into vidriera_academia_modulos (academia_id, modulo_clave, activo)
select a.id, 'muro', false
from vidriera_academias a
where a.slug = 'melody-music'
on conflict (academia_id, modulo_clave) do nothing;
