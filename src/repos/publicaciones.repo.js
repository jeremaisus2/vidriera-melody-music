import { supabaseAdmin, supabasePublic } from '../config/supabase.js';

// ---------------------------------------------------------------------------
// Publicaciones — lectura pública (cliente anon; RLS filtra a estado=approved)
// ---------------------------------------------------------------------------
export async function getPublicacionesAprobadas({ categoria } = {}) {
  let query = supabasePublic
    .from('vidriera_publicaciones')
    .select('*')
    .eq('estado', 'approved')
    .order('created_at', { ascending: false });

  if (categoria) query = query.eq('categoria', categoria);

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function getPublicacionById(id) {
  const { data, error } = await supabasePublic
    .from('vidriera_publicaciones')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// ---------------------------------------------------------------------------
// Publicaciones — lectura autenticada (cliente dueño; RLS permite ver lo suyo)
// ---------------------------------------------------------------------------
export async function getPublicacionesByOwner(supabase, owner_user_id) {
  const { data: propias, error } = await supabase
    .from('vidriera_publicaciones')
    .select('*')
    .eq('owner_user_id', owner_user_id)
    .order('created_at', { ascending: false });
  if (error) throw error;
  if (propias.length === 0) return [];

  const { data: pendientes, error: errorEdiciones } = await supabase
    .from('vidriera_publicaciones_ediciones')
    .select('*')
    .in('publicacion_id', propias.map((p) => p.id))
    .eq('estado', 'pending');
  if (errorEdiciones) throw errorEdiciones;

  return propias.map((p) => ({
    ...p,
    edicion_pendiente: pendientes.find((e) => e.publicacion_id === p.id) ?? null,
  }));
}

// ---------------------------------------------------------------------------
// Publicaciones — escritura
// ---------------------------------------------------------------------------

// El incremento de vistas siempre corre con service_role: ninguna política de
// RLS permite el UPDATE a un usuario anónimo o autenticado (ver policies.sql).
export async function incrementarVistas(id) {
  const { data: pub, error: errorSelect } = await supabaseAdmin
    .from('vidriera_publicaciones')
    .select('vistas')
    .eq('id', id)
    .maybeSingle();
  if (errorSelect) throw errorSelect;
  if (!pub) return;

  const { error } = await supabaseAdmin
    .from('vidriera_publicaciones')
    .update({ vistas: pub.vistas + 1 })
    .eq('id', id);
  if (error) throw error;
}

export async function crearPublicacion(supabase, { academia_id, owner_user_id, nombre, categoria, descripcion, imagen_url, whatsapp }) {
  const { data, error } = await supabase
    .from('vidriera_publicaciones')
    .insert({
      academia_id,
      owner_user_id,
      nombre,
      categoria,
      descripcion: descripcion ?? null,
      imagen_url: imagen_url ?? null,
      whatsapp: whatsapp ?? null,
      estado: 'pending',
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

/**
 * Editar publicación según estado:
 * - approved  → crea una edición pendiente; el dato público NO cambia.
 * - pending/rejected → actualiza en-place y vuelve a pending.
 */
export async function editarPublicacion(supabase, id, cambios, autor_user_id) {
  const { data: p, error: errorSelect } = await supabase
    .from('vidriera_publicaciones')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (errorSelect) throw errorSelect;
  if (!p) return { tipo: 'not_found' };

  if (p.estado === 'approved') {
    const { data: edicion, error } = await supabase
      .from('vidriera_publicaciones_ediciones')
      .insert({
        publicacion_id: p.id,
        autor_user_id,
        cambios,
        estado: 'pending',
      })
      .select()
      .single();
    if (error) throw error;
    return { tipo: 'edicion_creada', edicion };
  }

  const { data: publicacion, error } = await supabase
    .from('vidriera_publicaciones')
    .update({ ...cambios, estado: 'pending' })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return { tipo: 'publicacion_actualizada', publicacion };
}

// ---------------------------------------------------------------------------
// Moderación (panel admin) — siempre con service_role
// ---------------------------------------------------------------------------
export async function getPendientes(academia_id) {
  const { data: publicaciones, error: errorPub } = await supabaseAdmin
    .from('vidriera_publicaciones')
    .select('*')
    .eq('academia_id', academia_id)
    .eq('estado', 'pending');
  if (errorPub) throw errorPub;

  const { data: ediciones, error: errorEdic } = await supabaseAdmin
    .from('vidriera_publicaciones_ediciones')
    .select('*, publicacion:vidriera_publicaciones!inner(*)')
    .eq('estado', 'pending')
    .eq('vidriera_publicaciones.academia_id', academia_id);
  if (errorEdic) throw errorEdic;

  return { publicaciones, ediciones };
}

export async function moderarPublicacion(academia_id, id, accion, motivo = null) {
  const { data: p, error: errorSelect } = await supabaseAdmin
    .from('vidriera_publicaciones')
    .select('*')
    .eq('id', id)
    .eq('academia_id', academia_id)
    .maybeSingle();
  if (errorSelect) throw errorSelect;
  if (!p) return null;
  if (p.estado !== 'pending') return { error: `La publicación está en estado "${p.estado}", no "pending"` };

  const { data, error } = await supabaseAdmin
    .from('vidriera_publicaciones')
    .update({ estado: accion, motivo_rechazo: accion === 'rejected' ? motivo : null })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function moderarEdicion(academia_id, id, accion, motivo = null) {
  const { data: e, error: errorSelect } = await supabaseAdmin
    .from('vidriera_publicaciones_ediciones')
    .select('*, publicacion:vidriera_publicaciones!inner(academia_id)')
    .eq('id', id)
    .eq('vidriera_publicaciones.academia_id', academia_id)
    .maybeSingle();
  if (errorSelect) throw errorSelect;
  if (!e) return null;
  if (e.estado !== 'pending') return { error: `La edición está en estado "${e.estado}", no "pending"` };

  const { data: edicion, error } = await supabaseAdmin
    .from('vidriera_publicaciones_ediciones')
    .update({
      estado: accion,
      motivo_rechazo: accion === 'rejected' ? motivo : null,
      resuelto_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;

  let publicacion = null;
  if (accion === 'approved') {
    const { data, error: errorUpdate } = await supabaseAdmin
      .from('vidriera_publicaciones')
      .update(e.cambios)
      .eq('id', e.publicacion_id)
      .select()
      .single();
    if (errorUpdate) throw errorUpdate;
    publicacion = data;
  }

  return { edicion, publicacion };
}

// ---------------------------------------------------------------------------
// Estadísticas de vistas (panel admin)
// ---------------------------------------------------------------------------
export async function getEstadisticasVistas(academia_id, { categoria, estado } = {}) {
  let query = supabaseAdmin
    .from('vidriera_publicaciones')
    .select('id, nombre, categoria, estado, owner_user_id, vistas')
    .eq('academia_id', academia_id);

  if (categoria) query = query.eq('categoria', categoria);
  if (estado) query = query.eq('estado', estado);

  const { data: filtradas, error } = await query;
  if (error) throw error;

  const porPublicacion = filtradas.slice().sort((a, b) => b.vistas - a.vistas);
  const totalVistas = filtradas.reduce((s, p) => s + p.vistas, 0);

  const categoriaMap = {};
  for (const p of filtradas) {
    categoriaMap[p.categoria] = (categoriaMap[p.categoria] ?? 0) + p.vistas;
  }
  const porCategoria = Object.entries(categoriaMap)
    .map(([cat, vistas]) => ({ categoria: cat, vistas }))
    .sort((a, b) => b.vistas - a.vistas);

  return { total_vistas: totalVistas, por_publicacion: porPublicacion, por_categoria: porCategoria };
}
