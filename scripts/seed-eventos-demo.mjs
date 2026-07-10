// Siembra de contenido de demostración — eventos (Etapa H, cont.): crea un
// evento próximo con sponsors (reusando 2 de las 6 publicaciones demo ya
// sembradas por `scripts/seed-demo.mjs`) y un evento pasado con galería de
// fotos reales (mismo flujo de Storage que usa la app, `uploadsRepo.subirImagen`)
// y testimonios de ejemplo.
//
// Uso: npm run seed-eventos-demo -- [slug-academia]
// slug-academia es opcional, por defecto "melody-music".
//
// Requiere haber corrido `npm run seed-demo` antes (necesita al menos 2
// publicaciones `es_demo=true` para los sponsors, y la familia demo
// `es_demo=true` para asociar los testimonios).
//
// Guarda simple de no-duplicado: si ya hay eventos con es_demo=true, avisa y
// no siembra de nuevo — hay que borrarlos primero desde el panel de
// super-admin ("Configuración de la plataforma" → "Borrar datos de
// demostración") antes de volver a correr este script.
import { supabaseAdmin } from '../src/config/supabase.js';
import * as eventosRepo from '../src/repos/eventos.repo.js';
import * as uploadsRepo from '../src/repos/uploads.repo.js';

const slug = process.argv[2] ?? 'melody-music';

const DIA_MS = 24 * 60 * 60 * 1000;

const FOTOS_GALERIA_SEEDS = ['concierto-primavera-1', 'concierto-primavera-2', 'concierto-primavera-3'];

const TESTIMONIOS = [
  { familia: 'Familia Gómez', texto: 'Un concierto hermoso, los chicos disfrutaron muchísimo tocar frente a sus familias.' },
  { familia: 'Familia Paz', texto: 'Muy emocionante ver el progreso de nuestra hija en el violín. ¡Gracias a todos los profes!' },
];

async function descargarImagen(seed) {
  const res = await fetch(`https://picsum.photos/seed/${seed}/900/600`);
  if (!res.ok) throw new Error(`No se pudo descargar la imagen de demo (seed=${seed}): ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function main() {
  const { data: academia, error: errorAcademia } = await supabaseAdmin
    .from('vidriera_academias')
    .select('id, nombre')
    .eq('slug', slug)
    .maybeSingle();
  if (errorAcademia) throw errorAcademia;
  if (!academia) throw new Error(`No existe ninguna academia con slug "${slug}"`);

  const { count: demoExistente, error: errorCheck } = await supabaseAdmin
    .from('vidriera_eventos')
    .select('id', { count: 'exact', head: true })
    .eq('es_demo', true);
  if (errorCheck) throw errorCheck;
  if (demoExistente > 0) {
    console.log(
      `Ya hay ${demoExistente} eventos demo cargados. Borralos primero desde el panel de ` +
      `super-admin ("Configuración de la plataforma" → "Borrar datos de demostración") antes de ` +
      'volver a sembrar.'
    );
    return;
  }

  const { data: publicacionesDemo, error: errorPub } = await supabaseAdmin
    .from('vidriera_publicaciones')
    .select('id')
    .eq('academia_id', academia.id)
    .eq('es_demo', true)
    .limit(2);
  if (errorPub) throw errorPub;
  if (publicacionesDemo.length < 2) {
    throw new Error(
      'Hacen falta al menos 2 publicaciones demo para asignarlas como sponsors. ' +
      'Corré primero "npm run seed-demo".'
    );
  }

  const { data: familiaDemo, error: errorFamilia } = await supabaseAdmin
    .from('vidriera_codigos_familia')
    .select('user_id')
    .eq('academia_id', academia.id)
    .eq('es_demo', true)
    .maybeSingle();
  if (errorFamilia) throw errorFamilia;
  if (!familiaDemo) {
    throw new Error('No existe ninguna familia demo para asociar los testimonios. Corré primero "npm run seed-demo".');
  }

  console.log(`Creando evento próximo para "${academia.nombre}"...`);
  const fechaProxima = new Date(Date.now() + 18 * DIA_MS).toISOString();
  const eventoProximo = await eventosRepo.crearEvento({
    academia_id: academia.id,
    nombre: 'Muestra de fin de año',
    tipo: 'muestra',
    fecha: fechaProxima,
    lugar: 'Salón principal de Melody Music',
    descripcion: 'Muestra anual de alumnos de todas las edades, con la participación de emprendimientos de la comunidad.',
    es_demo: true,
  });
  await eventosRepo.setSponsors(academia.id, eventoProximo.id, publicacionesDemo.map((p) => p.id));
  console.log('  evento próximo creado, con 2 sponsors');

  console.log(`Creando evento pasado para "${academia.nombre}"...`);
  const fechaPasada = new Date(Date.now() - 45 * DIA_MS).toISOString();
  const eventoPasado = await eventosRepo.crearEvento({
    academia_id: academia.id,
    nombre: 'Concierto de primavera',
    tipo: 'concierto',
    fecha: fechaPasada,
    lugar: 'Salón principal de Melody Music',
    descripcion: 'Concierto de alumnos avanzados, cierre del ciclo lectivo de primavera.',
    es_demo: true,
  });

  for (const [i, seed] of FOTOS_GALERIA_SEEDS.entries()) {
    const bufferImagen = await descargarImagen(seed);
    const foto = await uploadsRepo.subirImagen(bufferImagen, { academia_id: academia.id, tipo: 'portada' });
    await eventosRepo.agregarFotoGaleria(academia.id, eventoPasado.id, { imagen_url: foto.url, orden: i + 1 });
  }
  console.log(`  ${FOTOS_GALERIA_SEEDS.length} fotos de galería subidas`);

  for (const t of TESTIMONIOS) {
    const { error } = await supabaseAdmin
      .from('vidriera_testimonios')
      .insert({ evento_id: eventoPasado.id, user_id: familiaDemo.user_id, familia: t.familia, texto: t.texto });
    if (error) throw error;
  }
  console.log(`  ${TESTIMONIOS.length} testimonios creados`);

  console.log(`\nListo: evento próximo + evento pasado (con galería y testimonios) creados en "${academia.nombre}".`);
}

main().catch((err) => {
  console.error('Error sembrando eventos demo:', err.message);
  process.exit(1);
});
