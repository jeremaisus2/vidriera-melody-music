import { supabaseAdmin, supabasePublic } from '../config/supabase.js';

// Conteos públicos de RSVP y reacciones: siempre con service_role (ninguna
// política de RLS expone individualmente quién asiste o reaccionó).
async function statsEvento(evento_id) {
  const { count: rsvp_confirmados, error: errorRsvp } = await supabaseAdmin
    .from('vidriera_rsvp')
    .select('*', { count: 'exact', head: true })
    .eq('evento_id', evento_id)
    .eq('asiste', true);
  if (errorRsvp) throw errorRsvp;

  const { data: reacciones, error: errorReac } = await supabaseAdmin
    .from('vidriera_reacciones')
    .select('tipo')
    .eq('evento_id', evento_id);
  if (errorReac) throw errorReac;

  return {
    rsvp_confirmados: rsvp_confirmados ?? 0,
    reacciones: {
      voy_a_asistir: reacciones.filter((r) => r.tipo === 'voy_a_asistir').length,
      nos_encanto:   reacciones.filter((r) => r.tipo === 'nos_encanto').length,
    },
  };
}

// ---------------------------------------------------------------------------
// Eventos — lectura pública
// ---------------------------------------------------------------------------
export async function getEventos({ tipo, soloFuturos } = {}) {
  let query = supabasePublic.from('vidriera_eventos').select('*').order('fecha', { ascending: true });
  if (tipo) query = query.eq('tipo', tipo);
  if (soloFuturos) query = query.gt('fecha', new Date().toISOString());

  const { data, error } = await query;
  if (error) throw error;

  const ahora = new Date();
  return Promise.all(
    data.map(async (e) => ({
      ...e,
      es_pasado: new Date(e.fecha) < ahora,
      stats: await statsEvento(e.id),
    }))
  );
}

export async function getEventoById(id) {
  const { data: e, error } = await supabasePublic.from('vidriera_eventos').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!e) return null;

  return {
    ...e,
    es_pasado: new Date(e.fecha) < new Date(),
    stats: await statsEvento(id),
    sponsors: await getSponsorsDelEvento(id),
  };
}

export async function getSponsorsDelEvento(evento_id) {
  const { data, error } = await supabasePublic
    .from('vidriera_evento_sponsors')
    .select('publicacion:vidriera_publicaciones(*)')
    .eq('evento_id', evento_id);
  if (error) throw error;
  return data.map((row) => row.publicacion).filter(Boolean);
}

export async function getGaleriaDelEvento(evento_id) {
  const { data, error } = await supabasePublic
    .from('vidriera_galeria')
    .select('*')
    .eq('evento_id', evento_id)
    .order('orden', { ascending: true });
  if (error) throw error;
  return data;
}

export async function getTestimoniosDelEvento(evento_id) {
  const { data, error } = await supabasePublic
    .from('vidriera_testimonios')
    .select('*')
    .eq('evento_id', evento_id)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

// ---------------------------------------------------------------------------
// Eventos — escritura (familias, vía supabaseForToken del request)
// ---------------------------------------------------------------------------
export async function upsertRsvp(supabase, evento_id, user_id, asiste) {
  const { data, error } = await supabase
    .from('vidriera_rsvp')
    .upsert({ evento_id, user_id, asiste }, { onConflict: 'evento_id,user_id' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

/**
 * Reacción toggle por tipo: si ya existe la elimina (unlike), si no existe la agrega.
 * Devuelve { activa, tipo } para que el controlador informe el estado resultante.
 */
export async function toggleReaccion(supabase, evento_id, user_id, tipo) {
  const { data: existente, error: errorSelect } = await supabase
    .from('vidriera_reacciones')
    .select('*')
    .eq('evento_id', evento_id)
    .eq('user_id', user_id)
    .eq('tipo', tipo)
    .maybeSingle();
  if (errorSelect) throw errorSelect;

  if (existente) {
    const { error } = await supabase
      .from('vidriera_reacciones')
      .delete()
      .eq('evento_id', evento_id)
      .eq('user_id', user_id)
      .eq('tipo', tipo);
    if (error) throw error;
    return { activa: false, tipo };
  }

  const { error } = await supabase.from('vidriera_reacciones').insert({ evento_id, user_id, tipo });
  if (error) throw error;
  return { activa: true, tipo };
}

export async function crearTestimonio(supabase, evento_id, user_id, texto, familia) {
  const { data, error } = await supabase
    .from('vidriera_testimonios')
    .insert({ evento_id, user_id, texto, familia })
    .select()
    .single();
  if (error) throw error;
  return data;
}

/**
 * Reacciones del usuario autenticado, en todos los eventos (no solo uno).
 * Usa el cliente por-token del request: la política "reacciones_select" ya
 * permite `user_id = auth.uid()`, no hace falta ninguna política nueva.
 * El frontend la usa para saber qué botones de reacción mostrar activos al
 * cargar la página, sin necesidad de un toggle "a ciegas".
 */
export async function getReaccionesByUser(supabase, user_id) {
  const { data, error } = await supabase
    .from('vidriera_reacciones')
    .select('evento_id, tipo')
    .eq('user_id', user_id);
  if (error) throw error;
  return data;
}

// ---------------------------------------------------------------------------
// Eventos — escritura (admin, con service_role)
//
// service_role salta RLS: el scope por academia (que en RLS resuelve
// `vidriera_academia_id()`) se aplica acá a mano con `.eq('academia_id', ...)`.
// ---------------------------------------------------------------------------
export async function crearEvento({ academia_id, nombre, tipo, fecha, lugar, descripcion, es_demo = false }) {
  const { data, error } = await supabaseAdmin
    .from('vidriera_eventos')
    .insert({ academia_id, nombre, tipo, fecha, lugar: lugar ?? null, descripcion: descripcion ?? null, es_demo })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function editarEvento(academia_id, id, cambios) {
  const { data, error } = await supabaseAdmin
    .from('vidriera_eventos')
    .update(cambios)
    .eq('id', id)
    .eq('academia_id', academia_id)
    .select()
    .maybeSingle();
  if (error) throw error;
  return data;
}

// El cascade de sponsors/rsvp/reacciones/galería/testimonios lo resuelve el
// `on delete cascade` de db/schema.sql.
export async function eliminarEvento(academia_id, id) {
  const { data, error } = await supabaseAdmin
    .from('vidriera_eventos')
    .delete()
    .eq('id', id)
    .eq('academia_id', academia_id)
    .select();
  if (error) throw error;
  return data.length > 0;
}

/**
 * Reemplaza todos los sponsors de un evento (debe ser de la academia del admin).
 * Solo se admiten publicaciones en estado 'approved'.
 * Devuelve { evento_no_encontrado } o { sponsors, rechazadas }.
 */
export async function setSponsors(academia_id, evento_id, publicacion_ids) {
  const { data: evento, error: errorEvento } = await supabaseAdmin
    .from('vidriera_eventos')
    .select('id')
    .eq('id', evento_id)
    .eq('academia_id', academia_id)
    .maybeSingle();
  if (errorEvento) throw errorEvento;
  if (!evento) return { evento_no_encontrado: true };

  let aprobadas = [];
  if (publicacion_ids.length > 0) {
    const { data: publicaciones, error: errorPub } = await supabaseAdmin
      .from('vidriera_publicaciones')
      .select('id')
      .in('id', publicacion_ids)
      .eq('estado', 'approved');
    if (errorPub) throw errorPub;
    aprobadas = publicaciones.map((p) => p.id);
  }
  const rechazadas = publicacion_ids.filter((id) => !aprobadas.includes(id));

  const { error: errorDelete } = await supabaseAdmin
    .from('vidriera_evento_sponsors')
    .delete()
    .eq('evento_id', evento_id);
  if (errorDelete) throw errorDelete;

  if (aprobadas.length > 0) {
    const { error: errorInsert } = await supabaseAdmin
      .from('vidriera_evento_sponsors')
      .insert(aprobadas.map((publicacion_id) => ({ evento_id, publicacion_id })));
    if (errorInsert) throw errorInsert;
  }

  return { sponsors: await getSponsorsDelEvento(evento_id), rechazadas };
}

export async function agregarFotoGaleria(academia_id, evento_id, { imagen_url, orden }) {
  const { data: evento, error: errorEvento } = await supabaseAdmin
    .from('vidriera_eventos')
    .select('id')
    .eq('id', evento_id)
    .eq('academia_id', academia_id)
    .maybeSingle();
  if (errorEvento) throw errorEvento;
  if (!evento) return null;

  let ordenFinal = orden;
  if (ordenFinal === undefined) {
    const { count, error: errorCount } = await supabaseAdmin
      .from('vidriera_galeria')
      .select('*', { count: 'exact', head: true })
      .eq('evento_id', evento_id);
    if (errorCount) throw errorCount;
    ordenFinal = (count ?? 0) + 1;
  }

  const { data, error } = await supabaseAdmin
    .from('vidriera_galeria')
    .insert({ evento_id, imagen_url, orden: ordenFinal })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function eliminarFotoGaleria(academia_id, foto_id) {
  const { data: foto, error: errorSelect } = await supabaseAdmin
    .from('vidriera_galeria')
    .select('id, evento:vidriera_eventos!inner(academia_id)')
    .eq('id', foto_id)
    .eq('evento.academia_id', academia_id)
    .maybeSingle();
  if (errorSelect) throw errorSelect;
  if (!foto) return false;

  const { error } = await supabaseAdmin.from('vidriera_galeria').delete().eq('id', foto_id);
  if (error) throw error;
  return true;
}

/**
 * Destacado rotativo: devuelve el evento "activo" y sus sponsors como destacadas.
 * Ventana activa: desde 7 días antes hasta 2 días después de la fecha del evento.
 * Si hay varios eventos en ventana, gana el más cercano (por diferencia absoluta).
 * Si no hay evento activo, devuelve null.
 */
export async function getDestacadoRotativo() {
  const ahora = new Date();
  const ANTES_MS  = 7 * 24 * 60 * 60 * 1000;
  const DESPUES_MS = 2 * 24 * 60 * 60 * 1000;

  const desde = new Date(ahora.getTime() - DESPUES_MS).toISOString();
  const hasta = new Date(ahora.getTime() + ANTES_MS).toISOString();

  const { data: candidatos, error } = await supabasePublic
    .from('vidriera_eventos')
    .select('*')
    .gte('fecha', desde)
    .lte('fecha', hasta);
  if (error) throw error;

  const activos = candidatos.filter((e) => {
    const fecha = new Date(e.fecha);
    return ahora >= new Date(fecha.getTime() - ANTES_MS) && ahora <= new Date(fecha.getTime() + DESPUES_MS);
  });
  if (activos.length === 0) return null;

  activos.sort((a, b) => Math.abs(new Date(a.fecha) - ahora) - Math.abs(new Date(b.fecha) - ahora));
  const eventoActivo = activos[0];

  return {
    evento: eventoActivo,
    destacadas: await getSponsorsDelEvento(eventoActivo.id),
  };
}

// ---------------------------------------------------------------------------
// Anulación puntual del destacado (Etapa C, panel admin)
//
// El admin puede fijar a mano qué publicación se muestra en el banner
// destacado, anulando la rotación automática de arriba mientras esté
// activa. Se guarda en vidriera_academias.destacado_override_id.
//
// vidriera_academias NO es de lectura pública por RLS (academias_select
// exige rol admin/super_admin) — se usa supabaseAdmin acá a propósito,
// mismo criterio que statsEvento(): el DATO resultante (qué publicación
// está destacada) es público, aunque la tabla fuente no lo sea.
//
// No hay scoping por academia en esta consulta pública (mismo límite ya
// documentado para publicaciones/eventos: la instalación de hoy sirve una
// sola academia activa) — devuelve el primer override activo que encuentre.
// ---------------------------------------------------------------------------
export async function getDestacadoOverrideActivo() {
  const { data: academia, error } = await supabaseAdmin
    .from('vidriera_academias')
    .select('id, destacado_override_id')
    .not('destacado_override_id', 'is', null)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!academia) return null;

  const { data: publicacion, error: errorPub } = await supabaseAdmin
    .from('vidriera_publicaciones')
    .select('*')
    .eq('id', academia.destacado_override_id)
    .eq('estado', 'approved')
    .maybeSingle();
  if (errorPub) throw errorPub;
  // El override puede apuntar a algo que ya no está aprobado (rechazado o
  // borrado después de fijarlo) — en ese caso se degrada a la rotación
  // automática en vez de romper o mostrar un dato inconsistente.
  return publicacion ?? null;
}

export async function getAcademiaDestacadoOverrideId(academia_id) {
  const { data, error } = await supabaseAdmin
    .from('vidriera_academias')
    .select('destacado_override_id')
    .eq('id', academia_id)
    .maybeSingle();
  if (error) throw error;
  return data?.destacado_override_id ?? null;
}

/**
 * Fija o quita la anulación puntual del destacado para una academia.
 * publicacion_id === null quita la anulación (vuelve a la rotación automática).
 */
export async function setDestacadoOverride(academia_id, publicacion_id) {
  if (publicacion_id) {
    const { data: pub, error: errorPub } = await supabaseAdmin
      .from('vidriera_publicaciones')
      .select('id')
      .eq('id', publicacion_id)
      .eq('academia_id', academia_id)
      .eq('estado', 'approved')
      .maybeSingle();
    if (errorPub) throw errorPub;
    if (!pub) return { error: 'La publicación no existe, no es de esta academia, o no está aprobada.' };
  }

  const { error } = await supabaseAdmin
    .from('vidriera_academias')
    .update({ destacado_override_id: publicacion_id })
    .eq('id', academia_id);
  if (error) throw error;

  return { destacado_override_id: publicacion_id };
}

// ---------------------------------------------------------------------------
// Super-admin / admin — listado de eventos por academia
// ---------------------------------------------------------------------------
export async function getEventosAdmin(academia_id) {
  const { data: eventos, error } = await supabaseAdmin
    .from('vidriera_eventos')
    .select('*')
    .eq('academia_id', academia_id)
    .order('fecha', { ascending: true });
  if (error) throw error;

  return Promise.all(
    eventos.map(async (e) => {
      const [stats, { count: sponsors_count }, { count: galeria_count }] = await Promise.all([
        statsEvento(e.id),
        supabaseAdmin.from('vidriera_evento_sponsors').select('*', { count: 'exact', head: true }).eq('evento_id', e.id),
        supabaseAdmin.from('vidriera_galeria').select('*', { count: 'exact', head: true }).eq('evento_id', e.id),
      ]);
      return {
        ...e,
        es_pasado: new Date(e.fecha) < new Date(),
        stats,
        sponsors_count: sponsors_count ?? 0,
        galeria_count: galeria_count ?? 0,
      };
    })
  );
}
