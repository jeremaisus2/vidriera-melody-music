-- =====================================================================
-- Migración 003 — orden manual de la vidriera + anulación puntual del
-- destacado (Etapa C, panel admin — sección "Orden de la vidriera")
-- =====================================================================
-- Correr una sola vez en el SQL Editor de Supabase, después de las
-- migraciones 001 y 002 ya aplicadas. Idempotente.
--
-- No hace falta tocar policies.sql: ambas columnas nuevas se escriben
-- siempre con supabaseAdmin (service_role, salta RLS) desde el panel de
-- admin — mismo criterio que el resto de las escrituras de administración
-- en este proyecto. RLS es a nivel de fila, no de columna: las políticas de
-- SELECT existentes sobre ambas tablas siguen aplicando sin cambios.
-- =====================================================================

alter table vidriera_publicaciones add column if not exists orden integer;

alter table vidriera_academias
  add column if not exists destacado_override_id uuid references vidriera_publicaciones(id) on delete set null;
