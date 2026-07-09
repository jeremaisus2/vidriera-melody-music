# Arquitectura — Vidriera Melody Music

> Descripción general y **estable** del sistema. Se actualiza solo ante cambios
> estructurales (tablas, roles, decisiones de diseño). El día a día va en `ESTADO.md`.

## 1. Qué es

Producto GIZA: vidriera comunitaria de emprendimientos + calendario de eventos para
academias de música. Cliente de ejemplo: **Melody Music**. Multi-cliente: una misma
instalación sirve a varias academias, cada una con su set de módulos habilitados.

## 2. Stack

- **Runtime:** Node.js (ESM) + Express.
- **Datos/Auth/Storage:** Supabase (Postgres + Auth + Storage).
- **Auth:** JWT de Supabase, verificado en el backend (`Authorization: Bearer`).
- **Convención de tablas:** prefijo `vidriera_` (igual que `acad_` en gestión-academia
  y `nieve_` en gestión-nieve). Permite compartir el proyecto Supabase con otros
  productos GIZA sin colisiones.

## 3. Roles

| Rol | Quién | Puede |
|-----|-------|-------|
| `cliente` | Familia de alumno | Crear/editar su publicación (queda en revisión), RSVP, reacciones, testimonios |
| `admin` | Dueño de la academia | Moderar publicaciones/ediciones, gestionar eventos y sponsors, ver estadísticas |
| `super_admin` | GIZA (proveedor) | Alta/baja de academias, activar módulos por academia |

El rol vive en `vidriera_perfiles.rol`, **no** en el token, para poder gestionarlo desde
el panel sin re-emitir JWTs. `super_admin` no está atado a una academia.

## 4. Módulos (dominio)

1. **Vidriera de emprendimientos** — publicaciones con estado `pending → approved/rejected`.
   Las ediciones sobre una publicación aprobada **no pisan el dato público**: se guardan
   en `vidriera_publicaciones_ediciones` hasta que el admin las aprueba.
2. **Calendario de eventos** — eventos (concierto/muestra/examen), RSVP, reacciones,
   galería de fotos, testimonios y QR por evento.
3. **Sponsors y destacados** — sponsors por evento + destacado rotativo guiado por el
   calendario (la semana de un evento se destaca a quien participa de él).
4. **Panel de administración (academia)** — cola de moderación, gestión de calendario y
   sponsors, estadísticas de vistas.
5. **Panel de super-administrador (GIZA)** — academias y catálogo de módulos por cliente
   (incluido / adicional pago).

## 5. Modelo de datos (`db/schema.sql`)

Todas con prefijo `vidriera_`:

- `vidriera_academias` — clientes. Incluye `estado` (activa/pausada), `created_at`
  (antigüedad) y `modulos_activos` (jsonb) desde el inicio, por recomendación de la spec.
- `vidriera_modulos` — catálogo estable de módulos (`incluido` = plan base vs. adicional).
- `vidriera_academia_modulos` — activación relacional módulo↔academia.
- `vidriera_perfiles` — mapea `auth.users` → rol + academia.
- `vidriera_categorias` — categorías de la vidriera (fijas, en tabla por extensibilidad).
- `vidriera_publicaciones` — dato público del emprendimiento (+ `vistas`, `estado`).
- `vidriera_publicaciones_ediciones` — ediciones propuestas en revisión (jsonb `cambios`).
- `vidriera_eventos` — calendario.
- `vidriera_evento_sponsors` — sponsors por evento (base del destacado rotativo).
- `vidriera_rsvp`, `vidriera_reacciones` — asistencia y reacciones.
- `vidriera_galeria`, `vidriera_testimonios` — fotos y testimonios por evento.

> **Doble representación de módulos** (`modulos_activos` jsonb + tabla `academia_modulos`):
> la tabla es la fuente de verdad; el jsonb es cache/lectura rápida. La spec pide el campo
> desde el día uno para no rehacer estructura al vender el segundo módulo.

## 6. Estructura de código

```
src/
  server.js              arranque
  app.js                 configuración Express (helmet, cors, json, morgan, rutas)
  config/
    env.js               carga y valida variables de entorno (falla rápido)
    supabase.js          supabaseAdmin (service_role) + supabaseForToken (por usuario)
  middleware/
    auth.js              requireAuth: valida JWT, carga req.user/req.perfil/req.supabase
    requireRole.js       requireRole(...roles): autorización por rol
    errorHandler.js      notFound + errorHandler centralizado
  routes/
    index.js             monta /api/{publicaciones,eventos,admin,super-admin}
    publicaciones.routes.js
    eventos.routes.js
    admin.routes.js      protegido con requireRole('admin')
    superadmin.routes.js protegido con requireRole('super_admin')
db/
  schema.sql             DDL con prefijo vidriera_
  seed.sql               catálogo de módulos, categorías, academia de ejemplo
```

Los controladores todavía no están implementados: las rutas responden `501` de forma
explícita para que la superficie de la API quede documentada y navegable.

## 7. Seguridad y datos

- Dos clientes Supabase: `supabaseAdmin` (service_role, salta RLS — solo backend) y
  `supabaseForToken` (propaga el JWT del usuario, respeta RLS).
- Se recomienda activar **RLS** en todas las tablas y escribir políticas por rol
  (`db/policies.sql`, pendiente).
- Imágenes en Supabase Storage; **comprimir antes de subir** (plan free: 1 GB storage,
  500 MB DB; volumen esperado ~100 familias / ~100 imágenes).

## 8. Fuera de alcance (por ahora)

- Facturación electrónica/fiscal.
- Cobro automatizado del super-admin: solo estructura de catálogo, sin pasarela de pago.

## 9. Handoff visual

El diseño (usuario/admin/super-admin, desktop y mobile) fue prototipado en Claude Design
y se incorpora como bundle de contexto aparte de este documento.
