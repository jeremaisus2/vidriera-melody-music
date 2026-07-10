import { supabaseAdmin } from '../config/supabase.js';

const BUCKET = 'vidriera-imagenes';

function pathDesdeUrlPublica(url) {
  if (!url) return null;
  try {
    return new URL(url).pathname.split(`/${BUCKET}/`)[1] ?? null;
  } catch {
    return null;
  }
}

/**
 * Borra de una sola vez todo el contenido de demostración (Etapa H):
 * las publicaciones marcadas `es_demo`, sus imágenes (portada + logo) en
 * Storage, y las familias demo asociadas (`vidriera_codigos_familia.es_demo`).
 *
 * Alcance global (todas las academias), no por cliente: el botón vive en
 * "Configuración de la plataforma" del panel super-admin, no en una
 * pantalla de un cliente puntual.
 *
 * Orden: primero se leen los paths de Storage (antes de borrar nada, para
 * no perder la referencia), después se borran los archivos, después las
 * filas de `vidriera_publicaciones` de forma explícita (no depende de que
 * las publicaciones demo pertenezcan a una familia demo: cualquier fila
 * `es_demo=true` se borra igual), y por último se borran los usuarios de
 * Auth de las familias demo — por `on delete cascade` eso se lleva puestos
 * `vidriera_perfiles` y la propia fila de `vidriera_codigos_familia` sin
 * necesidad de un delete manual aparte sobre esas dos tablas.
 */
export async function borrarContenidoDemo() {
  const { data: publicaciones, error: errorPub } = await supabaseAdmin
    .from('vidriera_publicaciones')
    .select('id, imagen_url, logo_url')
    .eq('es_demo', true);
  if (errorPub) throw errorPub;

  const { data: familias, error: errorFam } = await supabaseAdmin
    .from('vidriera_codigos_familia')
    .select('id, user_id')
    .eq('es_demo', true);
  if (errorFam) throw errorFam;

  const storagePaths = publicaciones
    .flatMap((p) => [pathDesdeUrlPublica(p.imagen_url), pathDesdeUrlPublica(p.logo_url)])
    .filter(Boolean);

  if (storagePaths.length > 0) {
    const { error } = await supabaseAdmin.storage.from(BUCKET).remove(storagePaths);
    if (error) throw error;
  }

  if (publicaciones.length > 0) {
    const { error } = await supabaseAdmin.from('vidriera_publicaciones').delete().eq('es_demo', true);
    if (error) throw error;
  }

  for (const f of familias) {
    const { error } = await supabaseAdmin.auth.admin.deleteUser(f.user_id);
    if (error) throw error;
  }

  return {
    publicaciones_borradas: publicaciones.length,
    imagenes_borradas: storagePaths.length,
    familias_borradas: familias.length,
  };
}
