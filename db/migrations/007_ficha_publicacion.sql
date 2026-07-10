-- =====================================================================
-- Migración 007 — ampliación de la ficha de publicación: logo, sitio web,
-- Instagram, dirección
-- =====================================================================
-- Correr una sola vez en el SQL Editor de Supabase, después de las
-- migraciones 001-006 ya aplicadas. Idempotente.
--
-- Los 4 campos son opcionales (nullable, sin backfill) — incluida
-- `logo_url`: aunque es un dato separado de `imagen_url` (portada), no se
-- exige en las publicaciones ya existentes ni se valida como requerido en
-- el backend por ahora. El frontend público (vidriera.js) ya está
-- preparado para mostrar la tarjeta con o sin logo sin romper el layout.
--
-- No hace falta tocar policies.sql: son columnas nuevas en una tabla que
-- ya tiene RLS a nivel de fila (no de columna) — las políticas existentes
-- (pub_select, pub_insert_cliente, pub_update_owner) siguen aplicando sin
-- cambios, mismo criterio que las migraciones 001 y 003.
-- =====================================================================

alter table vidriera_publicaciones add column if not exists logo_url  text;
alter table vidriera_publicaciones add column if not exists sitio_web text;
alter table vidriera_publicaciones add column if not exists instagram text;
alter table vidriera_publicaciones add column if not exists direccion text;
