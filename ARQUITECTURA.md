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
6. **Configuración de la plataforma (super-admin, Etapa E)** — alta/edición/baja del
   catálogo de módulos (antes fijo en el seed) y ajustes generales de la plataforma
   (nombre, email de soporte), no por cliente.
7. **Familias: códigos de acceso (panel admin)** — sistema de acceso simplificado para
   familias, más simple que un login tradicional: el admin le asigna a cada familia un
   nombre identificador y un código; la familia solo usa ese código (sin email visible)
   para reaccionar a eventos o enviar su emprendimiento. Por detrás sigue siendo una
   cuenta real de Supabase Auth (JWT, RLS) — ver §7.1.

## 5. Modelo de datos (`db/schema.sql`)

Todas con prefijo `vidriera_`:

- `vidriera_academias` — clientes. Incluye `estado` (activa/pausada), `created_at`
  (antigüedad), `modulos_activos` (jsonb) desde el inicio, y
  `destacado_override_id` (FK a `vidriera_publicaciones`, nullable — anulación
  puntual del destacado rotativo, panel admin "Orden de la vidriera", Etapa C).
- `vidriera_modulos` — catálogo de módulos (`incluido` = plan base vs. adicional). Editable
  desde el panel super-admin (Etapa E: alta/edición/baja); `activo` (boolean, default true)
  es soft delete — dar de baja nunca borra la fila (rompería la FK de
  `vidriera_academia_modulos.modulo_clave` para clientes que ya lo tengan activado), solo
  deja de ofrecerse para nuevas activaciones.
- `vidriera_academia_modulos` — activación relacional módulo↔academia.
- `vidriera_config_plataforma` — ajustes generales de la plataforma (nombre, email de
  soporte), no por cliente. Tabla singleton (`id smallint primary key default 1 check (id
  = 1)`, una sola fila posible) — a diferencia de `vidriera_textos` (key/value) el set de
  campos acá es chico y fijo, no un catálogo abierto.
- `vidriera_perfiles` — mapea `auth.users` → rol + academia.
- `vidriera_codigos_familia` — códigos de acceso de familias (panel admin, sección
  "Familias"). `codigo` se guarda **en texto plano** a propósito, para que el admin lo
  pueda visualizar después (no solo al crearlo) — ver §7.1 para la justificación
  completa de esta decisión. `activo=false` (dar de baja) no borra la fila ni el usuario
  de Auth, solo bloquea el acceso (ver §7.1). `es_demo` (Etapa H, default false) marca
  cuentas de familia creadas solo para contenido de demostración.
- `vidriera_categorias` — categorías de la vidriera (fijas, en tabla por extensibilidad).
- `vidriera_publicaciones` — dato público del emprendimiento (+ `vistas`, `estado`,
  `familia`: nombre de la familia dueña, requerido, se muestra en la tarjeta;
  `orden`: integer nullable, orden manual en la grilla pública — `null` cae a
  `created_at desc` como antes, Etapa C; `logo_url`/`sitio_web`/`instagram`/`direccion`,
  todos opcionales, Etapa F; `es_demo`, boolean default false, Etapa H — marca
  publicaciones de ejemplo, borrables de una sola vez desde el panel super-admin).
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
  seed-demo.mjs          Etapa H: siembra 6 publicaciones + 1 familia de demostración
                         (es_demo=true), borrables desde el panel super-admin
db/
  schema.sql             DDL con prefijo vidriera_
  seed.sql               catálogo de módulos, categorías, academia de ejemplo
  policies.sql           RLS completo para las tablas del proyecto
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

### 6.2. Dirección visual: sombras marcadas (reemplaza al "flat" del README original)

**El README del handoff original (`design-bundle/design_handoff_portal_padres/README.md`)
pedía explícitamente una dirección "sober/flat": sin sombras, superficies planas con
borde de 1px, "explícitamente no glossy/3D/metallic". Esa dirección quedó reemplazada**
por decisión del cliente (sesión #12, ver ESTADO.md): sombras marcadas y tarjetas
"levantadas" en toda la app (vidriera, admin, super-admin). La decisión se tomó
después de comparar tres niveles de referencia (plano / sombra moderada / sombra
exagerada) en una herramienta de comparación temporal con datos reales, que ya no
existe (se armó y se borró en la misma sesión, no es parte de la app).

Implementación en `public/css/styles.css`, tokens en `:root`:
- `--shadow-card: 0 24px 48px rgba(26,26,26,.30), 0 10px 20px rgba(26,26,26,.20)`
- `--card-radius: 16px` (antes 10px en la mayoría de las tarjetas)

Aplicado a toda superficie tipo "tarjeta" (no a pills, botones, filas de lista,
badges, ni placeholders de imagen/QR, que no cambiaron): `.mm-biz-card`,
`.mm-sponsor-card`, `.mm-event-card`, `.mm-past-event-card`, `.mm-testimonial-card`,
`.mm-modal` (login, en las tres pantallas) y `.mm-preview-card` (admin.css). Las
tarjetas de negocio/evento/pasado/testimonio también llevan `transform:
translateY(-4px)` para el efecto "levantado"; el modal no, porque ya tiene su
propia señal de profundidad (el overlay oscuro de fondo). `.mm-sponsor-card`
retuvo su borde verde (`--accent-border`): no es decorativo, distingue
visualmente un sponsor pago de una tarjeta de directorio común — se le sumó la
sombra encima en vez de reemplazar el borde. El resto de las tarjetas perdió el
borde de 1px (transparent) porque a esta intensidad de sombra, borde + sombra
se veía recargado.

**Los valores son deliberadamente más marcados que lo que se usaría "en serio" en
un producto — fue una elección consciente del cliente para que la diferencia
contra la dirección plana anterior sea inequívoca, no una recomendación de
mejores prácticas de esta sesión.** Si en el futuro se quiere afinar (menos
opacidad, menos blur), tocar solo los dos tokens de arriba: todas las tarjetas
los referencian, no hay valores de sombra hardcodeados sueltos por archivo.

## 7. Seguridad y datos

- Tres clientes Supabase (`src/config/supabase.js`): `supabaseAdmin` (service_role,
  salta RLS — moderación y super-admin), `supabaseForToken` (propaga el JWT del
  usuario, respeta RLS — operaciones de familias/clientes autenticados) y
  `supabasePublic` (anon, sin token — rutas públicas de vidriera y calendario).
- **RLS** activo en las 16 tablas vía `db/policies.sql` (algunas, como
  `vidriera_codigos_familia`, deliberadamente sin ninguna política — ver §7.1). Las
  operaciones con
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

### 7.1. Códigos de acceso de familias — decisión consciente de simplicidad sobre seguridad

El sistema de "código de acceso" (panel admin, sección "Familias") reemplaza el login
tradicional (email + contraseña) por un único campo: un código que el admin elige y le
comparte a la familia por fuera de la app (WhatsApp, papel, etc.). Por detrás sigue
siendo un login real contra Supabase Auth (JWT, RLS, mismo backend que ya validaba
tokens) — lo que cambia es la interfaz, no el mecanismo de autenticación en sí.

**Cómo funciona:**
- Al crear una familia, el backend genera un email técnico invisible
  (`<nombre-slugificado>-<8 hex>@familias.vidriera.internal`, dominio que no resuelve
  DNS a propósito — solo existe para darle a Supabase Auth un email con formato válido)
  y crea una cuenta real con `supabaseAdmin.auth.admin.createUser({ email, password:
  codigo, email_confirm: true })`. Se vincula en `vidriera_perfiles` con `rol: 'cliente'`
  y la academia del admin que la dio de alta — exactamente igual que
  `scripts/crear-usuario.mjs`, solo que ahora también desde el panel.
- El código se guarda además en `vidriera_codigos_familia.codigo` **en texto plano**.
- Login público (`POST /api/auth/familia-login`, sin auth): recibe `{ codigo }`, busca
  la fila por `codigo`, resuelve el email técnico del `user_id` asociado
  (`supabaseAdmin.auth.admin.getUserById`) y hace el password-grant real contra
  Supabase Auth (`email` resuelto + el mismo `codigo` como contraseña) desde el
  backend. La respuesta al frontend nunca incluye el email técnico — solo
  `access_token`/`expires_in`/`nombre_familia`, para que ese email siga siendo
  invisible también en el cliente (DevTools, Network tab, etc.).

**Por qué el código en texto plano es una decisión consciente, no un descuido:**
- El backend necesita el valor real para poder autenticar contra Supabase Auth en
  cada login (a diferencia de una contraseña con hash, que solo sirve para *verificar*,
  acá hace falta el valor original para reenviarlo como password-grant).
- El admin necesita poder **visualizarlo después** (no solo al crearlo) para
  repetírselo a una familia que lo perdió, sin tener que resetearlo cada vez — ese es
  el requisito de producto que motiva toda esta feature ("más simple que un login
  tradicional").
- **No protege datos sensibles críticos**: la cuenta de una familia solo puede crear/
  editar su propia publicación de emprendimiento (texto+imagen ya públicos en la
  vidriera de todas formas) y reaccionar/confirmar asistencia a eventos — no hay datos
  financieros, de identidad, ni información privada detrás de este login. El "peor
  caso" de una filtración de código es que alguien publique o reaccione en nombre de
  esa familia, no un acceso a datos sensibles.
- Mitigación: `vidriera_codigos_familia` tiene RLS habilitado con **cero políticas**
  (ver `db/policies.sql`) — ni anon ni authenticated pueden leerla ni escribirla bajo
  ninguna circunstancia, solo `service_role` (que el backend usa exclusivamente detrás
  del panel de admin, protegido por `requireRole('admin')` y scoping por
  `academia_id`). El código en texto plano nunca sale de esa tabla hacia el cliente
  salvo en la respuesta de `GET /api/admin/familias`, que ya requiere sesión de admin.
- "Dar de baja" refuerza esto con defensa en profundidad: además de `activo=false`,
  banea la cuenta real de Supabase Auth (`ban_duration`) — un código dado de baja no
  solo deja de resolverse en `/api/auth/familia-login`, tampoco podría autenticar si
  alguien intentara pegarle directo a la API de Supabase Auth con el email técnico
  (que de todas formas nunca se expuso).

## 8. Fuera de alcance (por ahora)

- Facturación electrónica/fiscal.
- Cobro automatizado del super-admin: solo estructura de catálogo, sin pasarela de pago.

## 9. Handoff visual

El diseño (usuario/admin/super-admin, desktop y mobile) fue prototipado en Claude Design
y se incorpora como bundle de contexto aparte de este documento.
