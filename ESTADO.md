# Estado del proyecto — Vidriera Melody Music

> Bitácora de sesión: qué se hizo, qué falta, próximo paso. Se actualiza en cada sesión
> de Claude Code. La descripción estable del sistema vive en `ARQUITECTURA.md`.

---

## ✅ ETAPA 1 COMPLETA — toda la lógica de negocio con datos simulados

Todos los módulos de la especificación funcional están implementados y probados
con store en memoria y autenticación mock (`MOCK_AUTH=true`). No se requiere
ninguna credencial de Supabase para correr el proyecto.

### Cómo arrancar en modo Etapa 1

```bash
npm install
# Crear .env con solo las variables mínimas:
# PORT=3000
# NODE_ENV=development
# MOCK_AUTH=true
# APP_URL=http://localhost:3000
npm run dev
# GET /health → { "status": "ok" }
# Usar header X-Mock-Rol: cliente | admin | super_admin para autenticarse
```

### Módulos implementados

| Módulo | Rutas base | Estado |
|--------|-----------|--------|
| Vidriera pública | `GET /api/publicaciones` | ✅ |
| Vidriera cliente | `POST/PUT /api/publicaciones` | ✅ |
| Calendario público | `GET /api/eventos` | ✅ |
| Familias (RSVP/reacciones/testimonios) | `POST /api/eventos/:id/*` | ✅ |
| Destacado rotativo | `GET /api/publicaciones/destacado` | ✅ |
| QR por evento | `GET /api/eventos/:id/qr` | ✅ |
| Panel admin — moderación | `GET/POST /api/admin/moderacion/*` | ✅ |
| Panel admin — eventos/galería | `/api/admin/eventos`, `/api/admin/galeria` | ✅ |
| Panel admin — estadísticas | `GET /api/admin/estadisticas/vistas` | ✅ |
| Panel super-admin — academias | `/api/super-admin/academias` | ✅ |
| Panel super-admin — módulos | `/api/super-admin/modulos`, `/academias/:id/modulos` | ✅ |
| Panel super-admin — resumen | `GET /api/super-admin/academias/:id/resumen` | ✅ |

---

## ETAPA 2 — Conexión real a Supabase

### Prerequisitos antes de empezar

1. **Crear `.env` con credenciales reales**
   ```
   PORT=3000
   NODE_ENV=development
   MOCK_AUTH=false
   APP_URL=https://tu-dominio.com
   SUPABASE_URL=https://TU-PROYECTO.supabase.co
   SUPABASE_ANON_KEY=...
   SUPABASE_SERVICE_ROLE_KEY=...
   SUPABASE_JWT_SECRET=...
   ```
   Confirmar si el proyecto Supabase será compartido con otros productos GIZA
   (acad_, nieve_) o dedicado. Las tablas `vidriera_` no colisionan en ningún caso.

2. **Aplicar en el SQL editor de Supabase, en orden**:
   - `db/schema.sql` — 12 tablas con prefijo `vidriera_` + índices  ← **pendiente**
   - `db/seed.sql`   — catálogo de módulos, categorías, academia "Melody Music"  ← **pendiente**
   - `db/policies.sql` — RLS completo para las 12 tablas  ← **✅ LISTO PARA APLICAR**

3. **`db/policies.sql` — decisiones clave ya tomadas**:
   - Funciones helper `vidriera_rol()` y `vidriera_academia_id()` (`security definer`) evitan subqueries repetidas.
   - El backend usa `supabaseAdmin` (service_role) para moderación y super-admin → salta RLS. Las políticas son defensa en profundidad y guardan la lectura con `supabaseForToken`.
   - `vidriera_perfiles`: sin UPDATE/DELETE de cliente → evita escalada de privilegios (nadie puede cambiar su propio rol).
   - `vidriera_publicaciones` UPDATE de cliente: solo en estado `pending` o `rejected`; el `with check` obliga a que quede `'pending'` → no puede auto-aprobarse.
   - `vidriera_publicaciones_ediciones` INSERT: solo para publicaciones en estado `approved` (las pending/rejected se editan en-place).
   - Conteos públicos de RSVP y reacciones → el backend usa `supabaseAdmin` (los clientes solo leen sus propios registros).
   - Incremento de `vistas` → siempre `supabaseAdmin`; ninguna política permite UPDATE anónimo.

### Migración de la capa mock a Supabase real

Con `MOCK_AUTH=false`, `requireAuth` ya usa Supabase Auth (el código está escrito).
Lo que hay que migrar son los **controladores**: reemplazar las llamadas a `store.js`
por queries a Supabase, tabla por tabla. Orden sugerido:

1. `publicaciones.controller.js` → `vidriera_publicaciones` + `vidriera_publicaciones_ediciones`
2. `admin.controller.js` (moderación) → mismas tablas, con `supabaseAdmin` (salta RLS)
3. `eventos.controller.js` → `vidriera_eventos`, `vidriera_rsvp`, `vidriera_reacciones`, `vidriera_galeria`, `vidriera_testimonios`
4. `admin.controller.js` (eventos/galería) → mismas tablas
5. `superadmin.controller.js` → `vidriera_academias`, `vidriera_academia_modulos`
6. `admin.controller.js` (estadísticas) → agregación con `.select('id, nombre, categoria, estado, vistas')`

   Recomendación: introducir una capa `src/repos/` que exporte las mismas
   firmas que `store.js` pero usando Supabase, para poder hacer el switch sin
   tocar los controladores.

### Otras tareas de Etapa 2

- Upload de imágenes a **Supabase Storage** con compresión previa (sharp o browser-side).
  Bucket sugerido: `vidriera-imagenes`. Las rutas de galería y publicaciones reciben
  hoy `imagen_url` como string; en Etapa 2 se agrega un endpoint de upload que devuelve
  la URL pública del storage y se guarda esa URL en la tabla.
- Handoff visual (bundle de Claude Design) → implementar frontend sobre esta API.

### Decisiones pendientes de confirmar

- Supabase compartido vs. dedicado.
- Estrategia de compresión de imágenes (cliente o servidor).
- Dominio/subdominio de despliegue (`APP_URL`).

---

### Sesión 2026-07-08 #6 — Políticas RLS (`db/policies.sql`)

- Creado `db/policies.sql` con políticas para las 12 tablas del schema.
- Dos funciones helper `security definer`: `vidriera_rol()` y `vidriera_academia_id()`.
- Decisiones no obvias documentadas en el archivo y en los prerequisitos de Etapa 2.
- **No aplicado todavía contra Supabase**: se aplica en la próxima sesión, junto con schema.sql y seed.sql.

---

## Sesiones anteriores (Etapa 1)

### Sesión 2026-07-08 #5 — Estadísticas de vistas (cierre Etapa 1)

- `getEstadisticasVistas(academia_id, { categoria, estado })` en store.
- `GET /api/admin/estadisticas/vistas` con filtros opcionales `?categoria` y `?estado`.
- Responde `{ total_vistas, por_publicacion (desc vistas), por_categoria (desc vistas) }`.
- Las vistas se incrementan en tiempo real (el mismo contador de `POST /:id/vista`).
- 12/12 casos de smoke test pasaron.

### Sesión 2026-07-08 #4 — Panel super-admin

- CRUD de academias (slug validado, duplicados, activar/pausar).
- Catálogo de módulos + switch de activación por academia (`PUT { clave: boolean }`).
- Cache `modulos_activos` jsonb sincronizado en cada cambio.
- Resumen por cliente: `cliente_desde`, `antiguedad_dias`, módulos activos detalle, totales.

### Sesión 2026-07-08 #3 — Módulo Calendario de eventos

- Eventos con filtros, stats embebidas, sponsors, galería, testimonios.
- QR PNG on-demand via `qrcode` (`GET /api/eventos/:id/qr`).
- RSVP upsert, reacciones toggle, testimonios con validación.
- Admin: CRUD de eventos, sponsors (solo approved), galería.
- Destacado rotativo: ventana 7d antes → 2d después del evento.

### Sesión 2026-07-08 #2 — Módulo Vidriera

- Auth mock (header `X-Mock-Rol`), Supabase no requerido (`MOCK_AUTH=true`).
- Flujo completo: crear (pending) → moderar → editar aprobada → edición no pisa dato público → aprobar edición.
- Cola de moderación admin (publicaciones + ediciones separadas).

### Sesión 2026-07-08 #1 — Bootstrap

- Node.js ESM + Express, config/env, supabase.js, middlewares, rutas stub.
- `db/schema.sql` (12 tablas, prefijo `vidriera_`) + `db/seed.sql`.
- `ARQUITECTURA.md`, `ESTADO.md`, `README.md`, `.env.example`.
