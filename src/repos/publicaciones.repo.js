import { supabaseAdmin, supabasePublic } from '../config/supabase.js';

// ---------------------------------------------------------------------------
// Publicaciones — lectura pública (cliente anon; RLS filtra a estado=approved)
// ---------------------------------------------------------------------------
// Orden: primero lo ordenado a mano (orden asc), después lo que todavía no
// tiene orden asignado (orden null → nullsFirst:false lo manda al final),
// y dentro de "sin ordenar" el criterio viejo (más nuevo primero) para que
// una publicación recién aprobada no se pierda hasta que un admin la ubique.
export async function getPublicacionesAprobadas({ categoria } = {}) {
  let query = supabasePublic
    .from('vidriera_publicaciones')
    .select('*')
    .eq('estado', 'approved')
    .order('orden', { ascending: true, nullsFirst: false })
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

export async function crearPublicacion(supabase, { academia_id, owner_user_id, nombre, familia, categoria, descripcion, imagen_url, logo_url, sitio_web, instagram, direccion, whatsapp }) {
  const { data, error } = await supabase
    .from('vidriera_publicaciones')
    .insert({
      academia_id,
      owner_user_id,
      nombre,
      familia,
      categoria,
      descripcion: descripcion ?? null,
      imagen_url: imagen_url ?? null,
      logo_url: logo_url ?? null,
      sitio_web: sitio_web ?? null,
      instagram: instagram ?? null,
      direccion: direccion ?? null,
      whatsapp: whatsapp ?? null,
      estado: 'pending',
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

/**
 * Alta directa desde el panel de admin (Etapa G): igual que crearPublicacion
 * pero con supabaseAdmin (service_role, sin pasar por RLS del cliente) y
 * `estado: 'approved'` desde el inicio — no pasa por la cola de moderación.
 */
export async function crearPublicacionAprobada({ academia_id, owner_user_id, nombre, familia, categoria, descripcion, imagen_url, logo_url, sitio_web, instagram, direccion, whatsapp, es_demo = false }) {
  const { data, error } = await supabaseAdmin
    .from('vidriera_publicaciones')
    .insert({
      academia_id,
      owner_user_id,
      nombre,
      familia,
      categoria,
      descripcion: descripcion ?? null,
      imagen_url: imagen_url ?? null,
      logo_url: logo_url ?? null,
      sitio_web: sitio_web ?? null,
      instagram: instagram ?? null,
      direccion: direccion ?? null,
      whatsapp: whatsapp ?? null,
      estado: 'approved',
      es_demo,
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
// Orden manual de la vidriera (panel admin, Etapa C)
// ---------------------------------------------------------------------------
export async function getPublicacionesAcademia(academia_id, { estado } = {}) {
  let query = supabaseAdmin
    .from('vidriera_publicaciones')
    .select('*')
    .eq('academia_id', academia_id)
    .order('orden', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false });

  if (estado) query = query.eq('estado', estado);

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

/**
 * Aplica un orden manual completo: `ids` es el array de ids en el orden
 * deseado (posición en el array = nuevo valor de `orden`, 0-based). Se
 * recalculan TODOS los ids recibidos en cada llamada — más simple y robusto
 * que un esquema de índices fraccionarios, y de sobra para el volumen de una
 * vidriera de academia (decenas de publicaciones, no miles).
 * Ids que no pertenecen a la academia se ignoran y se reportan aparte.
 */
export async function setOrden(academia_id, ids) {
  const { data: existentes, error: errorSelect } = await supabaseAdmin
    .from('vidriera_publicaciones')
    .select('id')
    .eq('academia_id', academia_id)
    .in('id', ids);
  if (errorSelect) throw errorSelect;

  const validIds = new Set(existentes.map((p) => p.id));
  const invalidas = ids.filter((id) => !validIds.has(id));
  const validas = ids.filter((id) => validIds.has(id));

  const resultados = await Promise.all(
    validas.map((id, i) =>
      supabaseAdmin.from('vidriera_publicaciones').update({ orden: i }).eq('id', id)
    )
  );
  const errorUpdate = resultados.find((r) => r.error)?.error;
  if (errorUpdate) throw errorUpdate;

  return { invalidas };
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
