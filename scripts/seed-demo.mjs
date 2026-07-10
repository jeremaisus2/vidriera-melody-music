// Siembra de contenido de demostración (Etapa H): crea una familia demo (vía
// el mismo sistema de código de acceso que ya existe, `vidriera_codigos_familia`)
// y 6 publicaciones de ejemplo, una o dos por categoría, con imágenes reales
// descargadas de picsum.photos y subidas por el mismo flujo de Storage que
// usa la app real (`uploadsRepo.subirImagen`, el mismo que usa
// POST /api/uploads/imagen) — no se linkean URLs externas directo.
//
// Uso: npm run seed-demo -- [slug-academia]
// slug-academia es opcional, por defecto "melody-music".
//
// Guarda simple de no-duplicado: si ya hay publicaciones con es_demo=true,
// avisa y no siembra de nuevo — hay que borrarlas primero desde el panel de
// super-admin ("Configuración de la plataforma" → "Borrar datos de
// demostración") antes de volver a correr este script.
import { supabaseAdmin } from '../src/config/supabase.js';
import * as familiasRepo from '../src/repos/familias.repo.js';
import * as publicacionesRepo from '../src/repos/publicaciones.repo.js';
import * as uploadsRepo from '../src/repos/uploads.repo.js';

const slug = process.argv[2] ?? 'melody-music';

// Rubros creíbles para una comunidad de familias de una academia de música
// (Bariloche, mismo contexto que el resto de los datos de ejemplo del
// proyecto). "familia" es el nombre identificador que se muestra en la
// tarjeta pública — todas comparten la misma cuenta de acceso demo por
// detrás (owner_user_id), pero cada publicación tiene su propio nombre de
// familia visible, para que la vidriera se vea con la diversidad real de
// una comunidad, no 6 tarjetas repitiendo "Familia Demo".
const NEGOCIOS = [
  {
    nombre: 'Fotografía Nieve y Nota',
    familia: 'Familia Aguirre',
    categoria: 'fotografia_video',
    descripcion: 'Fotografía y video de recitales, exámenes y muestras de la academia. Entrega digital en menos de una semana.',
    whatsapp: '5492944100001',
    seedImagen: 'nieve-y-nota',
  },
  {
    nombre: 'Video Recuerdos Bariloche',
    familia: 'Familia Molina',
    categoria: 'fotografia_video',
    descripcion: 'Cobertura audiovisual de conciertos y actos escolares, con edición profesional y resumen para redes sociales.',
    whatsapp: '5492944100002',
    seedImagen: 'recuerdos-bariloche',
  },
  {
    nombre: 'Costura y Vestuario Do-Re-Mi',
    familia: 'Familia Sosa',
    categoria: 'vestuario_arreglos',
    descripcion: 'Arreglos de trajes y vestidos para presentaciones, alquiler de vestuario temático para muestras y recitales.',
    whatsapp: '5492944100003',
    seedImagen: 'vestuario-doremi',
  },
  {
    nombre: 'Luthería Cordillera',
    familia: 'Familia Herrera',
    categoria: 'instrumentos',
    descripcion: 'Reparación y mantenimiento de instrumentos de cuerda, cambio de cuerdas y accesorios para guitarra y violín.',
    whatsapp: '5492944100004',
    seedImagen: 'lutheria-cordillera',
  },
  {
    nombre: 'Catering Con Ritmo',
    familia: 'Familia Bianchi',
    categoria: 'servicios_eventos',
    descripcion: 'Catering y mesa dulce para conciertos, exámenes y festejos de la academia, con menú a medida.',
    whatsapp: '5492944100005',
    seedImagen: 'catering-con-ritmo',
  },
  {
    nombre: 'Repostería La Fermata',
    familia: 'Familia Correa',
    categoria: 'general',
    descripcion: 'Tortas y bizcochuelos personalizados para cumpleaños y festejos de alumnos y familias de la academia.',
    whatsapp: '5492944100006',
    seedImagen: 'reposteria-fermata',
  },
];

// picsum.photos/seed/<seed>/... devuelve siempre la misma imagen para el
// mismo seed — reproducible entre corridas, a diferencia de una URL random.
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
    .from('vidriera_publicaciones')
    .select('id', { count: 'exact', head: true })
    .eq('es_demo', true);
  if (errorCheck) throw errorCheck;
  if (demoExistente > 0) {
    console.log(
      `Ya hay ${demoExistente} publicaciones demo cargadas. Borralas primero desde el panel de ` +
      `super-admin ("Configuración de la plataforma" → "Borrar datos de demostración") antes de ` +
      'volver a sembrar.'
    );
    return;
  }

  console.log(`Creando familia demo para "${academia.nombre}"...`);
  const codigo = `demo-${slug}-${Date.now().toString(36)}`;
  const familia = await familiasRepo.crearFamilia(academia.id, {
    nombre_familia: 'Familia Demo',
    codigo,
    es_demo: true,
  });
  if (familia.error) throw new Error(familia.error);
  console.log('  familia demo creada (es la cuenta dueña del contenido de ejemplo; su código no está pensado para usarse para loguearse)');

  for (const negocio of NEGOCIOS) {
    console.log(`Creando "${negocio.nombre}" (${negocio.categoria})...`);
    const bufferImagen = await descargarImagen(negocio.seedImagen);

    const [portada, logo] = await Promise.all([
      uploadsRepo.subirImagen(bufferImagen, { academia_id: academia.id, tipo: 'portada' }),
      uploadsRepo.subirImagen(bufferImagen, { academia_id: academia.id, tipo: 'logo' }),
    ]);

    await publicacionesRepo.crearPublicacionAprobada({
      academia_id: academia.id,
      owner_user_id: familia.user_id,
      nombre: negocio.nombre,
      familia: negocio.familia,
      categoria: negocio.categoria,
      descripcion: negocio.descripcion,
      imagen_url: portada.url,
      logo_url: logo.url,
      whatsapp: negocio.whatsapp,
      es_demo: true,
    });
    console.log('  publicada (approved)');
  }

  console.log(`\nListo: 6 publicaciones demo creadas y publicadas en "${academia.nombre}".`);
}

main().catch((err) => {
  console.error('Error sembrando contenido demo:', err.message);
  process.exit(1);
});
