# Estado del proyecto — Vidriera Melody Music

> Bitácora de sesión: qué se hizo, qué falta, próximo paso. Se actualiza en cada sesión
> de Claude Code. La descripción estable del sistema vive en `ARQUITECTURA.md`.

## Resumen

**Etapa 1 completa.** Módulo Vidriera operativo con store en memoria y auth mock.
Todo el flujo (crear → moderar → editar → aprobar edición) probado sin Supabase real.
**Supabase está preparado pero NO conectado activamente — eso es Etapa 2.**

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

## Falta (Etapa 2 en adelante, en orden sugerido)

1. **Conectar Supabase real** (Etapa 2):
   - Crear `.env` con credenciales reales de Supabase.
   - Aplicar `db/schema.sql` y `db/seed.sql` en el SQL editor.
   - Definir políticas **RLS** por rol (`db/policies.sql`, pendiente).
   - Cambiar `MOCK_AUTH=false`; el resto del código no cambia.
2. Módulo **Calendario de eventos**: crear/editar eventos, RSVP, reacciones,
   testimonios, galería, QR por evento.
3. **Sponsors y destacado rotativo** guiado por calendario.
4. Panel **super-admin**: alta de academias y activación de módulos.
5. **Estadísticas de vistas** por emprendimiento.
6. Upload de imágenes a Supabase Storage (con compresión previa).
7. Handoff visual (bundle de Claude Design) → integrar estilos/componentes.

## Notas / pendientes de confirmar
- Estrategia de compresión de imágenes antes de subir a Storage.
- Confirmar si el proyecto Supabase será compartido con otros productos GIZA o dedicado.
