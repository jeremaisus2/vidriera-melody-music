-- =====================================================================
-- Migración 009 — contenido de demostración de eventos (Etapa H, cont.)
-- =====================================================================
-- Correr una sola vez en el SQL Editor de Supabase, después de la
-- migración 008 ya aplicada. Idempotente.
--
-- `es_demo` en vidriera_eventos, mismo criterio que vidriera_publicaciones/
-- vidriera_codigos_familia: marca eventos creados solo para mostrar la
-- plataforma con contenido real. No hace falta una columna aparte en
-- vidriera_galeria/vidriera_testimonios/vidriera_evento_sponsors: esas filas
-- se borran en cascada junto con el evento (on delete cascade ya definido
-- en db/schema.sql), igual que ya hace eliminarEvento().
--
-- Default false: los eventos ya existentes (contenido real) quedan
-- automáticamente fuera del alcance de "borrar demo", sin backfill manual.
-- Sin política de RLS nueva: columna agregada a una tabla ya cubierta por
-- RLS a nivel de fila (mismo criterio que las migraciones 001/003/007).
-- =====================================================================

alter table vidriera_eventos add column if not exists es_demo boolean not null default false;
