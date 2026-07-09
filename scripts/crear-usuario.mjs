// Alta de un usuario real (cliente, admin o super_admin) en Supabase Auth +
// vínculo en vidriera_perfiles. Generalización de crear-admin.mjs: hasta
// ahora era el único camino para dar de alta un admin a mano; esta versión
// sirve también para dar de alta familias (rol cliente) y personal de GIZA
// (rol super_admin) mientras no exista un flujo de self-registration.
//
// Uso (cliente/admin, atados a una academia):
//   node scripts/crear-usuario.mjs <email> <password> <cliente|admin> [slug-academia] [nombre]
//
// Uso (super_admin, no está atado a ninguna academia):
//   node scripts/crear-usuario.mjs <email> <password> super_admin [nombre]
//
// slug-academia es opcional, por defecto "melody-music" (solo aplica a
// cliente/admin). nombre es opcional, por defecto la parte del email antes
// de la arroba. Si preferís no dejar la contraseña en el historial de la
// shell, exportá USUARIO_EMAIL/USUARIO_PASSWORD/USUARIO_ROL/
// USUARIO_ACADEMIA_SLUG/USUARIO_NOMBRE y corré el script sin argumentos.
import { supabaseAdmin } from '../src/config/supabase.js';

const ROLES_VALIDOS = ['cliente', 'admin', 'super_admin'];

const [, , emailArg, passwordArg, rolArg, arg4, arg5] = process.argv;
const email = emailArg ?? process.env.USUARIO_EMAIL;
const password = passwordArg ?? process.env.USUARIO_PASSWORD;
const rol = rolArg ?? process.env.USUARIO_ROL;

function imprimirUso() {
  console.error('Uso (cliente/admin): node scripts/crear-usuario.mjs <email> <password> <rol> [slug-academia] [nombre]');
  console.error('Uso (super_admin):   node scripts/crear-usuario.mjs <email> <password> super_admin [nombre]');
  console.error(`  rol: ${ROLES_VALIDOS.join(' | ')}`);
  console.error('  (o export USUARIO_EMAIL / USUARIO_PASSWORD / USUARIO_ROL / USUARIO_ACADEMIA_SLUG / USUARIO_NOMBRE y corré sin argumentos)');
}

if (!email || !password || !rol) {
  imprimirUso();
  process.exit(1);
}

if (!ROLES_VALIDOS.includes(rol)) {
  console.error(`Rol inválido: "${rol}". Opciones: ${ROLES_VALIDOS.join(', ')}`);
  process.exit(1);
}

if (!supabaseAdmin) {
  console.error('supabaseAdmin no está disponible. Revisá que MOCK_AUTH=false y las credenciales de Supabase estén cargadas en .env');
  process.exit(1);
}

// super_admin no está atado a ninguna academia: el 4to argumento posicional
// pasa a ser directamente el nombre (no hay slug que resolver).
const slug = rol === 'super_admin' ? null : (arg4 ?? process.env.USUARIO_ACADEMIA_SLUG ?? 'melody-music');
const nombreOverride = (rol === 'super_admin' ? arg4 : arg5) ?? process.env.USUARIO_NOMBRE;

async function main() {
  let academia = null;
  if (rol !== 'super_admin') {
    const { data, error: errorAcademia } = await supabaseAdmin
      .from('vidriera_academias')
      .select('id, nombre')
      .eq('slug', slug)
      .maybeSingle();
    if (errorAcademia) throw errorAcademia;
    if (!data) throw new Error(`No existe ninguna academia con slug "${slug}"`);
    academia = data;
  }

  const { data: created, error: errorCreate } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (errorCreate) throw errorCreate;

  const userId = created.user.id;
  const nombre = nombreOverride ?? email.split('@')[0];

  const { error: errorPerfil } = await supabaseAdmin
    .from('vidriera_perfiles')
    .upsert(
      { user_id: userId, academia_id: academia?.id ?? null, rol, nombre },
      { onConflict: 'user_id' }
    );
  if (errorPerfil) throw errorPerfil;

  console.log('Usuario creado y vinculado correctamente.');
  console.log(`  user_id:  ${userId}`);
  console.log(`  email:    ${email}`);
  console.log(`  rol:      ${rol}`);
  console.log(`  nombre:   ${nombre}`);
  console.log(`  academia: ${academia ? `${academia.nombre} (${slug})` : '— (super_admin no está atado a ninguna academia)'}`);
}

main().catch((err) => {
  console.error('Error al crear el usuario:', err.message);
  process.exit(1);
});
