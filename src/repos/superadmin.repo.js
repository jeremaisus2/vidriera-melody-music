import { supabaseAdmin } from '../config/supabase.js';

function antiguedadDias(created_at) {
  return Math.floor((Date.now() - new Date(created_at).getTime()) / 86_400_000);
}

// ---------------------------------------------------------------------------
// Academias
// ---------------------------------------------------------------------------
export async function getAcademias() {
  const { data: academias, error } = await supabaseAdmin.from('vidriera_academias').select('*');
  if (error) throw error;

  return Promise.all(
    academias.map(async (a) => {
      const { count, error: errorCount } = await supabaseAdmin
        .from('vidriera_academia_modulos')
        .select('*', { count: 'exact', head: true })
        .eq('academia_id', a.id)
        .eq('activo', true);
      if (errorCount) throw errorCount;
      return { ...a, antiguedad_dias: antiguedadDias(a.created_at), modulos_activos_count: count ?? 0 };
    })
  );
}

export async function getAcademiaById(id) {
  const { data, error } = await supabaseAdmin.from('vidriera_academias').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function crearAcademia({ nombre, slug }) {
  const { data: existente, error: errorSelect } = await supabaseAdmin
    .from('vidriera_academias')
    .select('id')
    .eq('slug', slug)
    .maybeSingle();
  if (errorSelect) throw errorSelect;
  if (existente) return { error: `Ya existe una academia con el slug "${slug}"` };

  const { data, error } = await supabaseAdmin
    .from('vidriera_academias')
    .insert({ nombre, slug, estado: 'activa', modulos_activos: {} })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function editarAcademia(id, cambios) {
  if (cambios.slug) {
    const { data: existente, error: errorSelect } = await supabaseAdmin
      .from('vidriera_academias')
      .select('id')
      .eq('slug', cambios.slug)
      .neq('id', id)
      .maybeSingle();
    if (errorSelect) throw errorSelect;
    if (existente) return { error: `Ya existe una academia con el slug "${cambios.slug}"` };
  }

  const { data, error } = await supabaseAdmin
    .from('vidriera_academias')
    .update(cambios)
    .eq('id', id)
    .select()
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function setEstadoAcademia(id, estado) {
  const { data, error } = await supabaseAdmin
    .from('vidriera_academias')
    .update({ estado })
    .eq('id', id)
    .select()
    .maybeSingle();
  if (error) throw error;
  return data;
}

// ---------------------------------------------------------------------------
// Catálogo de módulos
// ---------------------------------------------------------------------------
/**
 * `incluirInactivos`: la pantalla de gestión del catálogo (Etapa E) necesita
 * ver también los dados de baja para poder reactivarlos; el resto de los
 * consumidores (conteo "N de M módulos" en la lista de clientes) solo debe
 * contar los módulos que efectivamente se siguen ofreciendo.
 */
export async function getCatalogoModulos({ incluirInactivos = false } = {}) {
  let query = supabaseAdmin.from('vidriera_modulos').select('*').order('orden', { ascending: true });
  if (!incluirInactivos) query = query.eq('activo', true);
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function getModulosAcademia(academia_id) {
  const [{ data: catalogo, error: errorCatalogo }, { data: activaciones, error: errorActivaciones }] = await Promise.all([
    supabaseAdmin.from('vidriera_modulos').select('*').order('orden', { ascending: true }),
    supabaseAdmin.from('vidriera_academia_modulos').select('*').eq('academia_id', academia_id),
  ]);
  if (errorCatalogo) throw errorCatalogo;
  if (errorActivaciones) throw errorActivaciones;

  // Un módulo dado de baja (activo=false en el catálogo) deja de ofrecerse
  // para activarlo de nuevo, pero si esta academia ya lo tenía activado no
  // puede desaparecer del panel sin dejar rastro (el admin necesita poder
  // verlo y desactivarlo); por eso el filtro es "sigue en el catálogo" O
  // "ya está activo para esta academia", no solo lo primero.
  return catalogo
    .filter((modulo) => modulo.activo || activaciones.some((am) => am.modulo_clave === modulo.clave && am.activo))
    .map((modulo) => {
      const activacion = activaciones.find((am) => am.modulo_clave === modulo.clave);
      return {
        ...modulo,
        activo:      activacion?.activo ?? false,
        activado_at: activacion?.activo ? (activacion.activado_at ?? null) : null,
      };
    });
}

/**
 * Alta de un módulo nuevo en el catálogo (Etapa E, panel super-admin).
 * El `orden` se asigna automáticamente al final del catálogo existente.
 */
export async function crearModulo({ clave, nombre, descripcion, incluido }) {
  const { data: existente, error: errorSelect } = await supabaseAdmin
    .from('vidriera_modulos')
    .select('clave')
    .eq('clave', clave)
    .maybeSingle();
  if (errorSelect) throw errorSelect;
  if (existente) return { error: `Ya existe un módulo con la clave "${clave}"` };

  const { data: maxOrdenRow, error: errorMax } = await supabaseAdmin
    .from('vidriera_modulos')
    .select('orden')
    .order('orden', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (errorMax) throw errorMax;
  const orden = (maxOrdenRow?.orden ?? 0) + 1;

  const { data, error } = await supabaseAdmin
    .from('vidriera_modulos')
    .insert({ clave, nombre, descripcion: descripcion ?? null, incluido, orden, activo: true })
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** Edita nombre/descripción/incluido. La clave (PK, referenciada por academia_modulos) no se edita. */
export async function editarModulo(clave, cambios) {
  const { data, error } = await supabaseAdmin
    .from('vidriera_modulos')
    .update(cambios)
    .eq('clave', clave)
    .select()
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** Alta/baja del módulo en el catálogo (soft delete: nunca se borra la fila). */
export async function setEstadoModulo(clave, activo) {
  const { data, error } = await supabaseAdmin
    .from('vidriera_modulos')
    .update({ activo })
    .eq('clave', clave)
    .select()
    .maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * Aplica un patch de activación de módulos para una academia.
 * Body: { clave: boolean }. Claves no reconocidas se ignoran y se reportan.
 * Sincroniza el cache modulos_activos de la academia.
 */
export async function setModulosAcademia(academia_id, cambios) {
  const [{ data: catalogo, error: errorCatalogo }, { data: activacionesActuales, error: errorActuales }] = await Promise.all([
    supabaseAdmin.from('vidriera_modulos').select('clave, activo'),
    supabaseAdmin.from('vidriera_academia_modulos').select('modulo_clave, activo').eq('academia_id', academia_id),
  ]);
  if (errorCatalogo) throw errorCatalogo;
  if (errorActuales) throw errorActuales;

  const catalogoPorClave = new Map(catalogo.map((m) => [m.clave, m]));
  const activoActualPorClave = new Map(activacionesActuales.map((am) => [am.modulo_clave, am.activo]));

  const invalidas = [];
  for (const [clave, activo] of Object.entries(cambios)) {
    const modulo = catalogoPorClave.get(clave);
    if (!modulo) { invalidas.push(clave); continue; }
    // Un módulo dado de baja del catálogo no se puede activar de nuevo para
    // un cliente que todavía no lo tenía activo — sí se lo puede seguir
    // desactivando si ya estaba activo (para no dejarlo atascado en "on").
    if (activo && !modulo.activo && !activoActualPorClave.get(clave)) { invalidas.push(clave); continue; }

    const { error } = await supabaseAdmin
      .from('vidriera_academia_modulos')
      .upsert({ academia_id, modulo_clave: clave, activo }, { onConflict: 'academia_id,modulo_clave' });
    if (error) throw error;
  }

  const { data: activas, error: errorActivas } = await supabaseAdmin
    .from('vidriera_academia_modulos')
    .select('modulo_clave')
    .eq('academia_id', academia_id)
    .eq('activo', true);
  if (errorActivas) throw errorActivas;

  const cache = {};
  activas.forEach((am) => { cache[am.modulo_clave] = true; });
  const { error: errorUpdate } = await supabaseAdmin
    .from('vidriera_academias')
    .update({ modulos_activos: cache })
    .eq('id', academia_id);
  if (errorUpdate) throw errorUpdate;

  return { invalidas, modulos: await getModulosAcademia(academia_id) };
}

// ---------------------------------------------------------------------------
// Resumen por cliente
// ---------------------------------------------------------------------------
export async function getResumenAcademia(academia_id) {
  const a = await getAcademiaById(academia_id);
  if (!a) return null;

  const [modulosActivos, { count: publicacionesCount, error: errorPub }, { count: eventosCount, error: errorEve }] = await Promise.all([
    getModulosAcademia(academia_id),
    supabaseAdmin.from('vidriera_publicaciones').select('*', { count: 'exact', head: true }).eq('academia_id', academia_id),
    supabaseAdmin.from('vidriera_eventos').select('*', { count: 'exact', head: true }).eq('academia_id', academia_id),
  ]);
  if (errorPub) throw errorPub;
  if (errorEve) throw errorEve;

  return {
    ...a,
    antiguedad_dias:         antiguedadDias(a.created_at),
    cliente_desde:           a.created_at.substring(0, 10),
    modulos_activos_detalle: modulosActivos.filter((m) => m.activo),
    totales: {
      publicaciones: publicacionesCount ?? 0,
      eventos:       eventosCount ?? 0,
    },
  };
}

// ---------------------------------------------------------------------------
// Configuración general de la plataforma (Etapa E)
// Tabla singleton (id fijo en 1) — ver db/schema.sql.
// ---------------------------------------------------------------------------
export async function getConfigPlataforma() {
  const { data, error } = await supabaseAdmin
    .from('vidriera_config_plataforma')
    .select('*')
    .eq('id', 1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function actualizarConfigPlataforma(cambios) {
  const { data, error } = await supabaseAdmin
    .from('vidriera_config_plataforma')
    .update({ ...cambios, updated_at: new Date().toISOString() })
    .eq('id', 1)
    .select()
    .maybeSingle();
  if (error) throw error;
  return data;
}
