-- =====================================================================
-- Vidriera Melody Music — Esquema de base de datos
-- Prefijo de tablas: vidriera_  (convención GIZA: acad_, nieve_, vidriera_)
-- Proyecto Supabase compartido con otros productos; el prefijo aísla el dominio.
-- Referencias a auth.users (Supabase Auth) para la identidad.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Academias (clientes de la plataforma)
-- El campo modulos_activos existe desde el inicio (recomendación de la spec)
-- para no rehacer la estructura al vender el segundo módulo.
-- ---------------------------------------------------------------------
create table if not exists vidriera_academias (
  id            uuid primary key default gen_random_uuid(),
  nombre        text not null,
  slug          text unique not null,
  estado        text not null default 'activa' check (estado in ('activa', 'pausada')),
  modulos_activos jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),  -- antigüedad como cliente
  updated_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Catálogo de módulos (definición estable; la activación vive por academia)
-- ---------------------------------------------------------------------
create table if not exists vidriera_modulos (
  clave         text primary key,             -- ej: 'vidriera', 'galeria', 'estadisticas', 'qr'
  nombre        text not null,
  descripcion   text,
  incluido      boolean not null default false, -- true = plan base; false = adicional pago
  orden         int not null default 0
);

-- Activación de módulos por academia (tabla relacional, complementa modulos_activos)
create table if not exists vidriera_academia_modulos (
  academia_id   uuid not null references vidriera_academias(id) on delete cascade,
  modulo_clave  text not null references vidriera_modulos(clave) on delete cascade,
  activo        boolean not null default true,
  activado_at   timestamptz not null default now(),
  primary key (academia_id, modulo_clave)
);

-- ---------------------------------------------------------------------
-- Perfiles: mapea un usuario de Supabase Auth a su rol y academia
-- Roles: cliente (familia) | admin (academia) | super_admin (GIZA)
-- super_admin no está atado a una academia (academia_id null).
-- ---------------------------------------------------------------------
create table if not exists vidriera_perfiles (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  academia_id   uuid references vidriera_academias(id) on delete set null,
  rol           text not null check (rol in ('cliente', 'admin', 'super_admin')),
  nombre        text,
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Categorías de la vidriera (fijas por ahora, en tabla por extensibilidad)
-- ---------------------------------------------------------------------
create table if not exists vidriera_categorias (
  clave         text primary key,
  nombre        text not null,
  orden         int not null default 0
);

-- ---------------------------------------------------------------------
-- Publicaciones de emprendimientos
-- El dato PÚBLICO vive acá. Las ediciones sobre una publicación aprobada
-- NO pisan estas columnas: van a vidriera_publicaciones_ediciones.
-- ---------------------------------------------------------------------
create table if not exists vidriera_publicaciones (
  id             uuid primary key default gen_random_uuid(),
  academia_id    uuid not null references vidriera_academias(id) on delete cascade,
  owner_user_id  uuid not null references auth.users(id) on delete cascade,
  nombre         text not null,
  categoria      text not null references vidriera_categorias(clave),
  descripcion    text,
  imagen_url     text,
  whatsapp       text,
  estado         text not null default 'pending' check (estado in ('pending', 'approved', 'rejected')),
  motivo_rechazo text,
  vistas         bigint not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists idx_vidriera_pub_academia on vidriera_publicaciones(academia_id);
create index if not exists idx_vidriera_pub_estado on vidriera_publicaciones(estado);
create index if not exists idx_vidriera_pub_owner on vidriera_publicaciones(owner_user_id);

-- Ediciones propuestas sobre una publicación (aprobada o no): quedan en revisión.
-- Al aprobar, se aplican los campos sobre vidriera_publicaciones.
create table if not exists vidriera_publicaciones_ediciones (
  id             uuid primary key default gen_random_uuid(),
  publicacion_id uuid not null references vidriera_publicaciones(id) on delete cascade,
  autor_user_id  uuid not null references auth.users(id) on delete cascade,
  cambios        jsonb not null,   -- { nombre, categoria, descripcion, imagen_url, whatsapp }
  estado         text not null default 'pending' check (estado in ('pending', 'approved', 'rejected')),
  motivo_rechazo text,
  created_at     timestamptz not null default now(),
  resuelto_at    timestamptz
);

create index if not exists idx_vidriera_edic_estado on vidriera_publicaciones_ediciones(estado);

-- ---------------------------------------------------------------------
-- Eventos del calendario
-- ---------------------------------------------------------------------
create table if not exists vidriera_eventos (
  id            uuid primary key default gen_random_uuid(),
  academia_id   uuid not null references vidriera_academias(id) on delete cascade,
  nombre        text not null,
  tipo          text check (tipo in ('concierto', 'muestra', 'examen')),
  fecha         timestamptz not null,
  descripcion   text,
  qr_url        text,                -- QR generado para compartir por WhatsApp
  created_at    timestamptz not null default now()
);

create index if not exists idx_vidriera_eventos_academia on vidriera_eventos(academia_id);
create index if not exists idx_vidriera_eventos_fecha on vidriera_eventos(fecha);

-- Sponsors por evento: emprendimientos que acompañan un concierto/muestra puntual.
-- Base del "destacado rotativo" (se destaca a quien participa del evento vigente).
create table if not exists vidriera_evento_sponsors (
  evento_id      uuid not null references vidriera_eventos(id) on delete cascade,
  publicacion_id uuid not null references vidriera_publicaciones(id) on delete cascade,
  primary key (evento_id, publicacion_id)
);

-- RSVP simple (confirmación de asistencia por familia)
create table if not exists vidriera_rsvp (
  evento_id  uuid not null references vidriera_eventos(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  asiste     boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (evento_id, user_id)
);

-- Reacciones simples por evento ("voy a asistir" / "nos encantó")
create table if not exists vidriera_reacciones (
  evento_id  uuid not null references vidriera_eventos(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  tipo       text not null check (tipo in ('voy_a_asistir', 'nos_encanto')),
  created_at timestamptz not null default now(),
  primary key (evento_id, user_id, tipo)
);

-- Galería de fotos de eventos pasados
create table if not exists vidriera_galeria (
  id         uuid primary key default gen_random_uuid(),
  evento_id  uuid not null references vidriera_eventos(id) on delete cascade,
  imagen_url text not null,
  orden      int not null default 0,
  created_at timestamptz not null default now()
);

-- Testimonios breves de familias, vinculados a un evento
create table if not exists vidriera_testimonios (
  id         uuid primary key default gen_random_uuid(),
  evento_id  uuid not null references vidriera_eventos(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  texto      text not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Nota sobre RLS:
-- En Supabase conviene activar Row Level Security en estas tablas y escribir
-- políticas por rol (cliente ve/edita lo suyo, admin su academia, super_admin todo).
-- El backend usa service_role para moderación; el cliente por-usuario respeta RLS.
-- Las políticas se definen en db/policies.sql (pendiente).
-- ---------------------------------------------------------------------
