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
  orden         int not null default 0,
  activo        boolean not null default true  -- false = dado de baja (Etapa E). No se borra la
                                                -- fila para no romper la FK de academia_modulos
                                                -- de clientes que ya lo tengan activado.
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
  familia        text not null,   -- nombre de la familia dueña del emprendimiento (ej. "Familia Restrepo")
  categoria      text not null references vidriera_categorias(clave),
  descripcion    text,
  imagen_url     text,             -- imagen de portada de la tarjeta
  logo_url       text,             -- ícono/logo cuadrado del negocio, separado de la portada (opcional)
  sitio_web      text,             -- opcional
  instagram      text,             -- opcional
  direccion      text,             -- opcional
  whatsapp       text,
  es_demo        boolean not null default false, -- contenido de demostración (Etapa H) — borrable de una vez
  estado         text not null default 'pending' check (estado in ('pending', 'approved', 'rejected')),
  motivo_rechazo text,
  vistas         bigint not null default 0,
  orden          integer,          -- orden manual en la grilla pública (admin, Etapa C). null = sin ordenar
                                    -- a mano todavía; se ordena por created_at desc como antes.
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists idx_vidriera_pub_academia on vidriera_publicaciones(academia_id);
create index if not exists idx_vidriera_pub_estado on vidriera_publicaciones(estado);
create index if not exists idx_vidriera_pub_owner on vidriera_publicaciones(owner_user_id);

-- destacado_override_id vive en vidriera_academias pero se declara acá (con
-- alter, no inline en el create table de arriba) porque vidriera_academias se
-- define antes que vidriera_publicaciones en este archivo y la FK necesita
-- que la tabla referenciada ya exista.
alter table vidriera_academias
  add column if not exists destacado_override_id uuid references vidriera_publicaciones(id) on delete set null;
-- Anulación puntual del destacado rotativo (Etapa C, panel admin): si está
-- seteado, el admin fijó manualmente qué publicación se muestra en el banner
-- destacado de la vidriera pública, en vez de la rotación automática por
-- evento próximo. null = comportamiento automático (default).

-- Ediciones propuestas sobre una publicación (aprobada o no): quedan en revisión.
-- Al aprobar, se aplican los campos sobre vidriera_publicaciones.
create table if not exists vidriera_publicaciones_ediciones (
  id             uuid primary key default gen_random_uuid(),
  publicacion_id uuid not null references vidriera_publicaciones(id) on delete cascade,
  autor_user_id  uuid not null references auth.users(id) on delete cascade,
  cambios        jsonb not null,   -- { nombre, categoria, descripcion, imagen_url, logo_url, sitio_web, instagram, direccion, whatsapp }
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
  lugar         text,            -- lugar/salón del evento (opcional: eventos virtuales pueden omitirlo)
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
  familia    text not null,   -- nombre de familia a mostrar junto a la cita (ej. "Familia Gómez")
  texto      text not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Textos fijos editables de la vidriera pública (panel admin, Etapa D)
-- El catálogo de claves válidas (títulos/subtítulos de sección) está fijo en
-- código, src/repos/textos.repo.js — esta tabla solo guarda las
-- personalizaciones. Si una clave no tiene fila acá todavía, el backend usa
-- el valor por defecto del catálogo. No hay forma de crear/borrar claves
-- desde el panel: solo editar el contenido de las que ya existen.
-- `negrita` es un flag derivado (true si `contenido` tiene algún **negrita**
-- aplicado), se recalcula en cada guardado — no es editable directamente.
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- Configuración general de la plataforma (panel super-admin, Etapa E)
-- Ajustes globales, no por cliente. Patrón singleton: una sola fila
-- posible (id fijo en 1, con check), a diferencia de vidriera_textos
-- (key/value) porque acá el set de campos es chico y fijo.
-- ---------------------------------------------------------------------
create table if not exists vidriera_config_plataforma (
  id                smallint primary key default 1 check (id = 1),
  nombre_plataforma text not null default 'GIZA',
  email_soporte     text,
  updated_at        timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Códigos de acceso de familias (panel admin, sección "Familias")
-- Reemplaza el alta 100% manual por script: el admin elige un nombre
-- identificador y un código; el backend crea por detrás una cuenta real
-- de Supabase Auth con un email técnico invisible para el usuario
-- (ver src/repos/familias.repo.js). `codigo` se guarda EN TEXTO PLANO a
-- propósito para que el admin lo pueda visualizar después, no solo al
-- crearlo — decisión consciente de simplicidad sobre seguridad, ver
-- ARQUITECTURA.md. `activo=false` (dar de baja) no borra la fila ni el
-- usuario de Auth (las publicaciones de la familia quedan intactas);
-- también banea la cuenta real en Supabase Auth como defensa en
-- profundidad.
-- ---------------------------------------------------------------------
create table if not exists vidriera_codigos_familia (
  id             uuid primary key default gen_random_uuid(),
  academia_id    uuid not null references vidriera_academias(id) on delete cascade,
  user_id        uuid not null unique references auth.users(id) on delete cascade,
  nombre_familia text not null,
  codigo         text not null unique,
  activo         boolean not null default true,
  es_demo        boolean not null default false, -- contenido de demostración (Etapa H) — borrable de una vez
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists idx_vidriera_codigos_familia_academia on vidriera_codigos_familia(academia_id);

-- ---------------------------------------------------------------------
-- Nota sobre RLS:
-- En Supabase conviene activar Row Level Security en estas tablas y escribir
-- políticas por rol (cliente ve/edita lo suyo, admin su academia, super_admin todo).
-- El backend usa service_role para moderación; el cliente por-usuario respeta RLS.
-- Las políticas se definen en db/policies.sql (pendiente).
-- ---------------------------------------------------------------------
