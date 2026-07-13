-- =====================================================================
-- Migración 011 — Catálogo: alta de "Eventos" y "Sponsors" + activaciones
-- iniciales para Melody Music (Agenda/Eventos/Sponsors)
-- =====================================================================
-- Correr en el SQL Editor de Supabase DESPUÉS de 010_agenda.sql — esta
-- migración activa el módulo 'agenda' para Melody Music, y esa clave solo
-- existe en vidriera_modulos si 010 ya corrió (FK de
-- vidriera_academia_modulos.modulo_clave). Si 010 todavía no se corrió,
-- correrla primero.
--
-- Idempotente (insert ... on conflict, upsert). No toca ninguna tabla ni
-- fila de los módulos existentes (vidriera/galeria/estadisticas/qr).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Catálogo: alta de "eventos" y "sponsors" (agenda ya se dio de alta en
-- la migración 010). incluido = false (adicional pago), mismo criterio
-- que galeria/estadisticas/qr — no se ofrecen incluidos en el plan base.
-- ---------------------------------------------------------------------
insert into vidriera_modulos (clave, nombre, descripcion, incluido, orden) values
  ('eventos',  'Calendario de eventos',  'Gestión de conciertos, muestras y exámenes + RSVP', false, 6),
  ('sponsors', 'Sponsors y destacados',  'Sponsors por evento y destacado rotativo en la vidriera', false, 7)
on conflict (clave) do nothing;

-- ---------------------------------------------------------------------
-- Activación inicial para Melody Music: Agenda activo, Eventos y
-- Sponsors inactivos (pedido explícito — se van habilitando de a uno
-- desde el panel de super-admin cuando corresponda).
-- ---------------------------------------------------------------------
-- on conflict do nothing (no "do update"): si esta migración se corriera
-- dos veces después de que el super-admin ya haya tocado estos switches a
-- mano desde el panel, no queremos pisar esa decisión posterior — mismo
-- criterio de idempotencia "run once" que el resto de las migraciones.
insert into vidriera_academia_modulos (academia_id, modulo_clave, activo)
select a.id, m.clave, m.activo_inicial
from vidriera_academias a
cross join (values ('agenda', true), ('eventos', false), ('sponsors', false)) as m(clave, activo_inicial)
where a.slug = 'melody-music'
on conflict (academia_id, modulo_clave) do nothing;
