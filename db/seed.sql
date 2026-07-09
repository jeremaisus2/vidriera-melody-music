-- =====================================================================
-- Datos semilla — Vidriera Melody Music
-- Catálogo de módulos, categorías y la academia de ejemplo "Melody Music".
-- =====================================================================

-- Catálogo de módulos (ejemplos de la spec)
insert into vidriera_modulos (clave, nombre, descripcion, incluido, orden) values
  ('vidriera',     'Vidriera con sponsors',   'Publicaciones de emprendimientos + sponsors por evento', true,  1),
  ('galeria',      'Galería de eventos',      'Fotos de eventos pasados',                                false, 2),
  ('estadisticas', 'Estadísticas de vistas',  'Vistas por emprendimiento',                               false, 3),
  ('qr',           'Código QR por evento',    'QR compartible por WhatsApp',                             false, 4)
on conflict (clave) do nothing;

-- Categorías de la vidriera
insert into vidriera_categorias (clave, nombre, orden) values
  ('fotografia_video',   'Fotografía y video',       1),
  ('vestuario_arreglos', 'Vestuario y arreglos',     2),
  ('instrumentos',       'Instrumentos y accesorios',3),
  ('servicios_eventos',  'Servicios para eventos',   4),
  ('general',            'General',                  5)
on conflict (clave) do nothing;

-- Academia de ejemplo
insert into vidriera_academias (nombre, slug, estado, modulos_activos)
values ('Melody Music', 'melody-music', 'activa', '{"vidriera": true}'::jsonb)
on conflict (slug) do nothing;

-- Activación del módulo base para la academia de ejemplo
insert into vidriera_academia_modulos (academia_id, modulo_clave, activo)
select a.id, 'vidriera', true
from vidriera_academias a
where a.slug = 'melody-music'
on conflict (academia_id, modulo_clave) do nothing;
