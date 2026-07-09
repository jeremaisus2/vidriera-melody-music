# Especificación funcional — Vidriera comunitaria para academia de música

## Contexto
Plataforma para una academia de música ("Melody Music" a modo de cliente de ejemplo),
pensada para que las familias de alumnos puedan publicitar sus propios emprendimientos,
combinada con un calendario de eventos de la academia. Administrada por el dueño de la
academia, con un rol adicional de super-administrador (proveedor de la plataforma) que
gestiona qué módulos tiene habilitados cada academia cliente.

## Roles del sistema

1. **Cliente (familia)**: puede crear/editar su publicación de emprendimiento. Los
   cambios (altas o ediciones) quedan en estado pendiente hasta aprobación del admin.
2. **Admin (academia)**: aprueba o rechaza publicaciones y ediciones, gestiona el
   calendario de eventos, define sponsors por evento y destacados.
3. **Super-admin (GIZA)**: administra qué academias/clientes usan la plataforma y qué
   módulos tiene habilitado cada una (catálogo de módulos, algunos incluidos en el plan
   base y otros de pago).

## Módulo: Vidriera de emprendimientos

- Publicación con: nombre, categoría, descripción breve, imagen, contacto WhatsApp.
- Categorías: fotografía y video, vestuario y arreglos, instrumentos y accesorios,
  servicios para eventos, general.
- Estados de publicación: `pending` → `approved` / `rejected`.
- Las ediciones de un cliente sobre una publicación ya aprobada no pisan el dato público
  directamente: quedan en revisión hasta aprobación del admin.
- Cada publicación está vinculada a un `owner_user_id` (la familia dueña).

## Módulo: Calendario de eventos

- Eventos: conciertos, muestras, exámenes. Campos: nombre, fecha, descripción.
- Confirmación de asistencia por parte de las familias (RSVP simple).
- Reacciones simples por evento ("voy a asistir" / "nos encantó").
- Código QR generado por evento, pensado para compartir por WhatsApp.
- Galería de fotos de eventos pasados.
- Testimonios breves de familias, vinculados a un evento.

## Módulo: Sponsors y destacados

- Un evento puede tener emprendimientos "sponsors" asociados (acompañan ese concierto
  o muestra puntual), destacados visualmente distinto al resto de la vidriera.
- Destacado rotativo: la publicación destacada de la vidriera cambia según el calendario
  (ej. la semana de un evento se destaca a quien participa de ese evento), no es fijo
  ni aleatorio.

## Módulo: Panel de administración (academia)

- Cola de moderación: publicaciones nuevas y ediciones pendientes, con aprobar/rechazar
  y motivo de rechazo.
- Gestión del calendario de eventos y de qué emprendimientos son sponsors de cada uno.
- Panel de estadísticas simples: vistas por emprendimiento.

## Módulo: Panel de super-administrador (GIZA)

- Listado de clientes/academias activos en la plataforma (nombre, estado activo/pausado).
- Catálogo de módulos por cliente, con switch de activación y etiqueta de
  incluido/adicional pago. Módulos de ejemplo: Vidriera con sponsors, Galería de eventos,
  Estadísticas de vistas, Código QR por evento.
- Resumen por cliente: módulos activos y antigüedad como cliente.
- Se recomienda que la tabla de academias tenga desde el inicio un campo tipo
  `modulos_activos` (JSON o tabla relacional), aunque hoy solo haya un módulo, para no
  rehacer la estructura al vender el segundo.

## Consideraciones técnicas

- Stack: Node.js, Express, Supabase (Postgres + Auth + Storage), JWT.
- Prefijo de tablas sugerido: `vidriera_` (siguiendo el mismo criterio que
  `gestion-academia` usa `acad_` y `gestion-nieve` usa `nieve_`).
- Se puede compartir el mismo proyecto de Supabase que los otros productos, dado que el
  volumen esperado (~100 familias, ~100 imágenes) entra cómodo en el plan free (1 GB de
  storage de archivos, 500 MB de base de datos), siempre que las imágenes se compriman
  antes de subir.
- Fuera de alcance: facturación electrónica/fiscal (igual que en los otros productos de
  GIZA), lógica de cobro automatizado del super-admin (por ahora solo estructura de
  catálogo, sin pasarela de pago).

## Identidad visual

- Cliente de ejemplo: "Melody Music". Paleta sobria (blanco, negro, gris) con acento en
  verde claro. Diseño plano/moderno, sin réplica del estilo 3D/metálico del logo.
- El diseño visual completo (vista usuario, admin y super-admin, desktop y mobile) fue
  prototipado en Claude Design y debe pasarse como contexto adicional (handoff bundle)
  junto a este documento.

## Documentos de seguimiento a crear en el proyecto

- `ESTADO.md`: bitácora de sesión (qué se hizo, qué falta, próximo paso). Se actualiza
  en cada sesión de Claude Code.
- `ARQUITECTURA.md`: descripción general y estable del sistema (tablas, roles, decisiones
  ya tomadas). Se actualiza solo ante cambios estructurales.
