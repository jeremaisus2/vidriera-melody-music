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
export async function getCatalogoModulos() {
  const { data, error } = await supabaseAdmin.from('vidriera_modulos').select('*').order('orden', { ascending: true });
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

  return catalogo.map((modulo) => {
    const activacion = activaciones.find((am) => am.modulo_clave === modulo.clave);
    return {
      ...modulo,
      activo:      activacion?.activo ?? false,
      activado_at: activacion?.activo ? (activacion.activado_at ?? null) : null,
    };
  });
}

/**
 * Aplica un patch de activación de módulos para una academia.
 * Body: { clave: boolean }. Claves no reconocidas se ignoran y se reportan.
 * Sincroniza el cache modulos_activos de la academia.
 */
export async function setModulosAcademia(academia_id, cambios) {
  const { data: catalogo, error: errorCatalogo } = await supabaseAdmin.from('vidriera_modulos').select('clave');
  if (errorCatalogo) throw errorCatalogo;
  const clavesCatalogo = new Set(catalogo.map((m) => m.clave));
  const invalidas = Object.keys(cambios).filter((k) => !clavesCatalogo.has(k));

  for (const [clave, activo] of Object.entries(cambios)) {
    if (!clavesCatalogo.has(clave)) continue;
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
