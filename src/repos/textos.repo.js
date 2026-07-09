import { supabaseAdmin, supabasePublic } from '../config/supabase.js';

// ---------------------------------------------------------------------------
// Catálogo fijo de textos editables (Etapa D). Es la única fuente de verdad
// de qué claves existen y su valor por defecto — vidriera_textos solo guarda
// las personalizaciones. No hay forma de agregar/quitar claves desde el
// panel de admin: para sumar una hay que tocar este objeto (y el HTML
// público que la consume, ver public/js/vidriera.js).
// ---------------------------------------------------------------------------
export const TEXTOS_CATALOGO = {
  destacado_label:    'Destacado de la semana',
  vidriera_titulo:    'Vidriera de emprendimientos familiares',
  vidriera_subtitulo: 'Descubrí y contactá los emprendimientos de otras familias de la academia',
  calendario_titulo:  'Calendario de eventos',
  momentos_titulo:    'Momentos que ya vivimos',
  galeria_titulo:     'Galería',
  testimonios_titulo: 'Lo que dicen las familias',
};

// "Negrita simple": no es un editor de texto enriquecido, es una convención
// de marcado mínima tipo markdown (**así**) que el frontend admin escribe al
// togglear negrita sobre una selección, y que tanto el panel admin como la
// vidriera pública renderizan reemplazando **texto** por <strong>texto</strong>.
// `negrita` en la tabla es un flag derivado (no se edita directo): true si
// `contenido` tiene al menos un tramo marcado así.
function tieneNegrita(contenido) {
  return /\*\*.+?\*\*/.test(contenido);
}

// ---------------------------------------------------------------------------
// Lectura pública — sin scoping por academia, mismo criterio ya usado en
// getPublicacionesAprobadas/getDestacadoOverrideActivo (instalación de una
// sola academia activa en la práctica hoy; ver limitación documentada en
// ESTADO.md).
// ---------------------------------------------------------------------------
export async function getTextosPublicos() {
  const { data, error } = await supabasePublic.from('vidriera_textos').select('clave, contenido, negrita');
  if (error) throw error;

  const guardados = new Map(data.map((t) => [t.clave, t]));
  const resultado = {};
  for (const [clave, valorDefault] of Object.entries(TEXTOS_CATALOGO)) {
    const guardado = guardados.get(clave);
    resultado[clave] = guardado
      ? { contenido: guardado.contenido, negrita: guardado.negrita }
      : { contenido: valorDefault, negrita: false };
  }
  return resultado;
}

// ---------------------------------------------------------------------------
// Panel admin (Etapa C) — siempre las 7 claves del catálogo, marcando cuáles
// ya fueron personalizadas (tienen fila propia) vs. cuáles siguen en su
// valor por defecto.
// ---------------------------------------------------------------------------
export async function getTextosAdmin(academia_id) {
  const { data, error } = await supabaseAdmin
    .from('vidriera_textos')
    .select('clave, contenido, negrita, updated_at')
    .eq('academia_id', academia_id);
  if (error) throw error;

  const guardados = new Map(data.map((t) => [t.clave, t]));
  return Object.entries(TEXTOS_CATALOGO).map(([clave, valorDefault]) => {
    const guardado = guardados.get(clave);
    return guardado
      ? { clave, contenido: guardado.contenido, negrita: guardado.negrita, personalizado: true, updated_at: guardado.updated_at }
      : { clave, contenido: valorDefault, negrita: false, personalizado: false, updated_at: null };
  });
}

/**
 * Guarda (upsert) el contenido de una clave para una academia. Rechaza
 * claves fuera del catálogo fijo — es la barrera contra crear bloques
 * nuevos desde el panel, que esta etapa no soporta a propósito.
 */
export async function setTexto(academia_id, clave, contenido) {
  if (!(clave in TEXTOS_CATALOGO)) {
    return { error: `Clave de texto desconocida: "${clave}"` };
  }

  const negrita = tieneNegrita(contenido);
  const { data, error } = await supabaseAdmin
    .from('vidriera_textos')
    .upsert(
      { academia_id, clave, contenido, negrita, updated_at: new Date().toISOString() },
      { onConflict: 'academia_id,clave' }
    )
    .select()
    .single();
  if (error) throw error;
  return { texto: data };
}
