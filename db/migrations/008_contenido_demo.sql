-- =====================================================================
-- Migración 008 — contenido de demostración (Etapa H)
-- =====================================================================
-- Correr una sola vez en el SQL Editor de Supabase, después de las
-- migraciones 001-007 ya aplicadas. Idempotente.
--
-- `es_demo` marca publicaciones y familias creadas solo para mostrar la
-- plataforma con contenido real (no son datos de un cliente real). Permite
-- identificar y borrar todo el paquete demo de una sola vez desde el panel
-- de super-admin ("Configuración de la plataforma" → "Borrar datos de
-- demostración"), sin tener que adivinar cuáles filas son demo por nombre
-- o por fecha.
--
-- Default false en ambas: las filas ya existentes (contenido real) quedan
-- automáticamente fuera del alcance de "borrar demo", sin backfill manual.
-- =====================================================================

alter table vidriera_publicaciones    add column if not exists es_demo boolean not null default false;
alter table vidriera_codigos_familia  add column if not exists es_demo boolean not null default false;
