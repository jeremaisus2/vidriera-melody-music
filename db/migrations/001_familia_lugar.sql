-- =====================================================================
-- Migración 001 — familia (publicaciones, testimonios) + lugar (eventos)
-- =====================================================================
-- Completa tres gaps detectados al implementar el frontend de la vidriera
-- (ver ESTADO.md, sesión 2026-07-09 #6): las tarjetas de negocio y los
-- testimonios no tenían nombre de familia para mostrar, y las tarjetas de
-- evento no tenían lugar/salón.
--
-- Correr una sola vez en el SQL Editor de Supabase, DESPUÉS de schema.sql
-- y policies.sql ya aplicados. Es idempotente (se puede correr más de una
-- vez sin romper nada). No hace falta tocar policies.sql: son columnas
-- nuevas en tablas que ya tienen RLS a nivel de fila, no de columna, así
-- que las políticas existentes (pub_select, pub_insert_cliente,
-- pub_update_owner, eventos_write_admin, etc.) siguen aplicando sin cambios.
--
-- familia se agrega como NOT NULL: se usa el patrón
-- add column nullable → backfill → set not null, que funciona tanto si
-- las tablas están vacías (caso actual) como si ya tienen filas.
-- =====================================================================

alter table vidriera_publicaciones add column if not exists familia text;
update vidriera_publicaciones set familia = '' where familia is null;
alter table vidriera_publicaciones alter column familia set not null;

alter table vidriera_testimonios add column if not exists familia text;
update vidriera_testimonios set familia = '' where familia is null;
alter table vidriera_testimonios alter column familia set not null;

-- lugar es opcional (eventos virtuales pueden no tener uno), sin backfill necesario.
alter table vidriera_eventos add column if not exists lugar text;
