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
- `vidriera_publicaciones` — dato público del emprendimiento (+ `vistas`, `estado`,
  `familia`: nombre de la familia dueña, requerido, se muestra en la tarjeta).
- `vidriera_publicaciones_ediciones` — ediciones propuestas en revisión (jsonb `cambios`).
- `vidriera_eventos` — calendario (+ `lugar`: opcional, texto libre).
- `vidriera_evento_sponsors` — sponsors por evento (base del destacado rotativo).
- `vidriera_rsvp`, `vidriera_reacciones` — asistencia y reacciones.
- `vidriera_galeria`, `vidriera_testimonios` — fotos y testimonios por evento
  (`vidriera_testimonios.familia`: nombre de familia a mostrar junto a la cita, requerido).

> **`familia` como columna, no join a `vidriera_perfiles`**: aunque `vidriera_perfiles.nombre`
> ya existe, esa tabla no es de lectura pública (RLS solo permite ver el propio perfil o
> `super_admin`) — exponerla públicamente para mostrar nombres de familia sería un cambio de
> privacidad mayor. `familia` se guarda como texto libre en cada publicación/testimonio,
> capturado al momento de creación (mismo patrón que `nombre`).

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
  repos/
    publicaciones.repo.js  vidriera_publicaciones + vidriera_publicaciones_ediciones
    eventos.repo.js         vidriera_eventos, sponsors, rsvp, reacciones, galería, testimonios
    superadmin.repo.js      vidriera_academias, vidriera_academia_modulos, vidriera_modulos
    uploads.repo.js         compresión (sharp) + subida a Supabase Storage
scripts/
  crear-usuario.mjs      alta manual de un usuario real (cliente o admin; Auth + vidriera_perfiles)
  setup-storage.mjs      alta idempotente del bucket vidriera-imagenes
db/
  schema.sql             DDL con prefijo vidriera_
  seed.sql               catálogo de módulos, categorías, academia de ejemplo
  policies.sql           RLS completo para las 13 tablas
  migrations/            ALTERs incrementales sobre schema.sql ya aplicado (no
                          hay CLI/psql en este entorno para correrlas: se corren
                          a mano en el SQL Editor de Supabase y quedan documentadas acá)
public/
  index.html, css/, js/  frontend estático (vidriera de padres), sin build step
```

Los controladores viven en `src/controllers/` y usan `src/repos/` para hablar con
Supabase (una capa de repositorios con las mismas firmas por dominio: publicaciones,
eventos, super-admin). Los repos son el único lugar que conoce nombres de tabla y
detalles de PostgREST/RLS.

### 6.1. Convención de frontend: `hidden` + CSS

Regla fija (ver el comment banner al tope de `public/css/styles.css`): toda
clase que declare `display` distinto de `none` y se use en un elemento que se
oculta vía `el.hidden = true` desde JS necesita su propio
`.clase[hidden] { display: none; }`, porque una regla de autor con `display`
siempre le gana a la regla implícita `[hidden]{display:none}` del navegador.
Bug real, encontrado dos veces (vidriera sesión #6, admin sesión #8) — antes de
sumar una pantalla nueva con paneles/modales toggleados por `hidden`, agregar
el override desde el principio en vez de esperar a que aparezca en una captura.

## 7. Seguridad y datos

- Tres clientes Supabase (`src/config/supabase.js`): `supabaseAdmin` (service_role,
  salta RLS — moderación y super-admin), `supabaseForToken` (propaga el JWT del
  usuario, respeta RLS — operaciones de familias/clientes autenticados) y
  `supabasePublic` (anon, sin token — rutas públicas de vidriera y calendario).
- **RLS** activo en las 13 tablas vía `db/policies.sql`. Las operaciones con
  `supabaseAdmin` filtran manualmente por `academia_id` en cada repo (service_role
  no aplica RLS, así que ese scope es la única barrera contra que un admin de una
  academia toque datos de otra).
- Imágenes en Supabase Storage, bucket **`vidriera-imagenes`**: público de lectura
  (bucket `public: true`, se sirve por URL directa sin pasar por RLS), escritura
  solo por `supabaseAdmin` — no existe ninguna política de INSERT/UPDATE/DELETE
  para anon/authenticated sobre `storage.objects` para este bucket, así que con RLS
  habilitado por defecto quedan bloqueados automáticamente (verificado: un usuario
  autenticado real que intenta subir directo a Storage, sin pasar por el backend,
  recibe "new row violates row-level security policy"). El endpoint
  `POST /api/uploads/imagen` recibe el archivo (multer, en memoria), lo comprime con
  `sharp` (máx. 1600px de lado, WebP calidad 75) y devuelve la URL pública; esa URL
  es la que se guarda en `imagen_url` (plan free: 1 GB storage, 500 MB DB; volumen
  esperado ~100 familias / ~100 imágenes, cada una entre ~50 KB y 300 KB ya comprimida).

## 8. Fuera de alcance (por ahora)

- Facturación electrónica/fiscal.
- Cobro automatizado del super-admin: solo estructura de catálogo, sin pasarela de pago.

## 9. Handoff visual

El diseño (usuario/admin/super-admin, desktop y mobile) fue prototipado en Claude Design
y se incorpora como bundle de contexto aparte de este documento.
