# Estado del proyecto — Vidriera Melody Music

> Bitácora de sesión: qué se hizo, qué falta, próximo paso. Se actualiza en cada sesión
> de Claude Code. La descripción estable del sistema vive en `ARQUITECTURA.md`.

## Resumen

Estructura base del backend inicializada. La superficie de la API está definida (rutas
por módulo) pero los controladores aún no tienen lógica: responden `501`.

---

## Sesión 2026-07-08 — Bootstrap del proyecto

### Hecho
- Scaffolding Node.js (ESM) + Express: `package.json`, `app.js`, `server.js`.
- Config: `src/config/env.js` (valida env vars) y `src/config/supabase.js`
  (`supabaseAdmin` service_role + `supabaseForToken` por usuario).
- Middleware: `requireAuth` (valida JWT de Supabase, carga perfil/rol), `requireRole`,
  y manejo de errores (`notFound` + `errorHandler`).
- Rutas por módulo (stubs `501`): `/api/publicaciones`, `/api/eventos`, `/api/admin`
  (rol admin), `/api/super-admin` (rol super_admin). `/health` operativo.
- Esquema SQL con prefijo `vidriera_` (`db/schema.sql`) cubriendo todos los módulos:
  academias, módulos/catálogo, perfiles, categorías, publicaciones + ediciones,
  eventos, sponsors, rsvp, reacciones, galería, testimonios.
- Semilla (`db/seed.sql`): catálogo de módulos, categorías y academia "Melody Music".
- Docs de seguimiento: `ARQUITECTURA.md`, este `ESTADO.md`, `README.md`, `.env.example`.

### Falta (próximos pasos, en orden sugerido)
1. `npm install` y crear `.env` real a partir de `.env.example`.
2. Aplicar `db/schema.sql` y `db/seed.sql` en el proyecto Supabase (SQL editor).
3. Definir políticas **RLS** por rol → `db/policies.sql`.
4. Implementar controladores del **módulo Vidriera** (crear/listar/editar con flujo
   `pending`, y ediciones que no pisan el dato público).
5. Moderación en el panel admin (aprobar/rechazar publicaciones y ediciones + motivo).
6. Calendario de eventos + RSVP/reacciones/testimonios/galería + generación de QR.
7. Sponsors por evento y lógica de **destacado rotativo** guiado por calendario.
8. Panel super-admin: academias + activación de módulos.
9. Estadísticas de vistas.

### Decisiones tomadas
- Prefijo `vidriera_` para todas las tablas (convención GIZA).
- Rol en `vidriera_perfiles`, no en el JWT.
- Módulos con doble representación: tabla relacional (verdad) + `modulos_activos` jsonb
  (recomendación de la spec, para no rehacer estructura al vender el 2º módulo).
- Controladores como stubs `501` para dejar la superficie de la API navegable ya.

### Notas / pendientes de confirmar
- Definir estrategia de compresión de imágenes antes de subir a Storage.
- Confirmar si el proyecto Supabase será compartido o dedicado.
