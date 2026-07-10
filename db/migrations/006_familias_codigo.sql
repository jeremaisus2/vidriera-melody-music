-- =====================================================================
-- Migración 006 — códigos de acceso para familias (panel admin, sección
-- "Familias")
-- =====================================================================
-- Correr una sola vez en el SQL Editor de Supabase, después de las
-- migraciones 001-005 ya aplicadas. Idempotente.
--
-- Reemplaza el alta 100% manual por script (crear-usuario.mjs) por un
-- flujo desde el panel de admin: el admin elige un nombre identificador
-- ("Familia Gómez") y un código ("gomezmelody"), y el backend crea por
-- detrás una cuenta real de Supabase Auth con un email técnico invisible
-- para el usuario. La familia entra en el frontend público con SOLO el
-- código (un único campo) — el backend resuelve a qué cuenta corresponde.
--
-- vidriera_codigos_familia guarda el código EN TEXTO PLANO a propósito,
-- para que el admin pueda visualizarlo después (no solo al crearlo) sin
-- tener que resetearlo. Es una decisión consciente de simplicidad sobre
-- seguridad — ver ARQUITECTURA.md (nueva sección) para la justificación
-- completa. Por eso esta tabla NO tiene ninguna política de RLS (ni
-- siquiera de SELECT): solo service_role (que bypassa RLS) puede tocarla,
-- igual que vidriera_perfiles con las escrituras.
--
-- "Dar de baja" no borra la fila ni el usuario de Supabase Auth (las
-- publicaciones de esa familia quedan intactas, referenciando el mismo
-- owner_user_id) — pone activo=false Y banea la cuenta real en Supabase
-- Auth (ban_duration, ver src/repos/familias.repo.js) como defensa en
-- profundidad, para que ni siquiera un acceso directo a la API de Supabase
-- Auth con el código viejo funcione.
-- =====================================================================

create table if not exists vidriera_codigos_familia (
  id             uuid primary key default gen_random_uuid(),
  academia_id    uuid not null references vidriera_academias(id) on delete cascade,
  user_id        uuid not null unique references auth.users(id) on delete cascade,
  nombre_familia text not null,
  codigo         text not null unique,
  activo         boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists idx_vidriera_codigos_familia_academia on vidriera_codigos_familia(academia_id);

alter table vidriera_codigos_familia enable row level security;

-- Sin políticas de SELECT/INSERT/UPDATE/DELETE a propósito: con RLS
-- habilitado y cero políticas, PostgREST deniega todo acceso a anon y
-- authenticated por default — solo service_role (que bypassa RLS) puede
-- leer o escribir esta tabla. Ni siquiera el propio admin la consulta con
-- su JWT: el panel de admin siempre pasa por el backend con
-- supabaseAdmin, mismo criterio que vidriera_perfiles (que tampoco tiene
-- políticas de escritura por la misma razón: evitar cualquier superficie
-- de acceso directo a datos sensibles).
