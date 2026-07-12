import { supabaseAdmin, supabasePublic } from '../config/supabase.js';

// ---------------------------------------------------------------------------
// Agenda — lectura pública (cliente anon; RLS filtra a activo=true)
// Orden: fecha asc manda; `orden` es solo desempate manual entre eventos
// del mismo día (ver nota en db/migrations/010_agenda.sql).
// ---------------------------------------------------------------------------
export async function getAgendaPublica() {
  const { data, error } = await supabasePublic
    .from('vidriera_agenda')
    .select('*')
    .eq('activo', true)
    .order('fecha', { ascending: true })
    .order('orden', { ascending: true });
  if (error) throw error;
  return data;
}

// ---------------------------------------------------------------------------
// Agenda — panel admin (service_role, incluye activos e inactivos)
// ---------------------------------------------------------------------------
export async function getAgendaAdmin(academia_id) {
  const { data, error } = await supabaseAdmin
    .from('vidriera_agenda')
    .select('*')
    .eq('academia_id', academia_id)
    .order('fecha', { ascending: true })
    .order('orden', { ascending: true });
  if (error) throw error;
  return data;
}

export async function crearEvento({ academia_id, titulo, lugar, fecha, hora }) {
  const { count, error: errorCount } = await supabaseAdmin
    .from('vidriera_agenda')
    .select('*', { count: 'exact', head: true })
    .eq('academia_id', academia_id);
  if (errorCount) throw errorCount;

  const { data, error } = await supabaseAdmin
    .from('vidriera_agenda')
    .insert({ academia_id, titulo, lugar, fecha, hora, orden: count ?? 0 })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function editarEvento(academia_id, id, cambios) {
  const { data, error } = await supabaseAdmin
    .from('vidriera_agenda')
    .update({ ...cambios, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('academia_id', academia_id)
    .select()
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function eliminarEvento(academia_id, id) {
  const { data, error } = await supabaseAdmin
    .from('vidriera_agenda')
    .delete()
    .eq('id', id)
    .eq('academia_id', academia_id)
    .select();
  if (error) throw error;
  return data.length > 0;
}

/**
 * Aplica un orden manual completo, mismo patrón que
 * publicacionesRepo.setOrden: `ids` es el array completo en el orden
 * deseado, se recalculan todas las posiciones (0-based). Ids que no
 * pertenecen a la academia se ignoran y se reportan en `invalidas`.
 */
export async function setOrden(academia_id, ids) {
  const { data: existentes, error: errorSelect } = await supabaseAdmin
    .from('vidriera_agenda')
    .select('id')
    .eq('academia_id', academia_id)
    .in('id', ids);
  if (errorSelect) throw errorSelect;

  const validIds = new Set(existentes.map((e) => e.id));
  const invalidas = ids.filter((id) => !validIds.has(id));
  const validas = ids.filter((id) => validIds.has(id));

  const resultados = await Promise.all(
    validas.map((id, i) =>
      supabaseAdmin.from('vidriera_agenda').update({ orden: i }).eq('id', id)
    )
  );
  const errorUpdate = resultados.find((r) => r.error)?.error;
  if (errorUpdate) throw errorUpdate;

  return { invalidas };
}
