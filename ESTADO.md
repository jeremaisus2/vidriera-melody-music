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

1. **Handoff visual** → ✅ completo: vidriera (2a/2b), panel de admin de academia
   (2c) y panel de super-admin (3a) implementados (sesiones #6, #8, #9). Las
   4 pantallas del README del handoff (`design-bundle/`) están hechas.
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
  más de una academia en la misma instalación — hoy devuelven datos de todas. La
  anulación puntual del destacado (sesión #13) hereda esta misma limitación a
  propósito (mismo criterio que ya regía) — ver detalle en esa sesión.
- **Alta de familias**: hoy es 100% manual vía `scripts/crear-usuario.mjs` (ver
  sesión #10). Falta decidir si el negocio necesita self-registration antes de
  producción, y si es así, si el registro es libre o requiere invitación/código
  de la academia (para que no se sume gente ajena). Sin definición todavía.
- **Dirección visual**: cambió de "flat, sin sombras" (README original del
  handoff) a "sombras marcadas" por decisión del cliente — ver sesión #11 y
  `ARQUITECTURA.md` §6.2. El README del `design-bundle/` quedó desactualizado en
  ese punto puntual (fidelidad de sombras/profundidad); el resto del handoff
  (layout, tipografía, colores, copy, interacciones) sigue vigente tal cual.

---

### Sesión 2026-07-12 #24 — Gating del resto del sidebar por catálogo real de módulos

Pedido explícito: extender el gating de la sesión #23 (que hasta ahora solo
cubría Agenda/Eventos/Sponsors) al resto de los ítems del sidebar de
`admin.html` que corresponden a módulos reales del catálogo — "Cola de
aprobación", "Orden de la vidriera", "Textos de la página" y "Estadísticas
de vistas" seguían renderizándose siempre, fijos, sin mirar el catálogo.

**Mapeo confirmado con el usuario antes de tocar nada** (pedido explícito,
no se asumió ninguno de estos puntos):
- "Cola de aprobación" (+ botón "Crear publicación") → clave **`vidriera`**
  (opera sobre `vidriera_publicaciones`).
- "Orden de la vidriera" (+ destacado override) → también **`vidriera`**
  (mismo dominio de datos, sin clave propia).
- "Textos de la página" → también **`vidriera`** (edita textos de la
  vidriera pública, sin clave propia en el catálogo).
- "Estadísticas de vistas" → clave **`estadisticas`** (coincide nombre y
  descripción con el catálogo).
- "Familias" → **queda siempre visible, sin gating** — es transversal a más
  de un módulo (acceso tanto para `vidriera` como para `eventos`) y no tiene
  clave propia; se consideró funcionalidad esencial, no opcional.
- Se marcó aparte (fuera de alcance, no se tocó) que el catálogo también
  tiene `galeria` y `qr` sin ningún ítem de sidebar que los use — mismo
  estado en el que estaban Eventos/Sponsors antes de la sesión #22.

**CSS**: se agregó `.mm-sidebar-item[hidden] { display: none; }` en
`admin.css` — sin este override, ocultar un ítem del sidebar vía
`el.hidden = true` no alcanza, porque `.mm-sidebar-item` ya fija
`display: block` (mismo bug documentado en el banner de `styles.css`,
aplicado acá proactivamente en vez de esperar a que apareciera solo).

**`admin.js`**: `loadModulosNav()` se renombró/extendió a
`aplicarGatingModulos()` — sigue armando los links standalone (Agenda/
Eventos/Sponsors) como antes, y ahora además oculta/muestra
`navQueueBtn`/`navOrdenBtn`/`navTextosBtn` según `vidriera` y
`navStatsBtn` según `estadisticas`. Si la sección default ("Cola de
aprobación") queda oculta, salta automáticamente a la primera sección
visible en vez de dejar el panel principal en blanco. **Fail-open**
si `GET /api/admin/modulos` falla (error de red): no se oculta nada — es
un gate de visibilidad, no de seguridad (los endpoints ya están protegidos
por rol), y ocultar la cola de moderación por un error transitorio dejaría
al admin sin poder hacer su trabajo diario. Ningún endpoint ni lógica
interna de moderación/orden/textos/estadísticas se tocó.

**Incidente durante la verificación, resuelto en el momento**: al probar el
gating con un toggle real (`PUT /api/super-admin/academias/:id/modulos`)
para simular "estadísticas apagado", se detectó que `galeria` y `qr` —
módulos que esta sesión no tocó en ningún momento— aparecían inactivos para
Melody Music, cuando dos mensajes antes se habían confirmado activos. No se
pudo determinar la causa con certeza (no hay ningún código de esta sesión
que los toque; la hipótesis más probable es una modificación concurrente
del usuario en `super-admin.html` mientras se trabajaba). Se restauraron
ambos a `activo: true` de inmediato vía la misma API real, confirmado por
lectura directa a Supabase — **el resto de la verificación se completó con
datos sintéticos en vez de más toggles reales**, para no volver a arriesgar
el estado de producción. Estado final confirmado: `vidriera`/`galeria`/
`estadisticas`/`qr`/`agenda` activos, `eventos`/`sponsors` inactivos —
igual que antes del incidente.

**Verificado**:
- Lógica de decisión (qué ítems quedan visibles) probada con datos
  sintéticos para: estado real actual, "estadísticas apagado" y el caso
  extremo "vidriera apagado" — los tres coinciden con lo esperado.
- Con un admin de prueba descartable (creado y borrado en la misma
  corrida): `GET /api/admin/modulos` contra el estado ya restaurado
  devuelve exactamente `vidriera, galeria, estadisticas, qr, agenda` como
  activos — coincide con lo esperado.
- `node --check` sobre `admin.js`, balance de tags en `admin.html`: sin
  errores.
- Usuarios de prueba (1 super_admin, 1 admin) borrados al final; perfiles
  restantes en la base son únicamente los 3 reales (`giza`, `Familia Demo`,
  `supergiza`).

**Sin commit/push en esta sesión** — pedido explícito, queda para que el
usuario revise primero.

---

### Sesión 2026-07-12 #23 — Agenda/Eventos/Sponsors conectados al catálogo real de módulos

Pedido explícito: que las tres pantallas de las sesiones #21/#22 dejen de
depender de un link fijo en el sidebar y pasen a regirse por el catálogo real
de módulos de super-admin (Etapa E) — poder activar Agenda y dejar Eventos/
Sponsors apagados desde ese panel, sin tocar código.

**Investigación previa, pedida explícitamente antes de tocar nada**: se
confirmó por lectura de código (`grep` en `src/controllers`/`middleware`/
`routes`) y consulta real (read-only) a Supabase que **no existía ningún
mecanismo previo** de consumo de `vidriera_academia_modulos` fuera de la
pantalla de super-admin — el catálogo era pura bookkeeping, sin ningún efecto
sobre qué ve el admin de la academia. Confirmado también que el catálogo
todavía tenía solo los 4 módulos originales (`vidriera`/`galeria`/
`estadisticas`/`qr`): las migraciones 010 y 011 (ver abajo) siguen sin
correr. Se presentó el diseño propuesto al usuario antes de programar, que
lo confirmó con la opción de gating solo de página (sin tocar los
controllers de agenda/eventos/sponsors).

**Migración nueva** (`db/migrations/011_catalogo_eventos_sponsors.sql`, para
correr manualmente **después** de `010_agenda.sql` — depende de que la clave
`'agenda'` ya exista en `vidriera_modulos`, FK de
`vidriera_academia_modulos.modulo_clave`): alta de `'eventos'` y `'sponsors'`
en el catálogo (`incluido: false`, mismo criterio que galería/estadísticas/
QR) + activación inicial para Melody Music (`agenda: true`, `eventos: false`,
`sponsors: false`) vía `on conflict do nothing` (no `do update`) para no
pisar un cambio manual posterior del super-admin si la migración se
reejecutara por error.

**Backend — un solo endpoint nuevo, cero lógica nueva**:
`GET /api/admin/modulos` (`admin.controller.js`/`admin.routes.js`, ya pasa
por `requireAuth + requireRole('admin')` del router): expone
`superadminRepo.getModulosAcademia(req.perfil.academia_id)` —la misma
función que ya usaba la pantalla de super-admin— a la propia academia, algo
que no existía. Sin cambios en `superadmin.repo.js` ni en ninguna tabla.

**Frontend — sidebar de `admin.html` ahora es data-driven**: se sacó el
`<a href="/agenda-admin.html">Agenda ↗</a>` fijo y se reemplazó por un
contenedor (`#modulosNav`) que `admin.js` llena tras `GET /api/admin/modulos`
(`loadModulosNav()`, llamada en `verifyAdminAndEnter()` junto al resto de
las cargas iniciales) — solo aparecen los links de Agenda/Eventos/Sponsors
cuya clave está `activo` para la academia logueada.

**Gate de página en las 3 pantallas** (`agenda-admin.js`/`eventos-admin.js`/
`sponsors-admin.js`): cada una, después de verificar rol admin (como ya
hacía), llama a `GET /api/admin/modulos` y si su propia clave no está activa
muestra un bloque nuevo ("Este módulo no está activo", mismo estilo que el
login gate de cada pantalla, con link de vuelta a `admin.html`) en vez del
panel — sin tocar ninguna función de CRUD existente de esas 3 pantallas.
**Limitación conocida y aceptada explícitamente por el usuario**: esto
bloquea la *página*, no la API cruda — un admin de la propia academia que
llame directo a `/api/admin/eventos` con su JWT real seguiría teniendo
acceso aunque el módulo esté "inactivo" en el catálogo. Server-side
enforcement hubiera requerido tocar los controllers de agenda/eventos/
sponsors, fuera del alcance pedido para esta etapa.

**Verificado con un admin de prueba descartable** (creado y borrado en la
misma corrida, `scripts/crear-usuario.mjs`, mismo criterio que sesiones
anteriores): login real, `GET /api/admin/modulos` con su JWT devuelve
exactamente los 4 módulos existentes (sin `agenda`/`eventos`/`sponsors`,
confirmando que las migraciones 010/011 siguen pendientes) — y se confirmó
programáticamente que, con ese dato, el sidebar de `admin.html` no
renderizaría NINGÚN link hoy (ni Agenda) y las 3 pantallas mostrarían el
bloqueo "módulo no activo" si se accediera por URL directa. Usuario y perfil
de prueba borrados al final, confirmado sin residuo.

**Consecuencia importante para el usuario, remarcada en el resumen de esta
sesión**: antes de este cambio, Agenda era accesible vía el link fijo del
sidebar aunque el catálogo no supiera nada de ella. Después de este cambio
(ya en el commit, a la espera de push), **Agenda desaparece del sidebar y
queda bloqueada por URL directa hasta que se corran las migraciones 010 Y
011** — es el comportamiento correcto que se pidió (todo pasa por el
catálogo real), pero implica que el módulo queda temporalmente inaccesible
en producción hasta correr ambas migraciones, no sigue "siempre activo"
como estaba hasta ahora.

**Sin commit/push en esta sesión** — pendiente de confirmación del usuario
antes de subir, mismo criterio que sesiones anteriores.

---

### Sesión 2026-07-12 #22 — Lavado de cara visual: vidriera, eventos y sponsors

Pedido explícito: extender la dirección visual estrenada en Agenda (sesión
#21) al resto del panel de administración — **100% visual, cero cambios de
lógica/rutas/tablas**. Sin migraciones corridas ni git push en esta sesión
(pedido explícito): todo el trabajo queda en el filesystem local.

**Premisa verificada antes de tocar nada** (con `grep` en todo `public/`):
"Panel de calendario de eventos" y "Panel de sponsors y destacados" —
descriptos en el pedido como pantallas "existentes" — en realidad **no
tenían ningún frontend**. El backend sí existía completo (`/api/admin/eventos`,
`/api/admin/eventos/:id/sponsors`, `/api/eventos/:id/sponsors` público) desde
Etapa 1, pero nunca se había construido ninguna pantalla que lo consumiera.
Consultado con el usuario antes de seguir — eligió que se construyeran igual
(UI nueva sobre endpoints ya existentes, sin tocar backend), en vez de
limitar el alcance solo al reskin de lo que ya tenía pantalla.

**1. Reskin de `admin.html`/`admin.css`/`admin.js`** (Cola de aprobación,
Estadísticas, Orden de la vidriera, Textos, Familias — todo lo que ya
existía): paleta cream/olive/clay + Playfair Display/Petit Formal
Script/Inter, mismos tokens que `agenda-admin.css` pero **sin tocar
`styles.css`** (compartido con `index.html` y `super-admin.html`, fuera de
alcance) — se logró reescribiendo las variables de `:root` dentro del propio
`admin.css` (que carga después en `admin.html`, así que sus valores ganan) +
un puñado de overrides puntuales para los pocos colores que styles.css tenía
hardcodeados en vez de variabilizados (`.mm-modal`, `.mm-btn-fill:hover`,
`.mm-btn-danger`, `.mm-form-error`, `.mm-status-pill.rejected`). Efecto
colateral aprovechado: `.mm-wordmark`/`.mm-h1` ya usaban `var(--font-serif)`,
así que "Melody Music" y los títulos de sección pasaron a Playfair Display
sin tocar una sola regla de esas clases. Se agregó una línea en Petit Formal
Script ("Panel de gestión") sobre el wordmark del sidebar, mismo recurso que
la landing/Agenda. 5 colores hardcodeados sueltos en `admin.html` (`color:
#1a1a1a` inline en los `<h1>` de cada sección) también se corrigieron al
nuevo tono de tinta.

**2. Modal → panel lateral deslizante** en los 2 lugares de `admin.html` que
editaban un registro: "Crear publicación" (formulario largo, 9 campos + 2
uploads de imagen — se evaluó mantenerlo modal por ser extenso, pero el
panel lateral ya soporta scroll interno sin problema, así que se migró igual
para consistencia) y "Familias" (alta/edición de código de acceso). Mismo
patrón exacto que Agenda: `.mm-panel-overlay`/`.mm-side-panel` (clases
nuevas en `admin.css`, INDEPENDIENTES de `.ag-overlay`/`.ag-panel` de
`agenda-admin.css` — se mantiene el criterio de "misma dirección, cero CSS
compartido" documentado en ARQUITECTURA.md §6.3), abiertos/cerrados con
`requestAnimationFrame` + clase `.mm-show` para disparar la transición CSS,
igual que `agenda-admin.js`. Cero cambios en los campos, validaciones o
endpoints de ninguno de los dos formularios — solo cómo se muestran/ocultan.

**3. Estados vacíos con copy propio** (`admin.js`): "Todo al día" (cola sin
pendientes, ✨), "Sin estadísticas todavía" (📈), "Nada para ordenar
todavía" (🗂️), "Ninguna familia dada de alta" (👪) — mismo componente
`.mm-empty-rich` (icono + título Playfair + texto) que ya usa Agenda. Los
estados de **error** (fallo de red/fetch, ej. "No pudimos cargar los
textos") se dejaron con texto plano sin personalidad — mismo criterio que
Agenda, que tampoco le pone humor a un error real.

**4. Sin reordenamiento por migrar**: "Orden de la vidriera" ya usaba drag-
and-drop nativo desde la Etapa C (no inputs numéricos) — nada que migrar
ahí, solo reskin de color/tipografía.

**5. Pantalla nueva: `eventos-admin.html`/`css/eventos-admin.css`/
`js/eventos-admin.js`** — CRUD de eventos (nombre, tipo, fecha+hora, lugar,
descripción) consumiendo `/api/admin/eventos` ya existente. Sin
reordenamiento (la tabla `vidriera_eventos` no tiene columna `orden`, se
lista cronológico como ya lo devolvía el backend). Cada tarjeta de evento
muestra, de solo lectura, los conteos que `getEventosAdmin()` ya devolvía y
que nunca se habían mostrado en ningún lado: confirmados RSVP, reacciones
("voy a asistir"/"nos encantó"), cantidad de sponsors (con link a la
pantalla de Sponsors) y cantidad de fotos de galería — esta última se
muestra como dato de contexto nada más, **no se construyó gestión de
galería** (no estaba en el pedido, habría sido alcance extra no pedido).

**6. Pantalla nueva: `sponsors-admin.html`/`css/sponsors-admin.css`/
`js/sponsors-admin.js`** — selector de evento (columna izquierda) +
checklist de publicaciones aprobadas (columna derecha) para definir qué
emprendimientos sponsorean cada evento. Sin ningún endpoint nuevo: usa
`GET /api/admin/eventos` (lista de eventos), `GET /api/eventos/:id/sponsors`
(**público**, ya existía, se reusa desde un contexto autenticado sin ningún
problema — solo para saber qué publicaciones ya son sponsors y pre-marcar
sus checkboxes) y `GET /api/admin/publicaciones?estado=approved` (universo
de publicaciones elegibles) para armar la pantalla, y
`PUT /api/admin/eventos/:id/sponsors` para guardar. Soporta
`?evento_id=<id>` en la URL para llegar con un evento preseleccionado
(usado por el link "🤝 N sponsors" de cada tarjeta en Eventos). **"Destacados"
del pedido no se duplicó como funcionalidad**: la anulación manual del
destacado ya vive en "Orden de la vidriera" (reskineada en el punto 1) — acá
solo se agregó una nota explicativa enlazando a esa pantalla, para no volver
a implementar la misma lógica en dos lugares.

**7. Sidebar de `admin.html`**: 2 links nuevos (`Eventos ↗`, `Sponsors ↗`),
mismo patrón que el link de Agenda de la sesión anterior — abren cada
pantalla en una página aparte, comparten sesión vía la misma clave de
`localStorage` (`mm_admin_auth_session`).

**Verificado** (sin browser disponible en este entorno, igual que la sesión
anterior — verificación por código + servidor real, no capturas):
- `node --check` sobre los 4 archivos JS nuevos/editados: sin errores.
- Balance de tags (`div`/`aside`/`form`/`label`) verificado
  programáticamente en los 4 HTML tocados/nuevos: todos calzan.
- Cero ids duplicados dentro de cada HTML.
- Todos los `getElementById` de cada JS resuelven contra su HTML (las únicas
  "faltantes" son ids inyectados dinámicamente por `innerHTML` en tiempo de
  ejecución — `approveBtn`/`rejectBtn`/`emptyNewBtn`/`guardarSponsorsBtn` —,
  mismo patrón preexistente, no un bug).
- Servidor real levantado contra el Supabase real del proyecto: los 4 HTML
  (`admin.html`, `agenda-admin.html`, `eventos-admin.html`,
  `sponsors-admin.html`) y sus 3 CSS/2 JS nuevos responden `200` con el
  content-type correcto; `GET /api/admin/eventos` sin token sigue
  respondiendo `401` (auth intacta, sin regresión).
- **No se corrió ninguna migración ni se hizo commit/push** — pedido
  explícito, queda para cuando el usuario decida.

**Pendiente / recordatorio para el usuario**:
1. Correr las migraciones de Supabase acumuladas (`009_eventos_demo.sql` si
   no estaba corrida, y sobre todo `010_agenda.sql` de la sesión anterior —
   sigue sin correr, confirmado en esa sesión que bloquea `/api/agenda`).
2. `git push` cuando el usuario decida — nada se subió a git en esta sesión
   ni en la anterior.
3. Validación visual real (Playwright o manual) de las 4 pantallas
   reskineadas/nuevas — pendiente por falta de herramienta de browser en
   este entorno, igual que quedó pendiente para Agenda.
4. Galería de fotos por evento sigue sin ninguna pantalla de gestión (fuera
   de alcance de esta sesión, ver punto 5 arriba) — decidir si hace falta
   una etapa aparte.

---

### Sesión 2026-07-12 #21 — Módulo nuevo: Agenda (landing pública "Comunidad Melody")

Primer módulo nuevo agregado al catálogo desde que existe (Etapa E, sesión #15)
— hasta ahora el catálogo solo tenía los 4 módulos originales de la spec
(vidriera, galería, estadísticas, QR). 100% aditivo: ningún archivo/tabla/ruta
de los módulos existentes se tocó, salvo 3 ediciones mínimas confirmadas de
antemano con el usuario (ver abajo).

**Contexto**: hasta ahora `comunidad-melody-landing.html` (la landing pública
de "Comunidad Melody", pensada para embeberse vía iframe en WordPress/Elementor
del sitio del cliente) **no vivía en este repo** — era un archivo suelto en
`~/Descargas/` con 13 versiones de una sesión de diseño iterativa (herramienta
externa de diseño). Se tomó la versión más reciente por timestamp (la `(12)`,
2026-07-11 01:42) como base, copiada (no movida — el original en Descargas
queda intacto) a `public/comunidad-melody-landing.html`. A partir de esta
sesión el archivo pasa a vivir y versionarse en el repo.

**Migración** (`db/migrations/010_agenda.sql`, para correr manualmente en el
SQL Editor — **todavía no corrida**, confirmado con un `curl` real contra
`/api/agenda` que devuelve `PGRST205 — Could not find the table
'public.vidriera_agenda'`): tabla nueva `vidriera_agenda` (`titulo`, `lugar`,
`fecha` date, `hora` time, `orden` int not null default 0, `activo`), RLS
mismo patrón que `vidriera_eventos` (lectura pública solo `activo=true`,
escritura solo admin de la propia academia), + `insert` idempotente del módulo
`agenda` en `vidriera_modulos` (adicional pago, `incluido=false`, mismo
patrón que `db/seed.sql`).

**Decisión no obvia — `orden` vs. `fecha`**: a diferencia de
`vidriera_publicaciones.orden` (nullable, "cae" a `created_at desc`), acá el
pedido explícito fue que `GET /api/agenda` ordene "por fecha y luego por
campo orden" — `fecha` manda, `orden` es solo desempate manual entre eventos
del mismo día. Por eso es `NOT NULL default 0` (no el patrón "null = sin
ordenar"). Default al crear un evento: cantidad actual de eventos de la
academia (contador simple), editable después por drag-and-drop.

**Backend** (`src/repos/agenda.repo.js`, `src/controllers/agenda.controller.js`,
`src/routes/agenda.routes.js`, nuevos): mismo patrón que
`eventos.repo.js`/`publicaciones.repo.js`. `setOrden()` es un clon exacto del
patrón ya usado en `publicacionesRepo.setOrden` (recalcula 0..N-1, ids ajenos
a la academia se ignoran y se reportan). Sin gating por módulo activo en el
backend — se confirmó revisando el código que hoy ningún módulo (galería,
estadísticas, QR) se bloquea realmente por `vidriera_academia_modulos`: el
catálogo es solo bookkeeping para el super-admin, no un enforcement real.
Se mantuvo el mismo criterio para no inventar una excepción.

**3 ediciones mínimas a archivos existentes, confirmadas con el usuario antes
de tocarlas** (todo lo demás es archivo nuevo):
1. `src/routes/index.js` — 1 línea, registra `agendaRouter` en `/api/agenda`.
2. `src/routes/admin.routes.js` — 5 líneas, registra las rutas
   `/api/admin/agenda*` (mismo bloque que ya usan Familias/Orden/Textos).
3. `public/admin.html` — 1 link nuevo en el sidebar (`Agenda ↗`) que abre
   `agenda-admin.html` en una página aparte. No se tocó `admin.js`.

**Panel de administración — pantalla nueva y aislada** (`public/agenda-admin.html`,
`public/css/agenda-admin.css`, `public/js/agenda-admin.js`): es el **piloto**
de una nueva dirección visual para el panel, pedido explícito del usuario
("se irá extendiendo a otros módulos más adelante"). Paleta cream (`#F7F3EA`)/
olive (`#38452B`)/clay (`#C97A55`) + Playfair Display/Petit Formal Script,
tomada de la landing pública pero adaptada a un contexto funcional —
deliberadamente **sin compartir ni una clase ni un token** con
`admin.css`/`admin.js` actuales (que siguen con Lora/Public Sans/verde oliva
distinto, sin cambios). Reorder por drag-and-drop nativo + undo/redo en
memoria de sesión: mismo patrón exacto que "Orden de la vidriera"
(`public/js/admin.js`), no una reimplementación. Alta/edición en un panel
lateral deslizante (no un modal centrado, para diferenciarse visualmente del
admin actual). Estado vacío con copy propio ("Todavía no hay nada en el
calendario...") en vez de un genérico "no hay datos".

**Sesión compartida con `admin.html`**: `agenda-admin.js` lee/escribe la
MISMA clave de `localStorage` (`mm_admin_auth_session`) que ya usa `admin.js`
— si el admin ya inició sesión en una de las dos pantallas, entra directo a
la otra sin loguearse de nuevo. Logrado por convención (misma clave, mismo
origen), no por código compartido — `admin.js` no se tocó.

**Landing pública** (`public/comunidad-melody-landing.html`): los 5
`.agenda-row` hardcodeados del panel "Agenda" (3 columnas: Estadísticas/Muro/
Agenda) se reemplazaron por un `fetch('/api/agenda')` relativo (mismo origen,
sin CORS) con skeleton de carga (shimmer CSS) y estado vacío/error con el
mismo lenguaje visual del resto de la página. Mes abreviado en mayúsculas
derivado de `fecha` (`toLocaleDateString('es-AR',{month:'short'})`). Se
agregó también al final del mismo `<script>` existente un snippet de
auto-resize para iframe: postea `document.body.scrollHeight` al `parent` vía
`postMessage` en `load`, y de nuevo con un `ResizeObserver` sobre `body`
(cubre el fetch de agenda y cualquier módulo futuro, no solo este). Snippet
de WordPress/Elementor aparte, no en el HTML servido:
`public/snippets/wordpress-iframe-comunidad-melody.html`.

**Servido como estático**: no requirió ningún cambio de código — `src/app.js`
ya servía `public/` completo (`express.static`) desde antes de esta sesión.
Al copiar el HTML ahí, ya quedó accesible en `/comunidad-melody-landing.html`.
Carpeta de destino para los próximos HTML de la landing
(`repositorio-musica.html`, `concierto-invernal.html`): la misma, `public/`.

**Verificado** (sin migración corrida todavía, así que sin datos reales end-
to-end — pendiente para la próxima sesión, después de que el usuario corra
`010_agenda.sql`):
- `node --check` sobre los 4 archivos JS nuevos del backend/admin: sin errores
  de sintaxis.
- Servidor real levantado localmente contra el Supabase real del proyecto
  (mismas credenciales de `.env`, `MOCK_AUTH=false`): `GET /api/agenda`
  responde `500` con el error esperado de Postgrest
  `"Could not find the table 'public.vidriera_agenda'"` — confirma que el
  router/controller/repo están bien conectados de punta a punta, y que el
  único bloqueante real es la migración pendiente (no un bug de código).
  Mismo comportamiento confirmado en `/api/eventos`/`/api/publicaciones` bajo
  las mismas condiciones (no es una regresión de esta sesión).
- Los 5 archivos estáticos nuevos (`comunidad-melody-landing.html`,
  `agenda-admin.html`, `agenda-admin.css`, `agenda-admin.js`) y el
  `admin.html` editado responden `200` con el `content-type` correcto.
- **No se pudo probar visualmente en navegador** (sin herramienta de browser/
  Playwright disponible en este entorno) — el diseño del panel y el fetch de
  la landing quedan verificados por código y por las respuestas HTTP de
  arriba, no por captura de pantalla. Queda pendiente una pasada visual
  (Playwright o manual) en cuanto el usuario corra la migración.

**Próximo paso**: 1) correr `db/migrations/010_agenda.sql` en el SQL Editor;
2) reintentar la verificación end-to-end completa (crear/editar/reordenar/
eliminar eventos desde `agenda-admin.html`, confirmar que aparecen en
`comunidad-melody-landing.html` real); 3) validar visualmente el diseño del
panel (capturas) antes de replicarlo en otros módulos; 4) reemplazar
`https://TU-DOMINIO` del snippet de WordPress por el dominio real una vez
confirmado dónde se sube `comunidad-melody-landing.html` en producción.

---

### Sesión 2026-07-10 #20 — Etapa H, cont.: contenido de demostración de eventos

Pedido inicial: "correr `seed-demo` contra producción porque el sitio recién
desplegado en Hostinger no tiene datos". Antes de ejecutar nada se verificó
(lectura, sin escribir) el estado real de la base de producción y la premisa
resultó parcialmente incorrecta: las 6 publicaciones demo de la sesión #19
**ya estaban** en producción (`familias.melodymusicinstruments.com` apunta al
mismo proyecto Supabase del `.env` local, confirmado con `curl` contra la API
pública real) — reseedear no hubiera hecho nada, el guard anti-duplicado de
`seed-demo.mjs` lo hubiera bloqueado. El problema real era otro: **nunca
existió ningún seed de eventos** — `vidriera_eventos`/`vidriera_testimonios`/
`vidriera_galeria` estaban en 0 filas porque `seed-demo.mjs` (sesión #19) solo
contempló publicaciones, y `db/seed.sql` solo siembra catálogo (módulos/
categorías/la academia). Confirmado con el usuario antes de escribir nada.

**Migración** (`db/migrations/009_eventos_demo.sql`, corrida por el usuario en
el SQL Editor): `es_demo boolean not null default false` en `vidriera_eventos`,
mismo criterio que publicaciones/familias (sesión #19). A diferencia de esas
dos tablas, acá no hizo falta marcar nada más: `vidriera_evento_sponsors`/
`vidriera_rsvp`/`vidriera_reacciones`/`vidriera_galeria`/`vidriera_testimonios`
ya se borran en cascada al borrar la fila del evento (`on delete cascade`, el
mismo mecanismo que ya usaba `eliminarEvento()`), así que alcanza con marcar
el evento.

**`scripts/seed-eventos-demo.mjs`** (nuevo, `npm run seed-eventos-demo --
[slug-academia]`): mismo guard anti-duplicado que `seed-demo.mjs` (si ya hay
`vidriera_eventos.es_demo=true`, avisa y no siembra). Requiere haber corrido
`seed-demo` antes (reusa 2 de las 6 publicaciones demo como sponsors, y la
familia demo existente como `user_id` de los testimonios — no crea cuentas
nuevas). Crea:
- **1 evento próximo** ("Muestra de fin de año", tipo `muestra`, a 18 días) con
  2 publicaciones demo como sponsors (`eventosRepo.setSponsors`).
- **1 evento pasado** ("Concierto de primavera", tipo `concierto`, hace 45
  días) con 3 fotos de galería reales (descargadas de picsum.photos con seed
  fijo y subidas por el mismo flujo de Storage que usa la app,
  `uploadsRepo.subirImagen`, no linkeadas directo — mismo criterio que la
  sesión #19) y 2 testimonios de ejemplo (`vidriera_testimonios`, insertados
  directo con `supabaseAdmin` ya que no hay ninguna sesión de familia real
  detrás de un script de seed).

Se extendió `eventosRepo.crearEvento()` para aceptar `es_demo` (default
`false`, no rompe a `admin.controller.js`, que no lo pasa).

**`demo.repo.js` (`borrarContenidoDemo`) extendido** para que el botón
"Borrar datos de demostración" del panel de super-admin también se lleve los
eventos demo: lee primero los paths de Storage de la galería de esos eventos
(antes de borrar nada), los borra del bucket junto con las imágenes de
publicaciones, borra las filas `vidriera_eventos` explícitas por
`es_demo=true` (el cascade se encarga de sponsors/galería/testimonios), y
devuelve también `eventos_borrados` en la respuesta — el toast del frontend
(`public/js/super-admin.js`) se actualizó para mostrar ese conteo.

**Verificado end-to-end contra producción real** (no solo contra Supabase
directo, sino contra el dominio público desplegado):
- Conteos por lectura directa a Supabase antes de sembrar: 6 publicaciones
  demo ya existentes, 0 eventos/testimonios/galería.
- Corrida real de `npm run seed-eventos-demo` contra el proyecto de
  producción: evento próximo con 2 sponsors, evento pasado con 3 fotos +
  2 testimonios, confirmado por lectura directa a Supabase después de
  sembrar.
- `curl` contra `https://familias.melodymusicinstruments.com/api/eventos`,
  `/api/eventos/:id/galeria` y `/api/eventos/:id/testimonios` reales: los 2
  eventos, las 3 fotos y los 2 testimonios aparecen con los datos correctos
  (`es_pasado` calculado bien para cada uno).
- Una de las URLs de imagen de galería descargada directo con `curl -I`:
  200, `image/webp` — no es un link roto, es un archivo real en Storage.

No se hizo limpieza al final: a diferencia de las verificaciones E2E de
sesiones anteriores (que usaban datos de prueba descartables), acá el
contenido creado **es** el resultado final pedido — debe quedar visible en
producción, no borrarse.

---

### Sesión 2026-07-10 #19 — Etapa H: contenido de demostración

Seis negocios de ejemplo para poder mostrar la plataforma con contenido
real, más un botón en super-admin para borrarlos todos de una sola vez
cuando ya no hagan falta (antes de vender/entregar a un cliente real, por
ejemplo).

**Migración** (`db/migrations/008_contenido_demo.sql`, corrida por el
usuario en el SQL Editor): `es_demo boolean not null default false` en
`vidriera_publicaciones` **y** en `vidriera_codigos_familia`. Default false
en ambas: el contenido real ya cargado queda automáticamente fuera del
alcance de "borrar demo", sin backfill. Marcar también la familia (no solo
las publicaciones) fue pedido explícito — permite identificar y borrar el
paquete completo sin depender de inferir "qué cuenta es demo" a partir de
qué publicaciones son demo.

**Una sola familia demo dueña de las 6 publicaciones, con nombres de
familia distintos por tarjeta**: en vez de crear 6 cuentas de acceso
distintas, se creó una única familia demo (`familiasRepo.crearFamilia(...,
{ es_demo: true })`, mismo sistema de código de acceso de siempre) que es
el `owner_user_id` real de las 6 publicaciones. Pero cada publicación tiene
su propio campo `familia` (texto libre, independiente del login desde la
Etapa F) con un nombre distinto — "Familia Aguirre", "Familia Molina",
etc. — para que la vidriera se vea con la diversidad real de una
comunidad en vez de 6 tarjetas repitiendo "Familia Demo". El código de
acceso de esa cuenta (`demo-<slug>-<timestamp>`) no está pensado para que
nadie lo use para loguearse — es solo el mecanismo para tener un
`owner_user_id` real y válido detrás de las 6 publicaciones.

**Los 6 negocios** (rubros creíbles para una comunidad de familias de una
academia de música en Bariloche, mismo contexto que el resto de los datos
de ejemplo del proyecto): 2 en fotografía y video (fotógrafo + videomaker
de recitales), 1 en vestuario y arreglos (costura/alquiler de vestuario),
1 en instrumentos (luthería), 1 en servicios para eventos (catering) y 1
en general (repostería) — cubre las 5 categorías existentes, "una o dos
por categoría" tal como se pidió.

**Imágenes reales, no solo linkeadas** (pedido explícito: "no solo
linkearla externamente"): `scripts/seed-demo.mjs` descarga una imagen real
de `picsum.photos/seed/<seed>/900/600` por negocio (URLs con seed fijo, no
aleatorias — reproducible entre corridas) y la sube **dos veces** por el
mismo flujo de Storage que ya usa la app real (`uploadsRepo.subirImagen`,
el mismo repo que usa `POST /api/uploads/imagen`): una con `tipo: 'portada'`
(→ `imagen_url`, resize "fit: inside") y otra con `tipo: 'logo'` (→
`logo_url`, recorte cuadrado 400×400 "fit: cover", Etapa F) — así el logo
obligatorio (Etapa G) también queda cubierto para las 6, aunque sea un
recorte de la misma foto en vez de un logo de marca distinto (suficiente
para contenido de demostración).

**`scripts/seed-demo.mjs`** (nuevo, `npm run seed-demo -- [slug-academia]`,
default "melody-music"): guarda simple de no-duplicado — si ya hay alguna
publicación `es_demo=true`, avisa y no siembra de nuevo en vez de duplicar
(hay que borrar primero desde el panel). Reusa
`publicacionesRepo.crearPublicacionAprobada` (Etapa G, estado `approved`
desde el insert, sin pasar por la cola) con `es_demo: true` — se extendió
esa función y `familiasRepo.crearFamilia` para aceptar el flag `es_demo`
(default `false`, no rompe a los llamadores existentes de
`admin.controller.js` que no lo pasan).

**Borrado masivo** (`src/repos/demo.repo.js`, nuevo — `POST
/api/super-admin/demo/borrar`, alcance global, no por academia, porque el
botón vive en "Configuración de la plataforma" del panel super-admin, no
en una pantalla de un cliente puntual): lee primero los paths de Storage
de **todas** las publicaciones `es_demo=true` (portada + logo), los borra
del bucket, borra esas filas de `vidriera_publicaciones` de forma
explícita, y por último borra el usuario de Supabase Auth de cada familia
`es_demo=true` — por `on delete cascade` eso se lleva puestos
`vidriera_perfiles` y la propia fila de `vidriera_codigos_familia` sin
necesidad de un delete manual aparte sobre esas dos tablas. El botón
(`.mm-btn-danger`, clase nueva — primera acción realmente irreversible de
toda la app, se le dio un estilo visualmente distinto del resto de los
outline) pide `confirm()` con el texto exacto pedido antes de llamar al
endpoint.

**Verificado end-to-end con Playwright contra Supabase real** (servidor
HTTP real, cuenta `supergiza@bariloche.com` existente):
- Las 6 publicaciones demo aparecen en la vidriera pública con su
  categoría correcta (confirmado tanto por el tag de la tarjeta como
  filtrando por cada pill de categoría) y con logo real visible.
- Cancelar el diálogo de confirmación no borra nada (las 6 publicaciones
  siguen intactas) — confirmado contra la base real, no solo la UI.
- Confirmar el borrado devuelve los conteos esperados (6 publicaciones, 12
  imágenes — 6 portadas + 6 logos —, 1 familia).
- Tras el borrado: ninguna de las 6 sigue visible en la vidriera pública,
  0 filas `es_demo=true` en ambas tablas, y 0 archivos en la carpeta de
  Storage de la academia — sin residuos.
- Sin errores de consola.
- **El contenido demo se volvió a sembrar después de verificar el borrado**
  (`npm run seed-demo` corrido una segunda vez): el objetivo de esta etapa
  es que la plataforma quede mostrable con contenido real, así que el
  estado final deliberado tiene las 6 publicaciones activas de nuevo — la
  prueba de borrado fue solo eso, una prueba, no el estado final deseado.

---

### Sesión 2026-07-10 #18 — Etapa G: formulario real de envío + creación directa del admin

Hasta esta sesión, crear una publicación solo era posible llamando a la API
directamente — no existía ningún formulario en el frontend público
(confirmado al investigar antes de tocar código, ver sesión anterior). Esta
etapa cierra ese gap: la familia ya puede enviar su emprendimiento desde una
UI real, ver el estado de sus envíos, y el admin puede publicar algo de
inmediato sin pasar por la cola. También quedaron visibles en la vidriera
pública los 3 campos que existían en la base desde la sesión anterior pero
nunca se mostraban (`sitio_web`, `instagram`, `direccion`).

**1. Logo obligatorio para publicaciones nuevas** (`publicaciones.controller.js`,
`crearPublicacion`): a diferencia de la sesión anterior (donde se decidió
`logo_url` nullable en la base, sin excepción, para no complicar el
esquema), acá el pedido fue explícito y sin ambigüedad ("logo (obligatorio)"
en el listado de campos del formulario) — se agregó la validación
`if (!logo_url) return 400` en el controller. La columna sigue siendo
nullable en la base (las publicaciones viejas sin logo no se rompen); la
obligatoriedad es una regla de validación del backend para altas nuevas,
no una constraint de esquema. En el frontend además el `<input type="file"
required>` bloquea el submit nativamente antes de que el JS intervenga —
confirmado con Playwright que el navegador impide enviar sin logo (no hace
falta ni disparar el mensaje de error propio, aunque ese chequeo sigue
estando como defensa en profundidad server-side).

**2. `familia` ya no es un campo del formulario de la familia** — se toma
automático de `session.nombre_familia` (conocido desde el login por código,
sesión anterior). Antes de la Etapa F cada publicación pedía "familia" como
texto libre porque no había ninguna identidad de cuenta confiable detrás
del login; ahora que existe `vidriera_codigos_familia.nombre_familia` como
identidad real, pedírselo de nuevo en el formulario sería redundante y
además dejaría a la familia escribir cualquier nombre. **El admin sí sigue
escribiendo "familia" a mano** en su formulario de alta directa: no hay
ninguna sesión de familia real detrás de una publicación que el admin crea
él mismo, así que no hay de dónde derivarlo automáticamente.

**3. Endpoint de alta directa** (`POST /api/admin/publicaciones`, nuevo):
`publicaciones.repo.crearPublicacionAprobada()` — mismo insert que
`crearPublicacion` pero con `supabaseAdmin` (bypassa RLS, no pasa por las
políticas de cliente) y `estado: 'approved'` desde el insert, sin cola.
`owner_user_id` queda en el propio admin (columna NOT NULL, y no existe
ninguna cuenta de familia real para un alta que el admin hace directamente)
— no tiene ningún efecto funcional (no se usa para scoping de "mis
publicaciones" del admin en ningún lado). Se extrajo `CATEGORIAS_VALIDAS`
como export de `publicaciones.controller.js` para reusar la misma
validación en `admin.controller.js` en vez de duplicar el array (había uno
duplicado suelto en la sección de estadísticas de `admin.controller.js`,
se aprovechó para unificarlo).

**4. Frontend público — botón + formulario de envío** (`index.html`/
`vidriera.js`): "Sumar mi emprendimiento" en el header, visible siempre. Si
no hay sesión, encadena el login por código (mismo mecanismo
`openLoginModal(afterLogin)` que ya usaban las reacciones) y recién
después abre el formulario — confirmado con Playwright que el click sin
sesión abre el login primero, y que tras loguearse el formulario se abre
solo. Subida de imágenes: `subirArchivo(file, tipo)` llama a
`POST /api/uploads/imagen` con el campo `tipo` ("logo"/"portada") agregado
en la sesión anterior, muestra un preview cuadrado apenas termina de
subir. El modal usa una clase nueva `.mm-modal-wide` (520px, con scroll
interno) porque el modal original de login (340px) se queda corto para un
formulario de 9 campos + 2 previews de imagen.

**5. "Mis envíos" — primera interfaz visible para
`GET /api/publicaciones/mias/listado`** (existía desde Etapa 1 pero sin
ninguna UI): modal con pill de estado (`pending`/`approved`/`rejected`,
clases `.mm-status-pill` nuevas en `styles.css` — antes solo existían en
`admin.css`/`super-admin.css`, se agregaron acá porque `index.html` no
carga esos archivos) y, si corresponde, un pill extra "Cambios en
revisión" cuando `edicion_pendiente` no es null (ya lo devolvía el backend
desde siempre, nunca se había consumido en ningún frontend).

**6. Campos de contacto visibles en la tarjeta pública** (`vidriera.js`,
`businessCardHtml`): `sitio_web`/`instagram` como íconos circulares
discretos (🌐/📷) junto al botón de WhatsApp — solo se agregan si el dato
existe, sin cambiar el footer de las publicaciones que no los tienen.
`normalizarUrl()`/`instagramUrl()` aceptan tanto un handle corto
("@usuario") como una URL completa ya pegada por la familia.  `direccion`
se muestra como una línea de texto aparte (con 📍) arriba del footer, no
como link — no se agregó un link a Google Maps por ser una dependencia
externa implícita que no se pidió.

**7. Panel de admin — "Crear publicación"** (`admin.html`/`admin.js`):
botón nuevo en el header de "Publicaciones pendientes" (`.mm-queue-header-row`,
clase nueva en `admin.css` para poner el botón a la derecha del título sin
tocar el padding existente de `.mm-queue-header`), mismo formulario
completo que el de la familia pero con "familia" como campo manual. Al
guardar, la publicación aparece de inmediato en la vidriera pública — no
en la cola de pendientes, que nunca la ve.

**Verificado end-to-end con Playwright contra Supabase real** (servidor
HTTP real; familia de prueba creada vía el flujo real
`familiasRepo.crearFamilia`, admin de prueba descartable):
- Click en "Sumar mi emprendimiento" sin sesión → abre el login por código
  primero (no el formulario directamente).
- Login con el código → el formulario de envío se abre automáticamente
  (encadenado, sin volver a clickear nada).
- Envío sin logo → bloqueado (campo `required` del navegador, sin llegar
  a mandar ningún POST).
- Envío completo (logo + portada + sitio + instagram + dirección + 
  whatsapp) → queda `pending`; "Mis envíos" lo muestra como "En revisión"
  con los datos reales.
- El envío aparece en la cola de aprobación del admin real → aprobado.
- El admin crea una publicación directa (con logo) → confirmado
  `estado: 'approved'` en la respuesta de la API, sin pasar por la cola.
- Recargando la vidriera pública real: la publicación aprobada muestra
  logo, botón de WhatsApp con el número correcto, los 2 íconos de
  sitio/Instagram, y la dirección como texto visible; la publicación
  directa del admin aparece igual, de inmediato.
- Sin errores de consola en toda la corrida.
- Limpieza al final por id/path exacto (nunca por listado+filtro, para no
  arriesgar borrar archivos reales de Melody Music con nombres
  `logo-`/`portada-` parecidos): las 2 publicaciones de prueba, la fila de
  `vidriera_codigos_familia` y su usuario de Auth, el admin descartable, y
  los 3 archivos subidos a Storage por sus paths exactos — confirmado que
  el bucket de Melody Music quedó en 0 archivos, igual que antes de la
  corrida.

---

### Sesión 2026-07-10 #17 — Ficha de publicación ampliada: logo, sitio web, Instagram, dirección

Cuatro campos nuevos en `vidriera_publicaciones`, todos opcionales (incluido
`logo_url` — se aclaró explícitamente con el usuario antes de escribir la
migración, porque el pedido original decía "todos opcionales excepto el
logo" pero después pedía mostrarlo "si existe" y verificar el caso sin
campos nuevos, lo cual contradice que sea obligatorio; se optó por
opcional en los 4, sin bloquear esta sesión con una validación de
"requerido en creación" que no se pidió con certeza).

**Migración** (`db/migrations/007_ficha_publicacion.sql`, corrida por el
usuario en el SQL Editor): `logo_url`, `sitio_web`, `instagram`,
`direccion`, las 4 `text` nullable, sin backfill. Sin cambios en
`policies.sql` (columnas nuevas en una tabla ya cubierta por RLS a nivel de
fila, mismo criterio que las migraciones 001/003). Se actualizó también el
comentario del jsonb `cambios` en `vidriera_publicaciones_ediciones`
(`db/schema.sql`) para incluir las 4 claves nuevas como editables.

**Backend — crear/editar publicación**: `publicaciones.repo.js`
(`crearPublicacion`) y `publicaciones.controller.js` (`crearPublicacion` y
`proponerEdicion`) desestructuran y pasan los 4 campos nuevos, mismo patrón
que los campos existentes (`descripcion`/`imagen_url`/`whatsapp`) — sin
validación de formato agregada (ni URL de `sitio_web` ni de `instagram`),
consistente con que esos campos tampoco la tenían. `editarPublicacion` (el
repo) no necesitó tocarse: ya era genérico, aplica cualquier `cambios` que
arma el controller.

**Upload de logo separado de portada** (`src/repos/uploads.repo.js` +
`uploads.controller.js`): el mismo endpoint `POST /api/uploads/imagen` gana
un campo de form-data opcional `tipo` (`'portada'` default | `'logo'`), en
vez de crear un endpoint nuevo — es el mismo mecanismo de compresión
(sharp → webp calidad 75) para ambos, solo cambia el `resize`: `portada`
sigue con `fit: 'inside'` (conserva aspect ratio, máx 1600px), `logo` pasa
a `fit: 'cover'` a un cuadrado fijo de 400×400 (recorta al centro en vez de
dejar bordes, porque es un ícono, no una foto libre). El path en Storage
ahora incluye el tipo (`{academia_id}/{tipo}-{uuid}.webp`) para poder
distinguir archivos a simple vista en el bucket.

**Frontend público** (`vidriera.js`/`styles.css`): `bizLogoHtml()` nuevo,
separado de `bizImgHtml()` — devuelve string vacío si no hay `logo_url`,
así que una publicación sin logo no cambia nada del resto del markup. El
logo se posiciona `absolute` dentro de `.mm-biz-img` (esquina inferior
izquierda, cuadrado de 40px con borde blanco) — deliberadamente sacado del
flujo normal del layout: al no ocupar espacio en el flow, su ausencia no
puede alterar la altura ni el resto de la tarjeta, evitando tener que
mantener dos variantes de padding/alto según haya o no logo. No se
mostraron `sitio_web`/`instagram`/`direccion` en la tarjeta (fuera de
alcance explícito del pedido — hoy no existe ninguna vista de "ficha
completa" de una publicación en el frontend, solo la tarjeta de grilla;
esos 3 campos quedan disponibles vía API para cuando se construya esa
vista).

**No se tocó el preview de moderación del admin** (`admin.js`,
`renderPreview()`): duplica el markup de la tarjeta de forma inline (no
llama a `businessCardHtml`/`bizImgHtml` de `vidriera.js`, son archivos
separados) y no se le agregó el logo — no estaba en el alcance pedido
("modelo de tarjeta de la vidriera pública"), y no se rompe nada porque
esa función nunca leyó campos que no conocía.

**Verificado end-to-end con Playwright + llamadas reales a la API contra
Supabase real** (sin frontend de creación de publicaciones — no existe
ninguno hoy, confirmado al investigar antes de tocar código; se sembraron
los datos vía `POST /api/publicaciones`/`POST /api/uploads/imagen` reales,
no inserts directos):
- Subida de un logo de prueba (800×500) con `tipo=logo` → confirmado que
  quedó recortado a 400×400 exacto (fit cover), distinto del comportamiento
  de portada.
- Publicación creada con los 4 campos nuevos completos + logo → aprobada →
  la tarjeta pública real muestra el `.mm-biz-logo` con la URL correcta.
- Publicación creada sin ninguno de los 4 campos nuevos → aprobada → la
  tarjeta pública no renderiza ningún `.mm-biz-logo` en el DOM (no un
  elemento vacío u oculto, directamente no existe) y su altura de tarjeta
  es consistente con la que sí tiene logo (layout no roto).
- Sin errores de consola en la corrida.
- Limpieza al final: las 2 publicaciones de prueba, el archivo de logo en
  Storage, y los 2 usuarios de prueba (cliente + admin descartables,
  creados para esta verificación en vez de usar cuentas reales) — confirmado
  que `vidriera_publicaciones`/`vidriera_perfiles` no tienen residuos y la
  carpeta de Melody Music en el bucket quedó en 0 archivos.

---

### Sesión 2026-07-09 #16 — Códigos de acceso para familias (panel admin, sección "Familias")

Sistema de acceso simplificado para familias, pedido explícitamente "más
simple que un login tradicional": el admin de la academia da de alta una
familia con solo un nombre identificador y un código; la familia entra en
el frontend público con SOLO ese código (sin email visible). Por detrás
sigue siendo un login real contra Supabase Auth (mismo JWT/RLS de siempre),
no un mecanismo paralelo — lo que cambia es la interfaz, no la autenticación.

**Migración** (`db/migrations/006_familias_codigo.sql`, corrida por el
usuario en el SQL Editor): tabla nueva `vidriera_codigos_familia`
(`academia_id`, `user_id` único a `auth.users`, `nombre_familia`, `codigo`
único, `activo`). RLS habilitado con **cero políticas** a propósito — ni
siquiera una de SELECT — porque `codigo` se guarda en texto plano (ver
más abajo); solo `service_role` puede tocar la tabla, mismo criterio que
`vidriera_perfiles` pero llevado un paso más allá por la sensibilidad del
contenido. Documentado en detalle en `ARQUITECTURA.md` §7.1.

**Alta de familia** (`src/repos/familias.repo.js`, nuevo): genera un email
técnico invisible (`<nombre-slugificado>-<8 hex>@familias.vidriera.internal`,
dominio que no resuelve DNS a propósito) y crea la cuenta real con
`supabaseAdmin.auth.admin.createUser({ email, password: codigo,
email_confirm: true })` — mismo mecanismo que ya usaba
`scripts/crear-usuario.mjs`, ahora también accesible desde el panel. Se
vincula en `vidriera_perfiles` con `rol: 'cliente'` y la academia del admin
que la da de alta. El código elegido por el admin se guarda además en
`vidriera_codigos_familia.codigo` en texto plano — **decisión consciente**:
el admin necesita poder visualizarlo después (no solo al crearlo) para
repetírselo a una familia que lo perdió, y el backend necesita el valor
original (no un hash) para poder reenviarlo como password-grant en cada
login. Aceptable porque esta cuenta no protege datos sensibles críticos
(solo su propia publicación de emprendimiento, ya pública, y reacciones a
eventos) — ver la justificación completa en `ARQUITECTURA.md` §7.1.

**Editar código**: `supabaseAdmin.auth.admin.updateUserById(user_id,
{ password })` + update de la fila. El nombre identificador NO se edita
desde esta pantalla (solo el código) — el formulario de "Cambiar código"
deshabilita el campo nombre, mismo patrón que la clave de módulo
inmutable en Etapa E.

**Dar de baja** (soft delete, no borra fila ni usuario ni publicaciones):
además de `activo=false`, banea la cuenta real de Supabase Auth
(`ban_duration: '876000h'`, ~100 años — Supabase no tiene ban permanente
nativo) como defensa en profundidad, para que ni siquiera un intento
directo contra la API de Supabase Auth funcione con el código viejo.
Reactivar hace lo simétrico (`ban_duration: 'none'`).

**Login público por código** (`POST /api/auth/familia-login`, nuevo router
`src/routes/auth.routes.js` — sin `requireAuth`, es el único endpoint
público de autenticación del proyecto): recibe `{ codigo }`, busca la fila
por `codigo` con `activo=true`, resuelve el email técnico del `user_id`
(`supabaseAdmin.auth.admin.getUserById`) y hace el password-grant real
contra Supabase Auth desde el backend (mismo endpoint REST
`/auth/v1/token?grant_type=password` que antes llamaba el frontend
directo). La respuesta **nunca incluye el email técnico** — solo
`access_token`/`expires_in`/`nombre_familia` — para que ese email siga
invisible también del lado del cliente (Network tab incluido). Es
instantáneo y no requiere ninguna aprobación del admin en este paso (la
aprobación ya ocurrió al crear el código, y vuelve a ocurrir después, al
moderar la publicación que la familia envíe) — pedido explícito.

**Frontend público** (`index.html`/`vidriera.js`): el modal de login pasa
de 2 campos (email + contraseña) a 1 solo campo ("Código de acceso",
`type="password"` para no mostrarlo en pantalla). `signIn()` ya no habla
directo con Supabase Auth — llama a `/api/auth/familia-login` y guarda
`{ access_token, expires_at, nombre_familia }` en `localStorage` (sin
`user.email`, que ya no viaja al cliente). El avatar ahora muestra las
iniciales/tooltip del **nombre de familia**, no del email — antes mostraba
`session.user.email`, que hubiera expuesto el email técnico invisible si
no se corregía. Se sacó `<script src="/config.js">` de `index.html`: ya no
hace falta `supabaseUrl`/`supabaseAnonKey` en el cliente para este login
(admin.html y super-admin.html siguen usándolo para su propio login real de
staff, sin cambios).

**Frontend admin** (`admin.html`/`admin.css`/`admin.js`): nueva sección
"Familias" en la barra lateral (5to ítem), mismo patrón que las anteriores.
Listado con nombre, código **siempre visible** (no solo al crear, pedido
explícito — `<code>` con fondo tenue), pill de estado (reusa
`.mm-status-pill.activo/.pausado`, agregadas a `admin.css` — antes solo
existían en `super-admin.css`), botones "Cambiar código" y "Dar de baja"/
"Reactivar". Formulario único de alta/edición (mismo patrón que el
catálogo de módulos de Etapa E): en alta pide nombre + código, en edición
el nombre queda deshabilitado.

**Verificado end-to-end con Playwright contra Supabase real** (servidor
HTTP real; se creó un admin de prueba descartable en vez de usar
`giza@bariloche.com` porque su contraseña real no estaba documentada en
esta bitácora):
- Admin crea una familia ("Familia Test E2E" / código `testcodigoe2e`)
  desde el panel — confirmado que aparece en el listado con el código
  visible y estado "Activo".
- En el flujo público: el modal de login confirmado con un único campo
  `codigo` (cero campos de tipo email en el DOM); login con ese código
  devuelve 200 e instantáneamente autenticado, **sin ningún paso de
  aprobación** — confirmado que la respuesta JSON no contiene el email
  técnico ni el dominio `@familias.vidriera.internal`; el avatar muestra
  "Familia Test E2E" (no el email); la sesión persiste después de recargar
  la página completa (no solo en memoria).
- Cambio de código: el código viejo pasa a devolver 401 inmediatamente, el
  nuevo código funciona (200) — confirmado contra el backend real, no solo
  la UI.
- Dar de baja: la familia sigue visible en el listado (pill "Dado de
  baja"), pero el código ya no autentica (401) — confirma que "dar de baja"
  bloquea el acceso real, no solo cambia una etiqueta visual.
- Sin errores de consola no esperados (los dos 401 de la consola del
  navegador son de los intentos de login deliberadamente fallidos que
  dispara el propio test, no un bug).
- Datos de prueba borrados al final: la fila de `vidriera_codigos_familia`,
  su usuario de Supabase Auth, y el admin de prueba — confirmado que
  `vidriera_codigos_familia` quedó en 0 filas y los perfiles de Melody
  Music volvieron a tener solo al admin real (`giza`).

---

### Sesión 2026-07-09 #15 — Etapa E: configuración de la plataforma (panel super-admin)

Última pantalla nueva del plan: gestión del catálogo de módulos (antes fijo
en el seed) y ajustes generales de la plataforma, ambos desde
`super-admin.html`.

**Migración de layout previa al contenido nuevo**: `super-admin.html` no
tenía barra lateral (a diferencia de `admin.html` desde la Etapa B) — era un
header + vista única de clientes. Se migró al mismo patrón `mm-app-shell`/
`mm-sidebar`/`mm-app-main` de `admin.html` (reusando las clases de
`admin.css` tal cual, sin duplicarlas) para poder sumar "Configuración de la
plataforma" como segundo ítem de nav junto a "Clientes de la plataforma"
(el contenido de clientes existente se movió dentro de `<section
id="tabClientes">` sin tocar su HTML/JS interno). Decisión confirmada con
el usuario antes de tocar el layout, dado que no era self-evident cuál era
"el mismo patrón de navegación" pedido si la pantalla no tenía ninguno
todavía.

**Catálogo de módulos — soft delete, no borrado físico** (pedido explícito):
- `db/migrations/005_config_plataforma.sql` (corrida por el usuario en el
  SQL Editor): `vidriera_modulos` gana `activo boolean not null default
  true`. "Dar de baja" nunca borra la fila — evitaría romper la FK de
  `vidriera_academia_modulos.modulo_clave` para clientes que ya lo tengan
  activado — solo pone `activo=false`.
- `getModulosAcademia()` (`superadmin.repo.js`) filtra el catálogo que se
  ofrece a cada cliente: un módulo dado de baja deja de listarse para
  activarlo de nuevo, **salvo que esa academia puntual ya lo tenga
  activo=true** (si no, un cliente con el módulo prendido lo vería
  desaparecer sin poder apagarlo). `setModulosAcademia()` tiene la misma
  regla como defensa en profundidad server-side: rechaza `{clave: true}`
  para un módulo dado de baja que esa academia todavía no tenía activo
  (`invalidas`), pero sigue permitiendo `{clave: false}` para apagar uno que
  ya estaba prendido.
- `GET /api/super-admin/modulos` sigue devolviendo solo módulos vigentes por
  default (no cambia el contrato que ya consumía la lista de clientes para
  el conteo "N de M"); la pantalla de gestión del catálogo pide
  `?incluir_inactivos=true` para poder ver y reactivar los dados de baja.
- Nuevos endpoints: `POST /api/super-admin/modulos` (alta — valida `clave`
  con el mismo regex que el slug de academia, `nombre`, `incluido`
  booleano), `PUT /api/super-admin/modulos/:clave` (edita nombre/
  descripción/incluido; **la clave no se edita**, es la PK referenciada por
  `academia_modulos`), `POST /api/super-admin/modulos/:clave/estado` (alta/
  baja).
- Frontend: formulario único (alta y edición comparten el mismo `<div>`,
  toggleado por `moduloEnEdicion`) con el campo clave deshabilitado en modo
  edición. Reutiliza `.mm-status-pill`/`.mm-plan-badge` ya existentes para
  los estados visuales.

**Ajustes generales — tabla singleton, no key/value**: a diferencia de
`vidriera_textos` (catálogo abierto de claves), acá el set de campos es
chico y fijo (nombre de la plataforma, email de soporte), así que
`vidriera_config_plataforma` tiene una sola fila posible (`id smallint
primary key default 1 check (id = 1)`) en vez de una fila por clave. Sin
scoping por academia: son ajustes de la plataforma entera, no por cliente.
RLS nueva (tabla nueva): solo `super_admin` puede leer/escribir (defensa en
profundidad — el backend siempre usa `service_role` acá).

**Bug real encontrado y corregido durante la verificación** (no la misma
clase que el bug de `[hidden]`, aunque se aplicó esa regla proactivamente
sin problemas en `.mm-config-wrap`): al volver de "Configuración de la
plataforma" a "Clientes de la plataforma", el panel de detalle del cliente
seleccionado no se refrescaba — un módulo recién creado/editado en la otra
sección no aparecía hasta recargar toda la página, porque el click del nav
solo togglea qué `<section>` se ve (`setActiveSection`), sin refetch.
Corregido agregando `loadClientDetail()` al handler de `navClientesBtn`
(mismo criterio que ya usaba `navStatsBtn`/`navTextosBtn` en `admin.js` para
sus propias secciones). Encontrado con un test de Playwright que creaba un
módulo y volvía a la lista de clientes esperando verlo — sin el fix, el
`waitForResponse` del refetch nunca llegaba a dispararse.

**Verificado end-to-end con Playwright contra Supabase real** (servidor
HTTP real, cuenta `supergiza@bariloche.com` existente): login super_admin
entra y la sección "Clientes de la plataforma" sigue funcionando igual que
antes (regresión); navegación a "Configuración de la plataforma"; alta de
un módulo nuevo (`newsletter-test-e2e`, adicional pago) confirmada en la
fila del catálogo; edición del mismo módulo (nombre + pasa a incluido en
plan base) persistida y reflejada; **el módulo nuevo aparece disponible
para activar/desactivar en la pantalla de "Melody Music"** (el requisito
central de esta etapa) sin recargar la página; toggle de activación/
desactivación confirmado funcionando sobre el módulo nuevo; dado de baja
del módulo confirmado (pill "Dado de baja" en el catálogo) y confirmado que
deja de ofrecerse en la pantalla de cliente que nunca lo había activado;
edición de ajustes generales (nombre de plataforma + email de soporte)
confirmada persistida **después de recargar la página completa** (no solo
en memoria del formulario). Sin errores de consola en toda la corrida.
Datos de prueba borrados al final por clave/id exacto (`vidriera_modulos`,
`vidriera_academia_modulos`) y los ajustes generales devueltos a su valor
original (`GIZA`, sin email de soporte) — confirmado que Supabase quedó en
el mismo estado en que se encontró, salvo la migración 005 en sí (permanente,
aplicada por el usuario).

---

### Sesión 2026-07-09 #14 — Etapa D: textos fijos editables ("Textos de la página")

Construida la última sección que quedaba en la barra lateral del panel de
admin. El admin puede editar los 7 títulos/subtítulos fijos de la vidriera
pública (no contenido dinámico como nombres de publicaciones o eventos) con
negrita simple, y el cambio se ve en la vidriera real apenas se guarda.

**Catálogo fijo de 7 claves** (`TEXTOS_CATALOGO` en `src/repos/textos.repo.js`,
única fuente de verdad de qué existe y su valor por defecto):
`destacado_label`, `vidriera_titulo`, `vidriera_subtitulo`,
`calendario_titulo`, `momentos_titulo`, `galeria_titulo`,
`testimonios_titulo`. Identificados releyendo el README del handoff y el
HTML público — son exactamente los títulos/subtítulos de sección que ya
existían como texto hardcodeado en `index.html`, ninguno inventado.
- **Excepción**: `galeria_titulo` ("Galería") no existía como heading propio
  en el `2a` (desktop) implementado en la sesión #6 — el prototipo desktop
  original tampoco lo tenía (las fotos van directo después de "Momentos que
  ya vivimos"), pero el `2b` (mobile) del mismo handoff SÍ tiene "Galería"
  como heading independiente. Se agregó ese heading al desktop (antes de
  `#galleryGrid`) para poder tener un texto editable ahí — no es contenido
  inventado de cero, es un heading que ya estaba en el diseño aprobado, solo
  que no se había portado a la versión desktop hasta ahora.
- Deliberadamente afuera: nav del header ("Vidriera"/"Calendario"/etc.),
  botones, pills, "Sponsors de {evento}" (dinámico, interpola el nombre del
  evento) — son chrome de interacción o contenido dinámico, no "rótulos
  editoriales fijos" como pidió el cliente.

**Schema** (`db/migrations/004_textos.sql`, corrida por el usuario en el SQL
Editor): tabla nueva `vidriera_textos` (`academia_id`, `clave`, `contenido`,
`negrita` boolean derivado, `unique(academia_id, clave)`). A diferencia de
las migraciones 001-003 (solo agregaban columnas a tablas ya cubiertas por
RLS), esta SÍ necesitó política propia — agregada tanto en la migración
(con guardas `if not exists` sobre `pg_policies` para que sea idempotente,
`create policy` no soporta `if not exists` nativo) como en `db/policies.sql`
(select público, write solo admin de su propia academia — mismo patrón que
`vidriera_eventos`).

**"Negrita simple"**: no es un editor de texto enriquecido — es una
convención mínima tipo markdown, `**así**`, embebida directo en `contenido`.
El botón de negrita en el textarea de edición envuelve/desenvuelve la
selección actual con `**` (usa `selectionStart`/`selectionEnd` del
textarea); tanto el panel admin como la vidriera pública renderizan
reemplazando `**texto**` por `<strong>texto</strong>` **después** de escapar
el contenido (nunca se guarda ni se interpreta HTML, así que el contenido no
puede inyectar markup). `negrita` en la tabla es un flag derivado (se
recalcula solo en el backend en cada guardado, no es editable directo) —
sirve para que el panel admin sepa mostrar algo distinto si hiciera falta,
hoy no se usa para nada más que eso.

**Endpoints**: `GET /api/textos` (público, sin scoping por academia —
mismo criterio ya documentado para publicaciones/eventos/destacado: una
sola academia activa en la práctica) devuelve las 7 claves siempre, mezcla
lo guardado con el default. `GET /api/admin/textos` (scoping por academia,
agrega `personalizado: boolean`). `PUT /api/admin/textos/:clave` rechaza
claves fuera del catálogo con 400 — es la barrera contra crear bloques
nuevos, que esta etapa no soporta a propósito (pedido explícito del
cliente).

**Frontend**: `index.html` marca cada heading/subtítulo con
`data-texto-clave="..."`, conservando el texto hardcodeado como default/
fallback visible antes de que cargue JS (o si `loadTextos()` falla — se
degrada en silencio, mismo criterio que `loadDestacado`: no es protagonista,
no bloquea el resto de la carga). `admin.js` usa delegación de eventos sobre
`#textosList` en vez de atar listeners fila por fila — las filas se
reemplazan con `outerHTML` al entrar/salir de edición, así que atar
listeners por fila hubiera dejado listeners duplicados en las filas que no
cambiaron en cada re-render.

**Verificado end-to-end con Playwright contra Supabase real**: las 7 filas
cargan con label + contenido correctos; seleccionar una palabra dentro del
textarea y togglear negrita la envuelve en `**...**` y el preview en vivo
muestra `<strong>` de inmediato; guardado confirmado tanto en la fila (vuelve
a modo lectura con el `<strong>` aplicado) como en la vidriera pública real
(mismo `<strong>` en el HTML servido); togglear negrita de nuevo sobre la
selección exacta la saca limpiamente, restaurando el string original
carácter por carácter (confirmado con comparación exacta, no aproximada);
la vidriera pública vuelve a mostrar el texto plano sin `<strong>`. Sin
errores de consola. Al terminar, en vez de solo dejar el contenido igual al
original, se borró la fila de `vidriera_textos` directamente (no
alcanzaba con "mismo contenido que el default" — quedaba `personalizado:
true` en vez del estado real pre-test de "nunca editado") y el admin de
prueba, dejando la tabla en 0 filas otra vez.

---

### Sesión 2026-07-09 #13 — Etapa C: orden manual de la vidriera + anulación puntual del destacado + deshacer/rehacer

Construida la sección "Orden de la vidriera" que quedó preparada (inerte) en
la barra lateral desde la Etapa B (sesión #12). Tres features, todas dentro
de esa misma pantalla: orden manual por drag & drop, fijar/quitar un
destacado puntual (anula la rotación automática), y deshacer/rehacer de los
cambios de orden dentro de la sesión de navegador.

**Schema** (`db/migrations/003_orden_destacado_override.sql`, corrida por el
usuario en el SQL Editor — sin CLI/psql en este entorno para aplicarla yo
mismo, mismo procedimiento que las migraciones 001/002):
- `vidriera_publicaciones.orden` (integer, nullable). `null` = todavía sin
  ordenar a mano, cae al criterio viejo (`created_at desc`) como fallback —
  una publicación recién aprobada no queda invisible hasta que un admin la
  ubique.
- `vidriera_academias.destacado_override_id` (uuid, FK a
  `vidriera_publicaciones`, `on delete set null`). Se declaró con `alter
  table` en vez de inline en el `create table` de `vidriera_academias`
  (`db/schema.sql`) porque esa tabla se define ANTES que
  `vidriera_publicaciones` en el archivo y la FK necesita que la tabla
  referenciada ya exista — el `alter` se agregó después del `create table
  vidriera_publicaciones`.
- Sin cambios en `policies.sql`: ambas columnas se escriben siempre con
  `supabaseAdmin` (service_role) desde el panel de admin, mismo criterio que
  el resto de las escrituras de administración — RLS es a nivel de fila, no
  de columna, y las políticas de SELECT existentes siguen aplicando igual.

**Orden manual — diseño**: en vez de un esquema de índices fraccionarios,
cada guardado recalcula `orden = 0..N-1` para TODOS los ids recibidos
(`setOrden` en `publicaciones.repo.js`) — más simple y de sobra para el
volumen de una vidriera de academia (decenas de publicaciones). Nuevo
`GET /api/admin/publicaciones?estado=approved` (scoping por academia) y
`PUT /api/admin/publicaciones/orden { orden: [id, id, ...] }`. La vidriera
pública (`getPublicacionesAprobadas`) ahora ordena `orden asc nullsFirst:false,
created_at desc` en vez de solo `created_at desc`.

**Anulación del destacado — diseño**: `GET /api/publicaciones/destacado`
(público) cambió de forma — antes devolvía `{evento, destacadas}` o
`{destacado:null, mensaje}`; ahora es `{tipo: 'override'|'automatico'|'ninguno',
...}`, discriminado por `tipo`. Esto **rompe compatibilidad hacia atrás en el
contrato del endpoint**, así que `vidriera.js` (`loadDestacado`) se actualizó
para manejar los tres casos — el caso `'automatico'` se comporta exactamente
igual que antes (mismo copy, mismo link a `#sponsors`), solo cambió el
wrapper. El caso `'override'` no tiene contexto de evento (una sola
publicación fijada a mano), así que oculta la franja de sponsors y linkea
directo al WhatsApp de esa publicación en vez de a `#sponsors` — es además
más fiel al prototipo original, que linkeaba `wa.me` directo desde el banner
(la sesión #6 había implementado el caso automático apuntando a `#sponsors`,
que sigue así por continuidad, no se tocó).
- `getDestacadoOverrideActivo()` (`eventos.repo.js`) usa `supabaseAdmin`
  aunque es para una ruta pública: `vidriera_academias` no es de lectura
  pública por RLS (`academias_select` exige rol admin/super_admin), mismo
  criterio ya usado en `statsEvento()` — el dato resultante es público aunque
  la tabla fuente no lo sea. Si el override apunta a una publicación que
  después se rechazó o se borró, se degrada a la rotación automática en vez
  de romper (chequeo `estado = 'approved'` al resolver el override).
- **Mismo límite de scoping por academia que ya existía** (anotado arriba en
  "Decisiones pendientes"): la consulta pública del override no filtra por
  academia — devuelve el primer override activo que encuentre en cualquier
  academia. Es consistente con que publicaciones/eventos públicos tampoco
  scopean hoy (instalación de una sola academia activa en la práctica), no
  una inconsistencia nueva introducida acá.

**Deshacer/rehacer**: pedido explícito de que NO persista a un F5 — vive en
memoria (`currentOrder`/`undoStack`/`redoStack` en `admin.js`), se inicializa
una sola vez en `loadOrden()` (a diferencia de "Estadísticas", que sí
re-fetchea en cada visita a la pestaña, "Orden de la vidriera" NO —
recargar destruiría el historial). Cada drag hace guardado optimista
(re-pinta al toque, persiste en el fondo, toast si falla) y empuja un
snapshot al `undoStack`; deshacer/rehacer solo mueven `currentOrder` entre
ambos stacks y vuelven a guardar — no hay lógica especial de "revertir", es
la misma función `saveOrder` de siempre aplicada a un array distinto. Fijar/
quitar el destacado NO entra en este historial (pedido explícito: el
deshacer es solo para el orden).

**UI**: filas arrastrables con HTML5 drag & drop nativo (sin librería,
consistente con el resto del proyecto). El pedido de "tipo pizarra" se tomó
como justificación para que estas filas SÍ lleven la sombra marcada
(`--shadow-card`/`--card-radius`, sesión #11) a diferencia de las filas de
lista de la cola de admin o de clientes en super-admin (que no la llevan
—son listas pasivas, esto son objetos que se arrastran).

**Bugs reales encontrados y corregidos durante la verificación:**
- El servidor de desarrollo (`node --watch`) no recogió los cambios de rutas
  nuevas en `admin.routes.js` — quedó sirviendo código viejo (404 en
  `GET /api/admin/publicaciones` pese a que el archivo y el router, revisados
  en un proceso Node nuevo, estaban correctos). Se resolvió reiniciando el
  proceso. Vale la pena tenerlo presente: `--watch` no es 100% confiable para
  detectar todos los cambios de archivos nuevos/reestructurados.
- **Mismo bug de `[hidden]` documentado en sesiones anteriores, esta vez sí
  se me escapó**: `.mm-destacado-banner` (el aviso "Destacado fijo activo")
  declaraba `display: flex` sin el override `[hidden]{display:none}` — pese a
  tener la regla escrita como checklist en `styles.css` desde la sesión #9.
  Encontrado porque el test de Playwright esperaba que el banner se ocultara
  al hacer click en "Quitar anulación" y no lo hacía. Corregido agregando el
  override que faltaba. Confirma que la regla documentada ayuda pero no
  reemplaza la verificación real — hay que seguir revisando cada clase nueva
  con `display` a mano.

**Verificado end-to-end contra Supabase real con Playwright** (servidor HTTP
real, 4 publicaciones aprobadas sembradas vía el flujo real crear+aprobar):
drag & drop de una fila confirmado contra la tabla (`orden` recalculado
0..3), la vidriera pública reflejando el nuevo orden tanto por API como
visualmente en la grilla; fijar un destacado confirmado en la vidriera
pública real (banner, sin sponsors, link a WhatsApp correcto, orden de grilla
sin cambios); quitar la anulación confirmado (banner se oculta, vidriera
vuelve a modo automático); deshacer y rehacer confirmados dentro de la misma
sesión de página (orden vuelve exacto al estado anterior/siguiente). Sin
errores de consola en la corrida final. Datos y usuarios de prueba borrados
al final por id exacto; confirmado que `destacado_override_id` de Melody
Music quedó en `null` (mismo estado en que se encontró).

---

### Sesión 2026-07-09 #12 — Etapa B: barra lateral en el panel de admin (`admin.html`)

Rediseño de navegación pedido por el cliente como "Etapa B" (terminología
propia, no mapea a las Etapas 1/2 del proyecto de más arriba — esas son de
infraestructura/backend, esto es de UX del panel de admin). Cambio de layout
puro: la lógica de moderación y estadísticas no se tocó.

- **Header horizontal + tabs → barra lateral fija.** `admin.html` ya no tiene
  el `<header>` de 76px con nav horizontal; la barra lateral (260px, `position:
  sticky`) absorbe esa identidad: logo + nombre de academia arriba, después
  avatar + badge de rol + email del usuario logueado, después el menú de
  navegación. El contenido de "Cola de aprobación" y "Estadísticas de vistas"
  es exactamente el mismo HTML/JS que antes (mismos ids `tabQueue`/`tabStats`,
  misma lógica de `renderQueue`/`renderPreview`/`moderar`/`loadStats`), solo
  que ahora vive dentro de `<main class="mm-app-main">` y se togglea desde
  botones de la barra lateral (`navQueueBtn`/`navStatsBtn`) en vez de tabs
  (`tabQueueBtn`/`tabStatsBtn` — renombrados, `setActiveTab` pasó a llamarse
  `setActiveSection`).
- **Preparado para las próximas secciones sin rehacer el layout** (pedido
  explícito): dos ítems `.mm-sidebar-item.disabled` ("Orden de la vidriera",
  "Textos de la página") ya están en el menú, inertes, con el mismo patrón
  visual que se usó para "Categorías"/"Eventos" en el header viejo. Sumar una
  sección real más adelante es: un botón más en el nav, un `<section>` más en
  `.mm-app-main`, y un branch más en `setActiveSection` — no hace falta tocar
  la estructura de la barra.
- Los nombres "Categorías"/"Eventos" (nav placeholder del header viejo, nunca
  tuvieron funcionalidad) no se migraron a la barra lateral — el cliente
  definió explícitamente los 4 ítems del menú nuevo (2 reales + 2 futuros) y
  esos dos no están en la lista, así que se dejaron afuera en vez de
  arrastrarlos sin que nadie los pidiera.
- Sombras marcadas (sesión #11) aplicadas también acá: `.mm-preview-card`
  (preview de la publicación seleccionada) ya las tenía desde esa sesión, sin
  cambios adicionales necesarios — se reconfirmó con Playwright que el
  `box-shadow` sigue presente después del rediseño de layout.
- **Aplicado el mismo criterio del bug de `[hidden]`** (documentado como
  patrón a evitar desde la sesión #9): `.mm-app-shell` declara `display:flex`,
  así que se agregó `.mm-app-shell[hidden]{display:none}` desde el principio.
  Esta vez no hubo que depurarlo con captura de pantalla — funcionó a la
  primera.
- **Verificado con Playwright de punta a punta contra Supabase real**,
  sembrando una publicación nueva + una aprobada con vistas vía el flujo real
  (familia crea, admin aprueba): login rechazado para no-admin (sin cambios,
  no se tocó esa parte), gate visualmente oculto tras loguearse, sidebar y
  email visibles, ítem activo correcto en cada sección, cambio de sección
  funcionando (oculta/muestra el `<section>` correcto), rechazo de una
  publicación con motivo confirmado contra la base real (la cola quedó en 0
  después), estadísticas con la publicación aprobada y su barra proporcional.
  Sin errores de consola. Datos de prueba borrados al final por id exacto.
- No se tocó `index.html`/`styles.css` (vidriera) ni `super-admin.html`/
  `super-admin.css` — confirmado que siguen respondiendo 200 después del
  cambio, ninguno depende de las clases que se borraron de `admin.css`
  (`.mm-tabs`/`.mm-tab`, dead code eliminado en vez de dejarlo sin usar).

---

### Sesión 2026-07-09 #11 — Cambio de dirección visual: de "flat" a sombras marcadas

**Cambio deliberado que contradice el README original del handoff**
(`design-bundle/design_handoff_portal_padres/README.md`), que pedía
explícitamente "sober/flat... explícitamente no glossy/3D/metallic". El cliente
decidió lo contrario después de comparar alternativas — queda documentado acá
y en `ARQUITECTURA.md` §6.2 como una decisión posterior, no un error de
implementación de las sesiones #6/#8/#9 (esas sí siguieron el README al pie de
la letra, correctamente, en su momento).

**1. Herramienta de comparación temporal** (`comparacion-estilo.html`,
ya no existe — se armó y se borró en esta misma sesión)
- Página aparte, no enlazada desde ningún HTML de la app, mostrando 3 niveles
  de sombra lado a lado (A plano / C moderado / B exagerado) sobre datos
  reales, para que el cliente decidiera con el ojo puesto en la app real y no
  en una descripción abstracta.
- No había publicaciones aprobadas en la base real en ese momento — se
  sembraron 2 vía el flujo real (familia crea → admin aprueba), no por
  insert directo, para que la comparación mostrara la tarjeta tal como se ve
  en producción. La cuenta de familia (`familia.demo@bariloche.com` /
  `DemoFamilia2026`, rol cliente) se creó como persistente a propósito (borrar
  al dueño de las publicaciones las hubiera borrado en cascada); el admin
  usado solo para aprobar sí era descartable (nada referencia al admin que
  aprobó) y se borró en el momento.
- El cliente pidió exagerar más la columna B (la diferencia inicial no se
  notaba) y agregar una columna C intermedia — se reordenaron visualmente
  como A→C→B (de menor a mayor profundidad) aunque el pedido las nombraba
  A/B/C en otro orden, para que la progresión se leyera de izquierda a
  derecha sin ambigüedad.

**2. Decisión final: estilo B (sombra exagerada) al proyecto real**
- Nuevos tokens en `:root` de `public/css/styles.css`: `--shadow-card` (dos
  capas, `0 24px 48px rgba(26,26,26,.30), 0 10px 20px rgba(26,26,26,.20)`) y
  `--card-radius: 16px` (antes 10px). Deliberadamente más marcado que un
  estándar de producción — decisión consciente del cliente, no una
  recomendación de buenas prácticas.
- Aplicado a toda superficie tipo tarjeta en las tres pantallas:
  `.mm-biz-card`, `.mm-sponsor-card`, `.mm-event-card`, `.mm-past-event-card`,
  `.mm-testimonial-card`, `.mm-modal` (login, compartido por vidriera/admin/
  super-admin) y `.mm-preview-card` (`admin.css`). Sin cambios en pills,
  botones, filas de lista (cola de admin, clientes de super-admin), badges ni
  placeholders de imagen/QR — no son "tarjetas" en el vocabulario de
  componentes de la app.
- `.mm-sponsor-card` es la única que retuvo su borde (verde, `--accent-border`):
  no es decorativo, distingue un sponsor pago de una tarjeta de directorio
  común — se le sumó la sombra encima del borde en vez de reemplazarlo. El
  resto de las tarjetas perdió el borde de 1px (quedó `transparent`): a esta
  intensidad de sombra, borde + sombra se veía recargado.
- Tarjetas de negocio/evento/pasado/testimonio también llevan `transform:
  translateY(-4px)` (efecto "levantado"); el modal no lo necesita, ya tiene su
  propia señal de profundidad (overlay oscuro de fondo).
- **Verificado con Playwright en las tres pantallas** después del cambio:
  `.mm-biz-card` con `box-shadow` presente y `border-radius: 16px` (confirmado
  por CSS computado, no solo visual); filtro de categoría sigue funcionando
  (no se rompió nada de JS, esto fue un cambio 100% CSS); modal de login con
  sombra en vidriera, admin y super-admin; panel de admin logueado sin errores
  de consola (cola vacía es el estado real, no un bug). Capturas de las tres
  pantallas revisadas a simple vista además del chequeo automatizado.
- Datos de verificación (una publicación temporal + un admin temporal, ambos
  descartables) borrados al final. Las 2 publicaciones de la comparación
  también se borraron (pedido explícito, "cumplieron su función").

**3. `scripts/crear-usuario.mjs` ahora soporta `super_admin`**
- Extensión puntual pedida en la misma sesión: antes solo aceptaba
  `cliente`/`admin` (decisión explícita de la sesión #10, que ya no aplicaba
  una vez que hizo falta un `super_admin` real de prueba). `super_admin` no
  está atado a ninguna academia, así que el contrato de argumentos cambia para
  ese rol: `node scripts/crear-usuario.mjs <email> <password> super_admin [nombre]`
  (sin slug de academia — el 4to argumento pasa a ser directamente el nombre).
- Usado para crear `supergiza@bariloche.com` (persistente, no se borró) y
  verificado end-to-end contra `GET /api/super-admin/academias` con el JWT
  real.

**Cuentas reales/demo que quedaron en la base tras esta sesión** (ninguna es
descartable sin avisar, a diferencia de las `.tmp@` que sí se limpian solas):
`giza@bariloche.com` (admin, de la sesión #3), `supergiza@bariloche.com` /
`juani2026` (super_admin), `familia.demo@bariloche.com` / `DemoFamilia2026`
(cliente — hoy sin publicaciones propias, quedó huérfana después de borrar
las 2 de la comparación; no se borró la cuenta en sí porque no se pidió).

---

### Sesión 2026-07-09 #10 — Pre-despliegue: alta manual de familias + estados de error por sección

Dos pendientes detectados al revisar qué falta antes de desplegar (no eran
gaps de diseño, sino de operación real): cómo se da de alta una familia hoy, y
qué pasa en la vidriera si el backend falla (no "sin datos", sino error real).

**1. `scripts/crear-usuario.mjs`** (reemplaza a `crear-admin.mjs`)
- No hay ni va a haber self-registration en esta etapa — se pidió explícitamente
  no construirlo todavía (ni verificación de email). La solución es la mínima
  viable: generalizar el script existente para que reciba también el rol.
- `node scripts/crear-usuario.mjs <email> <password> <rol> [slug-academia] [nombre]`,
  `rol` es `cliente` o `admin` (`super_admin` no se crea acá: no está atado a
  academia). Mismo flujo que antes (`supabaseAdmin.auth.admin.createUser` +
  upsert en `vidriera_perfiles`), con el rol y el nombre como parámetros en vez
  de hardcodeados. Soporta variables de entorno (`USUARIO_EMAIL`/`_PASSWORD`/
  `_ROL`/`_ACADEMIA_SLUG`/`_NOMBRE`) para no dejar la contraseña en el
  historial de la shell, igual que el script viejo.
- `crear-admin.mjs` se borró (no un wrapper de compatibilidad: es un script
  interno de operación, no una API pública, no había nada que preservar) y el
  script de `package.json` pasó de `crear-admin` a `crear-usuario`.
- Verificado end-to-end contra Supabase real: alta de un `cliente` y de un
  `admin` reales (incluyendo `npm run crear-usuario --`), confirmado el
  registro en `vidriera_perfiles` con el rol y nombre correctos, y los tres
  casos de validación (rol inválido, faltan argumentos, slug de academia
  inexistente) fallan con mensaje claro y exit code 1. Usuarios de prueba
  borrados al final (el cascade de `auth.users` → `vidriera_perfiles` se
  encargó de la fila de perfil).
- Sigue siendo 100% manual — queda anotado en "Decisiones pendientes" si vale
  la pena un flujo de self-registration antes de producción.

**2. Estados de error por sección en la vidriera**
- Gap encontrado al repasar `public/js/vidriera.js`: los estados de "sin
  datos" (`mm-empty`) ya estaban bien cubiertos desde la sesión #6, pero si
  una carga fallaba de verdad (backend caído, red), no había mensaje — la
  sección quedaba con el `<div>` vacío del HTML inicial, sin feedback ni forma
  de reintentar sin recargar toda la página.
- Agregado `renderErrorState(containerId, mensaje, onRetry)` (helper genérico,
  `public/js/vidriera.js`) y una clase `.mm-error-state`/`.mm-error-text`
  puntual en `styles.css` (reusa `.mm-btn-outline` ya existente para el botón).
  Cada sección protagonista (`loadPublicaciones`, `loadEventosProximos`,
  `loadMomentos`) ahora atrapa el error de su propio fetch y muestra el
  mensaje + un botón "Reintentar" que vuelve a llamar a la misma función de
  carga, sin recargar la página ni afectar a las otras secciones.
- `loadMomentos` tiene dos fases independientes (lista de eventos pasados, y
  después galería+testimonios de esos eventos) — cada una atrapa su propio
  error por separado, así que si falla la segunda fase la fila de eventos
  pasados (que ya cargó bien) no se pisa con un estado de error.
- `loadDestacado` es la excepción a propósito: es una sección decorativa
  (banner de la semana + sponsors), no protagonista — si falla, se comporta
  igual que "no hay evento destacado esta semana" (se oculta sin dejar hueco)
  en vez de mostrar una caja de error que el usuario no puede accionar. Se
  loguea a consola para poder diagnosticarlo igual.
- **Gap adicional encontrado en el camino** (no estaba en el pedido original
  pero es la misma clase de problema): `loadMisReacciones()` se espera
  (`await`) ANTES del `Promise.all` de las cuatro secciones en `main()` — si
  ese fetch fallaba, ninguna de las cuatro secciones llegaba a cargar nunca,
  a pesar de no depender de "mis reacciones" para nada. Corregido con el mismo
  criterio que `loadDestacado`: degrada en silencio (reacciones arrancan en
  "inactivo", que es el estado por default de todos modos) en vez de tumbar
  toda la página.
- Verificado con Playwright interceptando rutas (`page.route(...)` devolviendo
  500) en vez de tirar el servidor real, para poder simular la falla de cada
  endpoint por separado con precisión: publicaciones, destacado, eventos
  próximos, y eventos generales (que rompe en cascada momentos+galería+
  testimonios) — cada uno mostró el mensaje esperado, sin errores de consola
  no manejados. Confirmado también el ciclo completo de recuperación: falla →
  aparece el error → se "arregla" el backend (se saca la intercepción) → click
  en "Reintentar" → la sección se recupera y vuelve a mostrar el estado real
  (en este caso, "Todavía no hay publicaciones", porque no hay datos cargados
  en la base ahora mismo — confirma que el retry ejecuta la carga real, no
  solo limpia el mensaje de error).

---

### Sesión 2026-07-09 #9 — Frontend: panel de super-administrador (`3a`) — cierra el handoff visual

Implementada la cuarta y última pantalla del handoff visual: gestión de
academias/clientes de la plataforma y catálogo de módulos por cliente. Solo
desktop (así lo pide el README). No se tocó el backend — la API de
super-admin ya existía completa desde Etapa 1/2.

- **Antes de arrancar**, por pedido explícito: se revisó si el bug de CSS
  `[hidden]` (apareció en la vidriera sesión #6 y de nuevo en el admin sesión
  #8) ya estaba documentado como *patrón a evitar* y no solo como entrada de
  bitácora. No lo estaba — dos entradas de sesión no son un lugar que alguien
  vaya a leer antes de escribir CSS nuevo. Se agregó: (1) un comment banner al
  tope de `public/css/styles.css` con la regla exacta y el porqué (cascada
  autor > user-agent), en el archivo donde efectivamente se agregan clases
  nuevas; (2) una referencia corta en `ARQUITECTURA.md` §6.1 para que quede
  también en la documentación "estable". Resultado: en esta sesión el patrón
  se aplicó **proactivamente** (`.mm-admin-gate`/`.mm-admin-shell` reusados de
  `admin.css`, ya traían su `[hidden]{display:none}` de la sesión anterior) y
  no volvió a aparecer — confirmado con Playwright, sin necesidad de
  depurarlo por tercera vez.
- **Página separada** `public/super-admin.html` + `super-admin.css` +
  `super-admin.js`, reusando `styles.css` (tokens, `.mm-avatar`) y **también
  las clases del panel de admin** (`.mm-admin-gate`, `.mm-admin-shell`,
  `.mm-queue-list`, `.mm-queue-header`, `.mm-preview-pane`, `.mm-eyebrow`) en
  vez de reinventar el layout de dos paneles — solo `super-admin.css` puntual
  para lo que sí es distinto (logo neutro, ancho de panel 340px vs 400px,
  filas de cliente, catálogo de módulos, switch). Mismo mecanismo de login
  liviano que vidriera/admin, con su propia clave de `localStorage`
  (`mm_superadmin_auth_session`) y verificación de rol contra
  `GET /api/super-admin/academias` (403 si no es `super_admin`).
- **Sin nav en el header**: a diferencia de 2a/2c, el prototipo de 3a no tiene
  fila de navegación (solo logo+título a la izquierda, avatar "SA" a la
  derecha) — se respetó tal cual, sin agregar nada.
- **Colores tomados del script, no del README**: a diferencia de la cola de
  aprobación (sesión #8, donde el README pisaba al script porque el script
  todavía tenía el burgundy viejo), acá el bloque `renderVals()` del `3a` en
  el prototipo YA usa el acento verde final (`ACCENT_G`) en todos los estilos
  de esta pantalla — se tomaron esos valores literales (pills de estado,
  borde de fila seleccionada, badge de plan, track del switch).
- **Sin botón para pausar/activar cliente ni para crear clientes nuevos**: el
  README de interacciones solo describe el toggle de módulos y la selección
  de fila; el propio prototipo lista "sumar un botón para pausar el cliente
  completo" como sugerencia de *próximo paso*, no como parte de esta pantalla
  — confirma que el estado activo/pausado es de solo lectura acá. La API sí
  tiene `POST /academias` y `POST /academias/:id/estado` (se usaron para
  sembrar datos de prueba), pero no se construyó UI para ellos: no están en
  el alcance de `3a`.
- **Bug real encontrado y corregido durante la verificación** (no la misma
  clase que `[hidden]`, uno nuevo): condición de carrera al cambiar de
  cliente rápido. `loadClientDetail()` no tenía guarda contra respuestas
  fuera de orden — si el fetch de módulos del cliente A (la selección por
  default al loguearse) tardaba más que el fetch disparado por click en el
  cliente B, la respuesta de A podía llegar *después* y pisar el panel de B
  con los datos de A. Encontrado porque un test de Playwright switcheaba de
  cliente muy rápido y el panel mostraba el cliente equivocado; confirmado
  que no era solo el test porque el toggle de módulo de esa corrida
  efectivamente escribió `galeria: true` en el cliente incorrecto en la base
  real (verificado con una consulta directa a `vidriera_academia_modulos`,
  no solo mirando la UI). Corregido con un contador de "última solicitud
  gana" en `loadClientDetail()`, y `toggleModulo()` ahora solo re-pinta el
  panel de detalle si el cliente togleado sigue siendo el seleccionado
  (el conteo "N de M módulos" de la fila en la lista izquierda sí se
  actualiza siempre, sin importar cuál esté seleccionado, porque ese cambio
  ya es real en el servidor pase lo que pase en la UI). Estado incorrecto
  causado por el bug revertido a mano después de confirmarlo.
- **Verificado end-to-end contra Supabase real** (servidor HTTP real,
  Playwright/Chromium headless): login no-super_admin rechazado con 403;
  login super_admin real entra; lista de clientes con datos reales (pill de
  estado, resumen "N de M módulos activos · Cliente desde {mes} de {año}");
  selección por default del primer cliente; cambio de cliente actualiza
  correctamente el panel de módulos (una vez corregida la condición de
  carrera, confirmado con esperas explícitas por respuesta de red en vez de
  timeouts a ciegas — mismo patrón de test que en sesiones anteriores);
  toggle de módulo confirmado contra la tabla real (no solo la UI) y
  confirmado que el conteo de la fila en la lista izquierda se actualiza sin
  refetchear toda la lista.
  - Se sembraron 2 academias de prueba temporales (una pausada, una con
    varios módulos activos) vía la API real de super-admin (no inserts
    directos) para tener un escenario multi-cliente representativo del
    prototipo; se borraron al final junto con los 2 usuarios de prueba, y se
    revirtió a mano el efecto colateral del bug de la condición de carrera
    sobre `Melody Music` (la única academia real) — quedó verificado
    (`vidriera_academia_modulos` con una sola fila, `vidriera` activo) que
    Supabase terminó en exactamente el mismo estado en que se encontró.

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
