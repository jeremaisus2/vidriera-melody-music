// Alta idempotente del bucket de Storage para imágenes de la vidriera.
//
// Política de acceso (ver ESTADO.md):
//   - Lectura: pública (bucket marcado `public: true`, se sirve por URL directa
//     sin pasar por RLS de storage.objects).
//   - Escritura: solo el backend con supabaseAdmin (service_role). No se crea
//     ninguna política de INSERT/UPDATE/DELETE para anon/authenticated: RLS está
//     habilitado por defecto en storage.objects en todo proyecto Supabase, así
//     que sin una política que lo permita, esos roles quedan bloqueados para
//     escribir. service_role no depende de políticas: siempre puede escribir.
import { supabaseAdmin } from '../src/config/supabase.js';

const BUCKET = 'vidriera-imagenes';

async function main() {
  const { data: existentes, error: errorList } = await supabaseAdmin.storage.listBuckets();
  if (errorList) throw errorList;

  if (existentes.some((b) => b.id === BUCKET)) {
    console.log(`El bucket "${BUCKET}" ya existe. Nada que hacer.`);
    return;
  }

  const { error: errorCreate } = await supabaseAdmin.storage.createBucket(BUCKET, {
    public: true,
    fileSizeLimit: '5MB',
    allowedMimeTypes: ['image/webp'],
  });
  if (errorCreate) throw errorCreate;

  console.log(`Bucket "${BUCKET}" creado: público de lectura, 5MB máx. por archivo, solo image/webp.`);
}

main().catch((err) => {
  console.error('Error configurando Storage:', err.message);
  process.exit(1);
});
