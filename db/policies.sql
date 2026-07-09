-- =====================================================================
-- Vidriera Melody Music — Políticas de Row Level Security (RLS)
-- Aplicar DESPUÉS de schema.sql y seed.sql.
-- =====================================================================
--
-- ESTRATEGIA GENERAL
-- ==================
-- El backend usa supabaseAdmin (service_role) para todas las operaciones
-- de admin y super_admin. service_role SALTA RLS: no le aplica ninguna
-- política de este archivo. Por eso las políticas de escritura son una
-- segunda línea de defensa (acceso directo a la API de Supabase), no
-- el control primario.
--
-- Las políticas de LECTURA sí son relevantes para supabaseForToken
-- (cliente autenticado del backend) y para posibles accesos directos
-- futuros (ej. subscriptions en tiempo real).
--
-- ROLES  (vidriera_perfiles.rol)
-- ================================
--   cliente      Familia de alumno — ve/edita lo suyo
--   admin        Dueño/staff de academia — ve todo de su academia
--   super_admin  GIZA (proveedor) — ve todo
--
-- NOTA SOBRE VISTAS E INCREMENTOS ANÓNIMOS
-- =========================================
-- El contador `vistas` en vidriera_publicaciones lo incrementa el
-- backend con supabaseAdmin (service_role). No hay política que permita
-- a un usuario anónimo o autenticado hacer UPDATE directamente; si se
-- intentara por fuera del backend, fallaría correctamente.
--
-- NOTA SOBRE CONTEOS PÚBLICOS (RSVP, REACCIONES)
-- ================================================
-- Los conteos públicos de RSVP y reacciones se calculan en el backend
-- con supabaseAdmin. Los clientes autenticados solo pueden leer sus
-- propios registros vía supabaseForToken.
-- =====================================================================


-- =====================================================================
-- HELPERS (security definer para evitar recursión y subqueries repetidas)
-- =====================================================================

create or replace function vidriera_rol()
  returns text
  language sql stable security definer
  set search_path = public
as $$
  select rol from vidriera_perfiles where user_id = auth.uid()
$$;

create or replace function vidriera_academia_id()
  returns uuid
  language sql stable security definer
  set search_path = public
as $$
  select academia_id from vidriera_perfiles where user_id = auth.uid()
$$;


-- =====================================================================
-- vidriera_categorias
-- Tabla de referencia de solo lectura. Pública (la vidriera pública la usa
-- sin autenticación para mostrar el filtro de categorías).
-- =====================================================================

alter table vidriera_categorias enable row level security;

create policy "categorias_select_public"
  on vidriera_categorias for select
  using (true);

-- Sin políticas de escritura: solo service_role puede modificar el catálogo.


-- =====================================================================
-- vidriera_modulos
-- Catálogo global de módulos. Solo lectura para usuarios autenticados
-- (el admin necesita ver qué módulos existen; el super_admin los gestiona
-- via service_role desde el backend).
-- =====================================================================

alter table vidriera_modulos enable row level security;

create policy "modulos_select_authenticated"
  on vidriera_modulos for select
  using (auth.uid() is not null);

-- Sin políticas de escritura: el catálogo solo lo toca service_role.


-- =====================================================================
-- vidriera_academias
-- super_admin ve y gestiona todas; admin y cliente ven solo la suya.
-- Todas las escrituras van por service_role (panel super_admin del backend).
-- =====================================================================

alter table vidriera_academias enable row level security;

create policy "academias_select"
  on vidriera_academias for select
  using (
    vidriera_rol() = 'super_admin'
    or id = vidriera_academia_id()          -- admin y cliente ven solo la suya
  );

-- Escritura: solo super_admin (defensa en profundidad; service_role bypassa RLS).
create policy "academias_write_superadmin"
  on vidriera_academias for all
  using    (vidriera_rol() = 'super_admin')
  with check (vidriera_rol() = 'super_admin');


-- =====================================================================
-- vidriera_academia_modulos
-- Mismo criterio que academias: super_admin ve todo, el resto solo su academia.
-- =====================================================================

alter table vidriera_academia_modulos enable row level security;

create policy "academia_modulos_select"
  on vidriera_academia_modulos for select
  using (
    vidriera_rol() = 'super_admin'
    or academia_id = vidriera_academia_id()
  );

create policy "academia_modulos_write_superadmin"
  on vidriera_academia_modulos for all
  using    (vidriera_rol() = 'super_admin')
  with check (vidriera_rol() = 'super_admin');


-- =====================================================================
-- vidriera_perfiles
-- Cada usuario lee solo su propio perfil. super_admin lee todos.
-- Escritura exclusivamente por service_role: el backend crea perfiles
-- al registrar usuarios y el admin asigna roles; nunca desde el cliente.
-- Esto evita escalada de privilegios (un usuario no puede cambiar su rol).
-- =====================================================================

alter table vidriera_perfiles enable row level security;

create policy "perfiles_select"
  on vidriera_perfiles for select
  using (
    user_id = auth.uid()
    or vidriera_rol() = 'super_admin'
  );

-- Sin políticas de INSERT/UPDATE/DELETE: solo service_role puede tocar perfiles.


-- =====================================================================
-- vidriera_publicaciones
--
-- SELECT
--   • Público (anon):   solo publicaciones approved
--   • Cliente (dueño):  todas las suyas (cualquier estado) + approved ajenas
--   • Admin:            todas las de su academia
--   • super_admin:      todas
--
-- INSERT
--   • Solo clientes, para su propio owner_user_id y academia, en estado pending.
--
-- UPDATE
--   • El dueño puede editar campos de contenido solo mientras está pending o
--     rejected. Después de la edición el estado vuelve a quedar 'pending'.
--   • Las publicaciones approved se editan a través de vidriera_publicaciones_ediciones.
--   • Moderación (cambiar estado a approved/rejected) → service_role.
--   • Incremento de vistas → service_role.
--
-- DELETE
--   • Ninguna política de cliente: solo service_role.
-- =====================================================================

alter table vidriera_publicaciones enable row level security;

create policy "pub_select"
  on vidriera_publicaciones for select
  using (
    estado = 'approved'                                -- público
    or owner_user_id = auth.uid()                      -- dueño ve las suyas
    or (
      vidriera_rol() = 'admin'
      and academia_id = vidriera_academia_id()         -- admin ve su academia
    )
    or vidriera_rol() = 'super_admin'
  );

create policy "pub_insert_cliente"
  on vidriera_publicaciones for insert
  with check (
    vidriera_rol() = 'cliente'
    and owner_user_id = auth.uid()
    and academia_id   = vidriera_academia_id()
    and estado        = 'pending'                      -- siempre empieza en pending
  );

create policy "pub_update_owner"
  on vidriera_publicaciones for update
  -- USING: solo puede editar sus propias publicaciones no aprobadas
  using (
    owner_user_id = auth.uid()
    and estado in ('pending', 'rejected')
  )
  -- WITH CHECK: tras la edición, el estado debe quedar 'pending'
  -- (no puede auto-aprobarse ni auto-rechazarse)
  with check (
    owner_user_id = auth.uid()
    and academia_id = vidriera_academia_id()
    and estado      = 'pending'
  );


-- =====================================================================
-- vidriera_publicaciones_ediciones
--
-- SELECT
--   • El dueño de la publicación ve sus propias ediciones.
--   • El admin de la academia ve todas las ediciones de su academia.
--   • super_admin ve todo.
--
-- INSERT
--   • Solo el dueño de la publicación puede proponer ediciones,
--     y solo cuando la publicación está aprobada (approved).
--     Las publicaciones pending/rejected se editan directamente.
--
-- UPDATE / DELETE
--   • Solo service_role (moderación desde el panel de admin).
-- =====================================================================

alter table vidriera_publicaciones_ediciones enable row level security;

create policy "edic_select"
  on vidriera_publicaciones_ediciones for select
  using (
    autor_user_id = auth.uid()                         -- el autor ve sus ediciones
    or exists (                                        -- o el dueño de la publicación
      select 1 from vidriera_publicaciones p
      where p.id = publicacion_id
        and p.owner_user_id = auth.uid()
    )
    or (                                               -- admin de la misma academia
      vidriera_rol() = 'admin'
      and exists (
        select 1 from vidriera_publicaciones p
        where p.id = publicacion_id
          and p.academia_id = vidriera_academia_id()
      )
    )
    or vidriera_rol() = 'super_admin'
  );

create policy "edic_insert_owner"
  on vidriera_publicaciones_ediciones for insert
  with check (
    autor_user_id = auth.uid()
    and estado = 'pending'                             -- siempre empieza en pending
    and exists (
      select 1 from vidriera_publicaciones p
      where p.id = publicacion_id
        and p.owner_user_id = auth.uid()               -- solo el dueño propone ediciones
        and p.estado = 'approved'                      -- solo para publicaciones aprobadas
    )
  );

-- Sin políticas UPDATE/DELETE: la moderación (aprobar/rechazar) va por service_role.


-- =====================================================================
-- vidriera_eventos
-- El calendario es completamente público.
-- Escritura: solo admin de la misma academia (y service_role en el backend).
-- =====================================================================

alter table vidriera_eventos enable row level security;

create policy "eventos_select_public"
  on vidriera_eventos for select
  using (true);

create policy "eventos_write_admin"
  on vidriera_eventos for all
  using (
    vidriera_rol() = 'admin'
    and academia_id = vidriera_academia_id()
  )
  with check (
    vidriera_rol() = 'admin'
    and academia_id = vidriera_academia_id()
  );


-- =====================================================================
-- vidriera_evento_sponsors
-- Los sponsors de un evento son públicos (se muestran en la vidriera).
-- Escritura: solo admin de la academia del evento.
-- =====================================================================

alter table vidriera_evento_sponsors enable row level security;

create policy "sponsors_select_public"
  on vidriera_evento_sponsors for select
  using (true);

create policy "sponsors_write_admin"
  on vidriera_evento_sponsors for all
  using (
    vidriera_rol() = 'admin'
    and exists (
      select 1 from vidriera_eventos e
      where e.id = evento_id
        and e.academia_id = vidriera_academia_id()
    )
  )
  with check (
    vidriera_rol() = 'admin'
    and exists (
      select 1 from vidriera_eventos e
      where e.id = evento_id
        and e.academia_id = vidriera_academia_id()
    )
  );


-- =====================================================================
-- vidriera_rsvp
-- RSVP es privado (no se expone quién confirmó asistencia al público).
-- Los conteos públicos los calcula el backend con supabaseAdmin.
--
-- SELECT:  el propio usuario + admin de la academia + super_admin.
-- UPSERT:  el propio usuario, para eventos de su academia.
-- DELETE:  el propio usuario (cancelar asistencia).
-- =====================================================================

alter table vidriera_rsvp enable row level security;

create policy "rsvp_select"
  on vidriera_rsvp for select
  using (
    user_id = auth.uid()
    or (
      vidriera_rol() = 'admin'
      and exists (
        select 1 from vidriera_eventos e
        where e.id = evento_id
          and e.academia_id = vidriera_academia_id()
      )
    )
    or vidriera_rol() = 'super_admin'
  );

create policy "rsvp_upsert"
  on vidriera_rsvp for insert
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from vidriera_eventos e
      where e.id = evento_id
        and e.academia_id = vidriera_academia_id()    -- el evento es de su academia
    )
  );

create policy "rsvp_update_own"
  on vidriera_rsvp for update
  using    (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "rsvp_delete_own"
  on vidriera_rsvp for delete
  using (user_id = auth.uid());


-- =====================================================================
-- vidriera_reacciones
-- Mismo criterio de privacidad que RSVP: no se expone individualmente
-- quién reaccionó. Los conteos los calcula el backend con supabaseAdmin.
--
-- El toggle (agregar/quitar reacción) se implementa como INSERT seguido
-- de DELETE condicional; ambas operaciones necesitan sus políticas.
-- =====================================================================

alter table vidriera_reacciones enable row level security;

create policy "reacciones_select"
  on vidriera_reacciones for select
  using (
    user_id = auth.uid()
    or (
      vidriera_rol() = 'admin'
      and exists (
        select 1 from vidriera_eventos e
        where e.id = evento_id
          and e.academia_id = vidriera_academia_id()
      )
    )
    or vidriera_rol() = 'super_admin'
  );

create policy "reacciones_insert"
  on vidriera_reacciones for insert
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from vidriera_eventos e
      where e.id = evento_id
        and e.academia_id = vidriera_academia_id()
    )
  );

create policy "reacciones_delete_own"
  on vidriera_reacciones for delete
  using (user_id = auth.uid());


-- =====================================================================
-- vidriera_galeria
-- La galería de fotos de eventos pasados es pública.
-- Escritura: solo admin de la academia del evento.
-- =====================================================================

alter table vidriera_galeria enable row level security;

create policy "galeria_select_public"
  on vidriera_galeria for select
  using (true);

create policy "galeria_write_admin"
  on vidriera_galeria for all
  using (
    vidriera_rol() = 'admin'
    and exists (
      select 1 from vidriera_eventos e
      where e.id = evento_id
        and e.academia_id = vidriera_academia_id()
    )
  )
  with check (
    vidriera_rol() = 'admin'
    and exists (
      select 1 from vidriera_eventos e
      where e.id = evento_id
        and e.academia_id = vidriera_academia_id()
    )
  );


-- =====================================================================
-- vidriera_testimonios
-- Los testimonios son públicos (se muestran en la página del evento).
-- Escritura: solo el propio usuario, para eventos de su academia.
-- Sin UPDATE/DELETE desde el cliente: el admin usa service_role para
-- moderar si fuera necesario.
-- =====================================================================

alter table vidriera_testimonios enable row level security;

create policy "testimonios_select_public"
  on vidriera_testimonios for select
  using (true);

create policy "testimonios_insert"
  on vidriera_testimonios for insert
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from vidriera_eventos e
      where e.id = evento_id
        and e.academia_id = vidriera_academia_id()
    )
  );

-- Sin UPDATE/DELETE de cliente: moderación de testimonios va por service_role.


-- =====================================================================
-- FIN DE POLÍTICAS
-- =====================================================================
--
-- RESUMEN DE ACCESO POR TABLA
-- ============================
--
-- Tabla                           Anón  Cliente  Admin    Super
-- ------------------------------ ----- -------- -------- -----
-- vidriera_categorias             R     R        R        R
-- vidriera_modulos                -     R        R        R
-- vidriera_academias              -     R(suya)  R(suya)  CRUD
-- vidriera_academia_modulos       -     R(suya)  R(suya)  CRUD
-- vidriera_perfiles               -     R(suyo)  -        R(todos)
-- vidriera_publicaciones          R*    CRUD**   R(acad)  R(todos)
-- vidriera_publicaciones_edicion  -     R(suyas) R(acad)  R(todos)
--   _es                           -     I(own†)  -        -
-- vidriera_eventos                R     R        CRUD     R
-- vidriera_evento_sponsors        R     R        CRUD     R
-- vidriera_rsvp                   -     CRUD(own)-admin   R
-- vidriera_reacciones             -     ID(own)  R(acad)  R
-- vidriera_galeria                R     R        CRUD     R
-- vidriera_testimonios            R     R+I      R        R
--
-- Leyenda:
--   R  = SELECT    C = INSERT    U = UPDATE    D = DELETE
--   *  = solo published (estado='approved')
--   ** = INSERT propio, UPDATE solo pending/rejected
--   †  = solo para publicaciones en estado approved
--   "acad" = scope limitado a la propia academia
--   "own"  = scope limitado al propio user_id
-- =====================================================================
