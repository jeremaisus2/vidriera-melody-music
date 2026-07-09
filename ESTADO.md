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

### Estado de la infraestructura

- `.env` con credenciales reales cargado. **Ojo**: `SUPABASE_URL` y `APP_URL` habían
  quedado cruzados (URL del proyecto Supabase pegada en `APP_URL` y el placeholder
  `https://TU-PROYECTO.supabase.co` en `SUPABASE_URL`) — corregido. `APP_URL` quedó
  provisoriamente en `http://localhost:3000` hasta definir dominio de despliegue.
- `MOCK_AUTH=false` — modo Etapa 1 (`X-Mock-Rol`) queda inactivo: los controladores
  ya no usan `store.js` (se borró, no quedaba ninguna referencia) y los repos
  requieren clientes reales de Supabase.
- `db/schema.sql` y `db/seed.sql` — **✅ aplicados** (confirmado: `vidriera_academias`
  trae la fila "Melody Music" y `vidriera_modulos` el catálogo completo).
- `db/policies.sql` — **✅ aplicado y verificado**. Se confirmó que RLS quedó
  efectivamente *habilitado* (no solo que las políticas existen) con dos pruebas de
  comportamiento, ya que no tengo `psql`/CLI/connection string en este entorno para
  consultar `pg_catalog` directamente:
  - Diferencial de lectura anon vs. service_role sobre tablas con datos reales:
    `vidriera_academias` (1 fila) y `vidriera_modulos` (4 filas) devuelven 0 filas
    con la anon key sin token, y sus valores reales con `service_role` — solo posible
    si RLS está activo y filtrando. `vidriera_categorias` (pública) devuelve las 5
    filas en ambos casos, como corresponde a su política `using (true)`.
  - Insert con la anon key contra `vidriera_academias` devuelve el error de Postgres
    `42501 — new row violates row-level security policy`, que solo ocurre con RLS
    habilitado (un simple problema de permisos daría "permission denied", no este mensaje).
  - Flujo completo autenticado (crear publicación → moderar → aprobar → editar →
    aprobar edición; crear evento → RSVP → reacción toggle → testimonio) corrido de
    nuevo con un usuario de prueba real *después* de aplicar las políticas: los 14
    pasos pasaron bajo RLS activo, confirmando que las políticas no bloquean las
    operaciones legítimas que ya migré.
  - **Para que vos lo confirmes también** en el SQL Editor, corré:
    ```sql
    -- 1. RLS habilitado en las 13 tablas (esperado: rowsecurity = true en las 13)
    select tablename, rowsecurity
    from pg_tables
    where schemaname = 'public' and tablename like 'vidriera_%'
    order by tablename;

    -- 2. Las 27 políticas quedaron creadas (esperado: 27 en total)
    select tablename, count(*) as policies
    from pg_policies
    where schemaname = 'public' and tablename like 'vidriera_%'
    group by tablename
    order by tablename;
    ```
  - Nota menor: la documentación decía "12 tablas" en varios lugares; son **13**
    (contando `vidriera_publicaciones_ediciones` y `vidriera_evento_sponsors` aparte).
    Corregido en `ARQUITECTURA.md`.
  - Decisiones clave del archivo (sin cambios): funciones `security definer`
    `vidriera_rol()`/`vidriera_academia_id()`; `vidriera_perfiles` sin UPDATE/DELETE de
    cliente; `vidriera_publicaciones` UPDATE de dueño solo en pending/rejected y vuelve
    a pending; ediciones solo para publicaciones approved; vistas y conteos de
    RSVP/reacciones siempre por `supabaseAdmin`.

### Migración de la capa mock a Supabase real — ✅ completa

Se creó `src/repos/` (`publicaciones.repo.js`, `eventos.repo.js`, `superadmin.repo.js`)
con las mismas firmas que tenía `store.js`, ahora contra Supabase. Los 6 controladores
quedaron migrados en el orden que habíamos planeado:

1. `publicaciones.controller.js` → `vidriera_publicaciones` + `_ediciones`, con
   `supabasePublic` para lectura pública y `req.supabase` (JWT del usuario) para
   crear/proponer ediciones/listar "mis publicaciones".
2. `admin.controller.js` (moderación) → mismas tablas con `supabaseAdmin`.
3. `eventos.controller.js` → `vidriera_eventos` + sponsors/rsvp/reacciones/galería/testimonios.
4. `admin.controller.js` (eventos/galería/sponsors) → mismas tablas con `supabaseAdmin`.
5. `superadmin.controller.js` → `vidriera_academias` + `vidriera_academia_modulos`.
6. `admin.controller.js` (estadísticas) → `.select('id, nombre, categoria, estado, vistas')` + agregación en JS.

**Decisión no obvia tomada durante la migración**: el mock (`store.js`) nunca
filtraba por `academia_id` en las operaciones de moderación/eventos/galería porque
todo el testing usaba una sola academia. Al pasar a Supabase real con `supabaseAdmin`
(que saltea RLS) ese filtro pasa a ser la única barrera de scoping — se agregó
`.eq('academia_id', ...)` en `moderarPublicacion`, `moderarEdicion`, `editarEvento`,
`eliminarEvento`, `setSponsors`, `agregarFotoGaleria` y `eliminarFotoGaleria`. Las
rutas *públicas* (vidriera y calendario) siguen sin scope por academia, igual que en
Etapa 1 — sigue siendo una limitación conocida para cuando haya más de una academia
activa en la misma instalación (ver "Decisiones pendientes").

**Verificado end-to-end contra el proyecto Supabase real** (no solo sintaxis):
lectura de `vidriera_academias`/`vidriera_modulos` con `supabaseAdmin`, y el flujo
completo crear publicación (pending) → moderar → aprobar → proponer edición sobre
publicación approved → aparece en cola de moderación → aprobar edición → se aplica
al dato público, usando un usuario de prueba temporal (creado y borrado en la misma
corrida, sin dejar rastro en Supabase Auth).

### Alta de usuarios reales — ✅ hecho

`auth.users` estaba vacío; en vez de crear el primer admin a mano desde el dashboard,
se armó `scripts/crear-admin.mjs` (`npm run crear-admin -- <email> <password> [slug]`):
da de alta el usuario en Supabase Auth con `supabaseAdmin.auth.admin.createUser` y
upsertea su fila en `vidriera_perfiles` (`rol: 'admin'`, `academia_id` de la academia
del slug, `melody-music` por defecto). Se creó y verificó de punta a punta un admin
real (`giza@bariloche.com`, Melody Music): login contra Supabase Auth OK, y
`GET /api/admin/moderacion` con su JWT respondió 200 a través del servidor HTTP real
(no solo llamando al repo directo).

### Upload de imágenes a Supabase Storage — ✅ hecho

- Bucket **`vidriera-imagenes`** creado (idempotente, vía `scripts/setup-storage.mjs`
  con `supabaseAdmin.storage.createBucket`, no hizo falta pedirle al usuario que lo
  cree a mano desde el dashboard): `public: true` (lectura pública, se sirve por URL
  directa sin pasar por RLS), `fileSizeLimit: '5MB'`, `allowedMimeTypes: ['image/webp']`.
- **Política de acceso**: lectura pública por el flag del bucket; escritura solo para
  `supabaseAdmin` (service_role) — no se creó ninguna política de INSERT/UPDATE/DELETE
  para anon/authenticated sobre `storage.objects` de este bucket, así que con RLS
  habilitado por defecto en todo proyecto Supabase quedan bloqueados automáticamente
  sin necesidad de escribir una policy explícita.
- `POST /api/uploads/imagen` (nuevo, `requireAuth`, cualquier rol autenticado):
  recibe el archivo con `multer` (buffer en memoria, límite 10MB crudos, solo
  jpeg/png/webp), lo comprime con `sharp` (máx. 1600px de lado manteniendo aspect
  ratio, WebP calidad 75) y lo sube a `academia_id/uuid.webp` con `supabaseAdmin`.
  Devuelve `{ imagen_url }` — esa URL es la que el frontend guarda al crear/editar
  una publicación o al agregar una foto a la galería. `imagen_url` en las tablas
  sigue siendo un string libre (no se agregó validación de formato de URL): el flujo
  recomendado es subir primero acá, pero no se bloquean URLs externas si hiciera
  falta pegar una a mano (mismo criterio que ya usaba el seed de galería con picsum.photos).
- **Verificado end-to-end**: subida real de una imagen de 3000×2000 con el JWT del
  admin recién creado → quedó en 1600×1067 WebP de ~3KB; la URL pública devuelta se
  descargó sin autenticación (200, `image/webp`); un `POST` sin token dio 401 en la
  API; y —yendo un paso más allá del endpoint— un intento de subida **directa** a
  Storage (bypaseando el backend) tanto con la anon key sin token como con el JWT
  real del admin, dieron `"new row violates row-level security policy"`: confirma
  que ni siquiera un usuario autenticado legítimo puede escribir si no pasa por
  `service_role`. Los archivos y objetos de prueba se borraron al final.

### Lo que falta para cerrar Etapa 2

1. **Handoff visual** → vidriera (2a/2b) ✅ y panel de admin de academia (2c) ✅
   implementados (ver sesiones #6 y #8 abajo). Falta el panel de super-admin (`3a`),
   solo versión desktop según el README del handoff.
2. (Menor, no bloqueante) Decidir si las rutas públicas de vidriera/calendario deben
   filtrar por academia cuando convivan varias academias en la misma instalación —
   hoy devuelven datos de todas.
3. Confirmar si el proyecto Supabase es compartido con otros productos GIZA o dedicado
   — evidencia indirecta de que ya es compartido: el proyecto trae un bucket `logos`
   previo, de otro producto GIZA.
4. Reemplazar `APP_URL` provisorio (`https://vidriera.giza.app`, dominio placeholder
   sin registrar — ver nota abajo) por el dominio real una vez definido.

### Decisiones pendientes de confirmar

- Supabase compartido vs. dedicado (otros productos GIZA) — ver nota arriba.
- **`APP_URL`**: `https://vidriera.giza.app` es un placeholder de nombre (no un
  dominio comprado/registrado), elegido para que el QR de cada evento codifique
  algo con forma de URL real en vez de `localhost`. Hay que swapearlo por el
  dominio/subdominio real antes de imprimir o compartir cualquier QR de producción
  (`.env` → `APP_URL`, ver `src/config/env.js`).
- Scoping por academia en rutas públicas (vidriera/calendario) para cuando conviva
  más de una academia en la misma instalación — hoy devuelven datos de todas.

---

### Sesión 2026-07-09 #8 — Frontend: panel de administrador de academia (`2c`)

Implementada la tercera pantalla del handoff visual: cola de aprobación +
estadísticas de vistas para el staff de la academia. Solo versión desktop (así
lo pide el README del handoff). No se tocó el backend — la API de moderación y
estadísticas ya existía completa desde Etapa 1/2.

- **Página separada** `public/admin.html` + `public/css/admin.css` +
  `public/js/admin.js`, reusando los tokens/componentes de `styles.css`
  (header, avatar, pills de negocio, modal) en vez de duplicarlos. Mismo
  mecanismo de login liviano que la vidriera (fetch directo a
  `/auth/v1/token` de Supabase Auth), pero con su propia clave de
  `localStorage` (`mm_admin_auth_session`, separada de `mm_auth_session`) para
  no pisar una sesión de familia abierta en otra pestaña del mismo navegador.
- **Gate de acceso**: la página siempre arranca mostrando el login; recién
  después de autenticar se verifica el rol llamando a
  `GET /api/admin/moderacion` — si devuelve 403 (no-admin) se muestra el error
  y se descarta el token, sin necesidad de un endpoint "whoami" aparte.
- **Cola de aprobación**: `GET /api/admin/moderacion` devuelve
  `{ publicaciones, ediciones }` por separado; el frontend las combina en una
  sola lista ordenada por `created_at` descendente, con pill "Nuevo" (para
  publicaciones) o "Edición" (para ediciones). Para una edición, el preview
  mezcla `publicacion` (dato aprobado actual) con `cambios` (jsonb parcial) para
  mostrar cómo va a quedar; la nota "Cambios enviados" resume `cambios` campo
  por campo con labels en español (no existe una descripción en texto libre
  como en el prototipo, que era un dato hardcodeado — se optó por listar los
  campos reales en vez de inventar una oración).
- **Colores del prototipo, no tomados literalmente**: el script del prototipo
  (`statusStyle`/`rowStyle` de la cola) todavía usaba el acento burgundy de la
  dirección de diseño vieja (turno 1), aunque el README dice explícitamente que
  esa paleta "no se usa en las pantallas finales, ignorar". Se implementaron los
  pills con los colores que sí describe el README para `2c`: "Nuevo" con el tinte
  verde-grisáceo de estado (`#eef2ef`/`#3d6b52`, mismo que "Activo" en el resto
  del sistema) y "Edición" con el tinte verde de acento principal
  (`#eaf1e7`/`#4f6d48`); mismo criterio para el borde izquierdo de la fila
  seleccionada (verde de acento, no burgundy).
- **Motivo de rechazo**: el prototipo no lo pedía (mock estático), pero la API
  real lo exige (`POST .../rechazar` responde 400 sin `motivo`). Se resolvió con
  un `prompt()` del navegador al hacer click en "Rechazar" — simple y consistente
  con el uso de `confirm()` ya existente en la vidriera para cerrar sesión, sin
  sumar un modal nuevo para esto.
- **Estadísticas de vistas**: `GET /api/admin/estadisticas/vistas?estado=approved`
  (se filtra a aprobadas: sin el filtro, la cola de pendientes también aparecería
  con 0 vistas, ensuciando el ranking). El subtítulo del prototipo decía "Últimos
  30 días", pero la API no tiene ventana de tiempo (es acumulado histórico) — se
  cambió el copy a "Total acumulado" en vez de mostrar un dato falso. Se
  re-consulta cada vez que se abre la pestaña (no solo al loguearse), para que
  una publicación recién aprobada no quede afuera hasta recargar la página.
- **Verificado end-to-end contra Supabase real** (servidor HTTP real, Playwright
  con Chromium headless):
  - Login con cuenta `cliente` (no-admin) rechazado con 403 y mensaje mostrado;
    login con cuenta `admin` real entra correctamente.
  - Cola con una publicación nueva + una edición renderizadas con los datos
    reales (pill, familia, tiempo relativo, thumbnail); preview de la edición
    con la nota de cambios correcta; preview de la nueva sin nota de cambios.
  - Flujo real de rechazo (con motivo vía `prompt()`) y de aprobación —
    confirmado no solo en la UI sino contra la tabla real: el rechazo quedó con
    `estado: rejected` y el `motivo_rechazo` capturado, la aprobación de la
    edición aplicó los `cambios` sobre la publicación pública real.
  - Estadísticas: ranking ordenado por vistas descendente con barras
    proporcionales correctas (10 vistas → 100%, 5 vistas → 50%), y confirmado
    que una publicación recién aprobada (0 vistas) aparece en la lista al
    reabrir la pestaña sin recargar la página.
  - **Dos bugs reales encontrados y corregidos** (misma clase que el bug del
    modal de login de la sesión #6, no detectables solo leyendo el código):
    `.mm-admin-gate` y `.mm-admin-shell` declaraban `display: flex` en la hoja
    de estilos, lo que pisaba el `display: none` implícito del atributo
    `hidden` por prioridad de cascada (una regla de autor siempre gana sobre la
    hoja de estilos del navegador) — el gate de login y el panel de dos
    columnas quedaban "ocultos" solo en el atributo pero seguían visibles en
    pantalla. Se agregó `[hidden]{display:none}` explícito para ambas clases.
    Detectado porque el screenshot de Playwright mostraba el login gate
    superpuesto arriba del panel ya autenticado, algo que solo se nota mirando
    la captura, no leyendo el HTML/CSS.
  - Como en sesiones anteriores, varias corridas de test con `waitForTimeout` a
    ciegas dieron resultados inconsistentes entre sí (conteos de filas de la
    cola después de aprobar/rechazar); reescribir las aserciones esperando
    explícitamente la respuesta de red relevante (`page.waitForResponse`) las
    volvió determinísticas — la app funcionaba bien, el timing del test no
    alcanzaba.
  - Datos y usuarios de prueba (7 publicaciones, 2 usuarios) borrados al final
    por id exacto; Supabase quedó en el mismo estado en que se encontró.
- **Nav de la vidriera**: el link "Admin" del header, que hasta ahora era un
  `<span>` inerte con tooltip "Disponible próximamente", ahora apunta a
  `/admin.html` (era el placeholder dejado en la sesión #6 a propósito para
  este momento).

---

### Sesión 2026-07-09 #7 — Cierre de los 3 gaps de datos de la vidriera

Antes de arrancar el panel de admin (`2c`), se resolvieron los tres gaps
documentados en la sesión #6: nombre de familia en publicaciones y testimonios,
lugar en eventos, y saber si el usuario ya reaccionó a un evento. Esta vez sí
hizo falta tocar el backend (schema, repos, controladores, rutas).

- **`familia` (texto, `not null`)** agregado a `vidriera_publicaciones` y
  `vidriera_testimonios`. Se evaluó resolverlo con un join a
  `vidriera_perfiles.nombre` (que ya existe) en vez de duplicar el dato, pero esa
  tabla no es de lectura pública por RLS (`perfiles_select` solo permite ver el
  propio perfil o `super_admin`) — exponerla para leer nombres sería un cambio de
  privacidad más grande que lo pedido. Columna de texto libre, capturada al crear
  la publicación/testimonio, es más consistente con cómo ya funciona `nombre`.
- **`lugar` (texto, opcional)** agregado a `vidriera_eventos` — eventos virtuales
  pueden no tener uno, así que no es `not null` como los otros dos campos.
- **"Mis reacciones"**: nuevo `GET /api/eventos/mias/reacciones` (requireAuth,
  ruta estática antes de `/:id` en `eventos.routes.js`, mismo patrón que
  `/mias/listado` de publicaciones). Devuelve `[{ evento_id, tipo }]` del usuario
  autenticado. **No hizo falta ninguna política RLS nueva**: `reacciones_select`
  ya permitía `user_id = auth.uid()` desde que se escribió `policies.sql` en
  Etapa 2 — el gap real era que nadie había construido el endpoint que la usara.
- **No pude aplicar el schema yo mismo**: sin `psql`/CLI/`DATABASE_URL` en este
  entorno (igual que en la verificación de RLS de la sesión #2), el cliente de
  Supabase por REST no ejecuta DDL. Se creó `db/migrations/001_familia_lugar.sql`
  (idempotente: `add column if not exists` + backfill + `set not null` para las
  dos columnas requeridas) y el usuario lo corrió en el SQL Editor. `db/schema.sql`
  también se actualizó para que una instalación nueva ya nazca con las 3 columnas.
- **Verificado end-to-end contra Supabase real** después de la migración:
  - Validación 400 al crear publicación/testimonio sin `familia`.
  - Flujo real completo por HTTP: crear publicación con `familia` → moderar →
    aprobar (admin real) → aparece en `/api/publicaciones` con `familia`; crear
    evento con `lugar` (admin real) → aparece en `/api/eventos` con `lugar`; crear
    testimonio con `familia` → aparece en `/api/eventos/:id/testimonios`.
  - Frontend (Playwright, Chromium headless) confirma los tres campos renderizados
    en pantalla: nombre de familia en la tarjeta de negocio, lugar en el subtítulo
    del evento, familia en la cita del testimonio.
  - **Caso clave de "mis reacciones"**: usuario reacciona por API (simulando "otro
    dispositivo/sesión"), después abre la vidriera sin sesión iniciada (el botón
    arranca inactivo porque todavía no se sabe su estado real) → click → modal de
    login → tras loguearse, se refresca `mis-reacciones` contra el servidor antes
    de decidir si mandar el toggle → como el estado real ya coincidía con lo que
    pedía el click, **no se mandó ningún `POST /reaccion`** (confirmado por conteo
    de requests de red, no solo por la UI) y el botón quedó "activo" sin duplicar
    ni des-reaccionar por accidente. Caso inverso (reacción nueva) confirmado con
    exactamente 1 `POST /reaccion` y el contador incrementando en 1.
  - Un bug real encontrado durante esta verificación (no evidente solo leyendo el
    código): `apiGet()` nunca mandaba el header `Authorization` — solo `apiPost()`
    lo hacía. Como consecuencia, la primera llamada a
    `GET /api/eventos/mias/reacciones` fallaba con 401 silenciosamente dentro del
    callback post-login, y el intento de reproducir el bug en un test con
    `waitForTimeout` fijo daba resultados inconsistentes entre corridas (a veces
    "por casualidad" no mandaba el toggle duplicado, pero tampoco actualizaba la
    UI) — hubo que instrumentar la verificación con `page.waitForResponse` en vez
    de un timeout a ciegas para confirmar el comportamiento real de forma
    determinística. Corregido agregando el mismo header condicional que ya tenía
    `apiPost`.
  - Datos y usuarios de prueba borrados al final por id exacto; Supabase quedó en
    el mismo estado en que se encontró (confirmado con conteos de filas).

---

### Sesión 2026-07-09 #6 — Frontend: vidriera de padres (`2a` desktop / `2b` mobile)

Implementadas las dos primeras pantallas del handoff visual
(`design-bundle/design_handoff_portal_padres/README.md`), consumiendo la API real
(sin datos hardcodeados). Alcance de esta sesión: **solo la vidriera** — admin (`2c`)
y super-admin (`3a`) quedan para una próxima sesión.

- **Stack**: HTML/CSS/JS plano servido como estático desde `public/` (sin build
  step, sin dependencias nuevas en `package.json`). Un único documento responsive
  (`public/index.html` + `public/css/styles.css` + `public/js/vidriera.js`) cubre
  desktop y mobile con media queries — el orden de secciones en el DOM es el mismo
  en ambos breakpoints (confirmado releyendo el prototipo: la nota del README sobre
  "la vidriera debe ser lo primero" se refiere a que el destacado/sponsors mobile
  son compactos, no a reordenar secciones).
- `src/app.js`: agregado `express.static('public')`, un endpoint `GET /config.js`
  (expone `SUPABASE_URL`/`SUPABASE_ANON_KEY` al navegador — son seguras de exponer,
  RLS las protege) y la CSP de `helmet` ajustada (Google Fonts + `connect-src`
  a Supabase). Es el único cambio en `src/`; controladores/repos/rutas de la API
  quedaron intactos.
- **Login de familias sin SDK**: en vez de sumar `@supabase/supabase-js` por CDN
  (complica CSP y agrega una dependencia de terceros en runtime para algo chico),
  el login habla directo con `POST {SUPABASE_URL}/auth/v1/token?grant_type=password`
  por `fetch` y guarda el `access_token` en `localStorage`. Sesión requerida solo
  para reaccionar a eventos (`Voy a asistir` / `Nos encantó`) — la lectura de la
  vidriera es 100% pública, sin login.
- **Gaps de datos reales detectados** (no se tocó el backend para resolverlos,
  quedan documentados para decidir si vale la pena en una próxima sesión) —
  **los tres resueltos en la sesión #7, ver abajo**:
  - `vidriera_publicaciones` no tiene nombre de familia (solo `owner_user_id`, sin
    join a `vidriera_perfiles`) — el footer de la tarjeta de negocio no muestra
    "Familia X" como en el prototipo, se omitió en vez de inventar el dato.
  - `vidriera_testimonios` tampoco tiene nombre de familia por el mismo motivo — el
    testimonio se muestra con el nombre del evento pero sin atribución de familia.
  - `vidriera_eventos` no tiene campo "lugar" — el subtítulo de la tarjeta de evento
    combina hora + `descripcion` en su lugar (`18:00 hs · {descripcion}`).
  - No hay endpoint "mis reacciones" — el frontend no puede saber si el usuario
    logueado ya reaccionó antes de esta sesión de navegador; el botón arranca
    siempre en estado inactivo aunque el usuario haya reaccionado en una sesión
    previa (el conteo agregado sí es siempre el real, vía `stats.reacciones`).
- **Verificado end-to-end contra Supabase real** (servidor HTTP real, no mocks):
  - Sembrados datos de prueba temporales (5 publicaciones, 2 eventos, sponsors,
    galería, 2 testimonios) y un usuario `cliente` temporal, vía scripts ad-hoc con
    `supabaseAdmin` — no vía la UI, para no depender del flujo de alta de
    publicaciones (fuera de alcance de esta sesión).
  - Capturas con Playwright (Chromium headless, instalado ad-hoc en el entorno) en
    1400px y 402px de ancho: layout fiel al handoff, sin errores de consola.
  - Interacción real en navegador: filtro de categoría, click en WhatsApp (dispara
    `POST /:id/vista`), y el flujo completo de reacción sin sesión → modal de login
    → `POST /auth/v1/token` real → reintento automático de la reacción →
    `POST /api/eventos/:id/reaccion` → UI actualizada. Confirmado además contra la
    tabla `vidriera_reacciones` (no solo la UI) que quedó exactamente una fila.
  - Dos bugs encontrados y corregidos durante esta verificación (ninguno viable de
    detectar solo leyendo el código): el modal de login se renderizaba abierto por
    default (una regla CSS de la clase pisaba el `display:none` implícito del
    atributo `hidden` por especificidad de cascada — se agregó
    `.mm-modal-backdrop[hidden]{display:none}`), y el reintento de reacción
    post-login nunca se disparaba (`closeLoginModal()` limpiaba
    `pendingAfterLogin` a `null` un statement antes de leerlo).
  - Datos y usuario de prueba borrados al final por id exacto (no por filtro
    amplio de `academia_id`), sin dejar rastro — Supabase quedó en el mismo estado
    en que se encontró (confirmado con conteos de filas antes/después).

---

### Sesión 2026-07-09 #5 — `APP_URL` provisorio

- `.env` → `APP_URL=https://vidriera.giza.app`. Es un dominio placeholder (no
  registrado), elegido siguiendo el patrón de nombre del producto para que el QR
  de cada evento codifique algo con forma de URL real en vez de `localhost`.
  Pendiente reemplazarlo por el dominio/subdominio real (ver "Decisiones pendientes").

---

### Sesión 2026-07-09 #4 — Upload de imágenes a Supabase Storage

- Bucket `vidriera-imagenes` creado vía `scripts/setup-storage.mjs` (público de
  lectura, escritura solo `service_role`, sin políticas explícitas — RLS por
  defecto alcanza).
- Nuevo módulo `POST /api/uploads/imagen`: `multer` (memoria) + `sharp` (resize
  1600px, WebP calidad 75) + subida a Storage. Dependencias agregadas: `sharp`, `multer`.
- `errorHandler.js` ahora mapea `multer.MulterError` a 400 en vez de 500.
- Verificado end-to-end: upload real con JWT de admin, resize confirmado
  (3000×2000 → 1600×1067), lectura pública sin auth, 401 sin token, y RLS
  bloqueando escritura directa a Storage incluso con un JWT de usuario real
  (bypaseando el backend). Archivos de prueba borrados al final.
- **Próximo paso**: definir `APP_URL` real y arrancar el frontend sobre esta API
  (ver "Lo que falta para cerrar Etapa 2" arriba).

---

### Sesión 2026-07-09 #3 — Alta del primer admin real

- Creado `scripts/crear-admin.mjs`: da de alta un usuario en Supabase Auth y lo
  vincula en `vidriera_perfiles` como admin de una academia (slug configurable,
  `melody-music` por defecto).
- Usado para crear el primer admin real (`giza@bariloche.com`, Melody Music) y
  verificado de punta a punta: login contra Supabase Auth + `GET /api/admin/moderacion`
  con su JWT respondiendo 200 a través del servidor HTTP real.

---

### Sesión 2026-07-09 #2 — Verificación de RLS post-`policies.sql`

- Confirmado que RLS quedó *habilitado* (no solo que las políticas existen) con
  pruebas de comportamiento vía la API REST (ver detalle arriba). No pude correr
  `pg_tables`/`pg_policies` directamente (sin `psql`/CLI en este entorno) — le pasé
  al usuario las dos queries exactas para que las corra y confirme sobre las 13 tablas.
- Re-corrido el flujo end-to-end completo (publicaciones + eventos/RSVP/reacciones/
  testimonios) con un usuario de prueba real, esta vez con RLS activo: 14/14 pasos OK.
  Usuario y filas de prueba borrados al final, sin dejar rastro.
- Corregido "12 tablas" → "13 tablas" en `ARQUITECTURA.md` (conteo real de `schema.sql`).
- **Próximo paso**: alta del primer usuario/admin real y endpoint de upload a Storage
  (ver "Lo que falta para cerrar Etapa 2" arriba).

---

### Sesión 2026-07-09 #1 — Conexión real a Supabase + migración de controladores

- Corregido `.env` (URLs cruzadas) y `MOCK_AUTH=false`.
- Creada la capa `src/repos/` y migrados los 6 controladores de `store.js` a Supabase real.
- `src/data/store.js` eliminado (sin referencias).
- Verificación end-to-end del flujo de publicaciones contra el proyecto real (antes
  de aplicar `policies.sql`, ver sesión #2 para la re-verificación con RLS activo).

---

### Sesión 2026-07-08 #6 — Políticas RLS (`db/policies.sql`)

- Creado `db/policies.sql` con políticas para las 12 tablas del schema.
- Dos funciones helper `security definer`: `vidriera_rol()` y `vidriera_academia_id()`.
- Decisiones no obvias documentadas en el archivo y en los prerequisitos de Etapa 2.

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
