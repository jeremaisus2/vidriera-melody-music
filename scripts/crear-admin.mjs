// Alta de un admin real en Supabase Auth + vínculo en vidriera_perfiles.
//
// Uso:
//   node scripts/crear-admin.mjs <email> <password> [slug-academia]
//
// slug-academia es opcional, por defecto "melody-music". Si preferís no dejar
// la contraseña en el historial de la shell, exportá ADMIN_EMAIL/ADMIN_PASSWORD
// y corré el script sin argumentos.
import { supabaseAdmin } from '../src/config/supabase.js';

const [, , emailArg, passwordArg, slugArg] = process.argv;
const email = emailArg ?? process.env.ADMIN_EMAIL;
const password = passwordArg ?? process.env.ADMIN_PASSWORD;
const slug = slugArg ?? process.env.ADMIN_ACADEMIA_SLUG ?? 'melody-music';

if (!email || !password) {
  console.error('Uso: node scripts/crear-admin.mjs <email> <password> [slug-academia]');
  console.error('  (o export ADMIN_EMAIL / ADMIN_PASSWORD y corré sin argumentos)');
  process.exit(1);
}

if (!supabaseAdmin) {
  console.error('supabaseAdmin no está disponible. Revisá que MOCK_AUTH=false y las credenciales de Supabase estén cargadas en .env');
  process.exit(1);
}

async function main() {
  const { data: academia, error: errorAcademia } = await supabaseAdmin
    .from('vidriera_academias')
    .select('id, nombre')
    .eq('slug', slug)
    .maybeSingle();
  if (errorAcademia) throw errorAcademia;
  if (!academia) throw new Error(`No existe ninguna academia con slug "${slug}"`);

  const { data: created, error: errorCreate } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (errorCreate) throw errorCreate;

  const userId = created.user.id;

  const { error: errorPerfil } = await supabaseAdmin
    .from('vidriera_perfiles')
    .upsert(
      { user_id: userId, academia_id: academia.id, rol: 'admin', nombre: email.split('@')[0] },
      { onConflict: 'user_id' }
    );
  if (errorPerfil) throw errorPerfil;

  console.log('Usuario creado y vinculado correctamente.');
  console.log(`  user_id:  ${userId}`);
  console.log(`  email:    ${email}`);
  console.log(`  rol:      admin`);
  console.log(`  academia: ${academia.nombre} (${slug})`);
}

main().catch((err) => {
  console.error('Error al crear el admin:', err.message);
  process.exit(1);
});
