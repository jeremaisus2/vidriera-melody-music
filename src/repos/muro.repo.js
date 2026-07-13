import { supabaseAdmin, supabasePublic } from '../config/supabase.js';

// ---------------------------------------------------------------------------
// Posts — lectura pública (cliente anon; RLS filtra a estado=aprobado)
// ---------------------------------------------------------------------------
export async function getMuroPublico() {
  const { data, error } = await supabasePublic
    .from('vidriera_muro')
    .select('*')
    .eq('estado', 'aprobado')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

// ---------------------------------------------------------------------------
// Posts — escritura (familia autenticada, vía supabaseForToken del request)
// ---------------------------------------------------------------------------
export async function crearPost(supabase, { academia_id, familia_id, contenido, categoria }) {
  const { data, error } = await supabase
    .from('vidriera_muro')
    .insert({ academia_id, familia_id, contenido, categoria, estado: 'pendiente' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ---------------------------------------------------------------------------
// Moderación (panel admin) — siempre con service_role
// ---------------------------------------------------------------------------
export async function getMuroAdmin(academia_id) {
  const { data: posts, error } = await supabaseAdmin
    .from('vidriera_muro')
    .select('*')
    .eq('academia_id', academia_id)
    .order('created_at', { ascending: false });
  if (error) throw error;
  if (posts.length === 0) return [];

  // Join manual con vidriera_codigos_familia para mostrar "publicado por
  // Familia X" en el panel — no se denormalizó ese nombre en la propia
  // fila de vidriera_muro (no lo pedía el schema), así que se resuelve acá
  // en una sola consulta extra en vez de un join en la query principal
  // (evita depender de una FK de vidriera_muro.familia_id hacia
  // vidriera_codigos_familia.user_id, que no existe como tal).
  const familiaIds = [...new Set(posts.map((p) => p.familia_id))];
  const { data: familias, error: errorFamilias } = await supabaseAdmin
    .from('vidriera_codigos_familia')
    .select('user_id, nombre_familia')
    .in('user_id', familiaIds);
  if (errorFamilias) throw errorFamilias;

  const nombrePorUserId = new Map(familias.map((f) => [f.user_id, f.nombre_familia]));
  return posts.map((p) => ({ ...p, nombre_familia: nombrePorUserId.get(p.familia_id) ?? null }));
}

export async function moderarPost(academia_id, id, estado) {
  const { data: post, error: errorSelect } = await supabaseAdmin
    .from('vidriera_muro')
    .select('*')
    .eq('id', id)
    .eq('academia_id', academia_id)
    .maybeSingle();
  if (errorSelect) throw errorSelect;
  if (!post) return null;
  if (post.estado !== 'pendiente') return { error: `El post está en estado "${post.estado}", no "pendiente"` };

  const { data, error } = await supabaseAdmin
    .from('vidriera_muro')
    .update({ estado, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ---------------------------------------------------------------------------
// Categorías — lectura pública (solo activas)
// ---------------------------------------------------------------------------
export async function getCategoriasPublicas() {
  const { data, error } = await supabasePublic
    .from('vidriera_muro_categorias')
    .select('clave, nombre, color, orden')
    .eq('activo', true)
    .order('orden', { ascending: true });
  if (error) throw error;
  return data;
}

// ---------------------------------------------------------------------------
// Categorías — catálogo (panel admin, service_role)
// ---------------------------------------------------------------------------
export async function getCatalogoCategorias({ incluirInactivas = false } = {}) {
  let query = supabaseAdmin.from('vidriera_muro_categorias').select('*').order('orden', { ascending: true });
  if (!incluirInactivas) query = query.eq('activo', true);
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function crearCategoria({ clave, nombre, color }) {
  const { data: existente, error: errorSelect } = await supabaseAdmin
    .from('vidriera_muro_categorias')
    .select('id')
    .eq('clave', clave)
    .maybeSingle();
  if (errorSelect) throw errorSelect;
  if (existente) return { error: `Ya existe una categoría con la clave "${clave}"` };

  const { count, error: errorCount } = await supabaseAdmin
    .from('vidriera_muro_categorias')
    .select('*', { count: 'exact', head: true });
  if (errorCount) throw errorCount;

  const { data, error } = await supabaseAdmin
    .from('vidriera_muro_categorias')
    .insert({ clave, nombre, color: color ?? null, activo: true, orden: count ?? 0 })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function editarCategoria(clave, cambios) {
  const { data, error } = await supabaseAdmin
    .from('vidriera_muro_categorias')
    .update(cambios)
    .eq('clave', clave)
    .select()
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function setEstadoCategoria(clave, activo) {
  const { data, error } = await supabaseAdmin
    .from('vidriera_muro_categorias')
    .update({ activo })
    .eq('clave', clave)
    .select()
    .maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * Aplica un orden manual completo: `claves` es el array completo en el
 * orden deseado (mismo patrón que publicacionesRepo.setOrden /
 * agendaRepo.setOrden — se recalculan todas las posiciones 0-based).
 */
export async function setOrdenCategorias(claves) {
  const { data: existentes, error: errorSelect } = await supabaseAdmin
    .from('vidriera_muro_categorias')
    .select('clave')
    .in('clave', claves);
  if (errorSelect) throw errorSelect;

  const validas = new Set(existentes.map((c) => c.clave));
  const invalidas = claves.filter((c) => !validas.has(c));
  const aplicar = claves.filter((c) => validas.has(c));

  const resultados = await Promise.all(
    aplicar.map((clave, i) =>
      supabaseAdmin.from('vidriera_muro_categorias').update({ orden: i }).eq('clave', clave)
    )
  );
  const errorUpdate = resultados.find((r) => r.error)?.error;
  if (errorUpdate) throw errorUpdate;

  return { invalidas };
}
