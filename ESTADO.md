# Estado del proyecto — Vidriera Melody Music

> Bitácora de sesión: qué se hizo, qué falta, próximo paso. Se actualiza en cada sesión
> de Claude Code. La descripción estable del sistema vive en `ARQUITECTURA.md`.

## Resumen

**Etapa 1 completa — módulos Vidriera, Calendario y Super-admin.** Toda la lógica de
negocio operativa con store en memoria y auth mock. **Supabase preparado pero sin conectar — eso es Etapa 2.**

---

## Sesión 2026-07-08 #4 — Panel super-admin (Etapa 1: mock)

### Hecho
- Store extendido con estado de super-admin:
  - `CATALOGO_MODULOS`: const con los 4 módulos de la spec (clave, nombre, incluido/adicional, orden).
  - `academias`: 3 academias seed (Melody Music activa, Academia Ritmo activa, Sonidos del Sur pausada).
  - `academiaModulos`: activación relacional módulo↔academia.
- Controlador `src/controllers/superadmin.controller.js`:
  - CRUD de academias con validación de slug (`[a-z0-9-]+`) y control de duplicados.
  - `POST /academias/:id/estado` — activar / pausar academia.
  - `GET /modulos` — catálogo global con etiqueta incluido/adicional pago.
  - `GET /academias/:id/modulos` — catálogo completo con estado de activación por academia.
  - `PUT /academias/:id/modulos` — patch `{ clave: boolean }` con validación de tipo,
    claves inválidas con advertencia (no falla), sincroniza cache `modulos_activos` jsonb.
  - `GET /academias/:id/resumen` — `cliente_desde`, `antiguedad_dias`, módulos activos
    detallados y totales de publicaciones/eventos.
- Rutas de super-admin conectadas a controladores reales.
- Nota sobre mock auth: en modo `MOCK_AUTH=true` no existe estado "sin autenticar"
  (el middleware defaultea a `cliente`), por lo que rutas protegidas devuelven 403 en
  vez de 401. El 401 solo aplica en modo Supabase real (sin token Bearer).

### Probado (27/28 — el 1 diferente es comportamiento esperado de mock, ver nota)
- Listar academias con antigüedad calculada ✓
- Crear academia (validación slug, duplicados) ✓
- Editar academia ✓
- Activar / pausar academia ✓
- Catálogo de módulos (4, orden, incluido/adicional) ✓
- Módulos por academia con estado de activación correcto ✓
- Switch activar/desactivar módulos ✓
- Claves inválidas → advertencia, no error ✓
- Valor no booleano / body vacío → 400 ✓
- Resumen con cliente_desde, módulos activos, totales ✓
- Cache `modulos_activos` sincronizado después de cambios ✓
- Guard de rol: cliente → 403, super_admin → pasa ✓

---

## Sesión 2026-07-08 #3 — Módulo Calendario de eventos (Etapa 1: mock)

### Hecho
- Store extendido con estado completo de eventos: `eventos`, `eventoSponsors`,
  `rsvp`, `reacciones`, `galeria`, `testimonios`. Seed: 3 eventos (2 futuros, 1 pasado
  con fotos de galería).
- Controlador público (`src/controllers/eventos.controller.js`):
  listar (filtros `?tipo` y `?soloFuturos`), ver evento (con stats embebidas),
  sponsors, galería, testimonios, RSVP (upsert), reacciones (toggle por tipo),
  testimonio de familia.
- QR por evento (`GET /api/eventos/:id/qr`): genera PNG con `qrcode`, codifica
  `APP_URL/eventos/:id`. Devuelve `image/png` directamente.
- Controlador admin actualizado (`src/controllers/admin.controller.js`):
  CRUD de eventos (crear/editar/eliminar con limpieza en cascada), sponsors por evento
  (solo publicaciones `approved`), galería (agregar/eliminar foto).
- **Destacado rotativo** (`GET /api/publicaciones/destacado`): sponsors del evento
  cuya ventana activa coincide con la fecha actual (7 días antes → 2 días después).
  Sin evento activo devuelve `{ destacado: null }`.
- `APP_URL` en `.env.example` y `env.js`.
- Rutas de eventos y admin actualizadas (todas conectadas a controladores reales).

### Probado (smoke test — 30 casos)
- Listar eventos con filtros tipo y soloFuturos ✓
- Ver evento / 404 en inexistente ✓
- QR generado como image/png ✓
- Sponsors filtran publicaciones no-approved ✓
- Galería y testimonios seed ✓
- RSVP (confirmar / cancelar / upsert) ✓
- Reacciones toggle (activa → false en segundo call) ✓
- Testimonio con validación de texto ✓
- Admin CRUD de eventos con validaciones ✓
- Sponsors admin rechaza pub pending ✓
- Agregar/eliminar foto de galería ✓
- Destacado rotativo sin ventana activa → sin-ventana ✓
- Eliminar evento limpia datos asociados ✓

---

## Sesión 2026-07-08 #2 — Módulo Vidriera (Etapa 1: mock)

### Hecho
- Capa de autenticación simulada (`MOCK_AUTH=true`):
  - `src/data/mockUsers.js`: tres usuarios fijos (cliente / admin / super_admin).
  - `src/middleware/auth.js`: bifurca entre mock (header `X-Mock-Rol`) y Supabase real.
  - `src/config/env.js`: cuando `MOCK_AUTH=true`, las vars de Supabase son opcionales
    (no falla al arrancar).
  - `src/config/supabase.js`: no instancia clientes Supabase cuando `mockAuth=true`.
- Store en memoria (`src/data/store.js`) con lógica de negocio completa:
  - Seed: dos publicaciones de ejemplo (una approved, una pending).
  - Flujo de edición: si la pub está `approved`, genera una `edicion` pendiente que
    **no pisa el dato público**; si está `pending/rejected`, actualiza en-place.
  - Moderación: aprobar/rechazar publicaciones y ediciones (al aprobar edición aplica
    los cambios al dato público).
- Controladores reales:
  - `src/controllers/publicaciones.controller.js`: listar, ver, vista, crear, editar,
    mis publicaciones (todos los casos de negocio).
  - `src/controllers/admin.controller.js`: cola de moderación, aprobar/rechazar
    publicaciones y ediciones.
- Rutas actualizadas con controladores reales (rutas estáticas antes de `/:id`).
- `.env.example` documenta `MOCK_AUTH`.

### Probado (smoke test)
- GET público filtra solo `approved` ✓
- `pending` devuelve 404 en ruta pública ✓
- Crear publicación (cliente) → queda `pending` ✓
- `/mias/listado` devuelve todas las del usuario ✓
- Cola de moderación filtra pendientes ✓
- Aprobar publicación: cambia estado a `approved` ✓
- Editar publicación `approved` → crea edición, **el dato público no cambia** ✓
- Aprobar edición → aplica cambios al dato público ✓
- Panel admin con rol `cliente` → 403 ✓

---

## Sesión 2026-07-08 #1 — Bootstrap del proyecto

### Hecho
- Scaffolding Node.js (ESM) + Express: `package.json`, `app.js`, `server.js`.
- Config: `src/config/env.js` y `src/config/supabase.js`.
- Middleware: `requireAuth`, `requireRole`, `errorHandler`.
- Rutas por módulo (stubs `501`).
- Esquema SQL con prefijo `vidriera_` (`db/schema.sql`) + semilla (`db/seed.sql`).
- Docs de seguimiento: `ARQUITECTURA.md`, `ESTADO.md`, `README.md`, `.env.example`.

---

## Falta (próximos pasos, en orden sugerido)

1. **Estadísticas de vistas** por emprendimiento (panel admin).
2. **Conectar Supabase real** (Etapa 2):
   - Crear `.env` con credenciales reales.
   - Aplicar `db/schema.sql` + `db/seed.sql` en el SQL editor.
   - Escribir políticas **RLS** por rol (`db/policies.sql`).
   - Cambiar `MOCK_AUTH=false`; el resto del código no cambia.
4. Upload de imágenes a Supabase Storage (con compresión previa).
5. Handoff visual (bundle de Claude Design) → integrar estilos/componentes.

## Notas / pendientes de confirmar
- Estrategia de compresión de imágenes antes de subir a Storage.
- Confirmar si el proyecto Supabase será compartido con otros productos GIZA o dedicado.
