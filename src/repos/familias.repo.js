import { randomUUID } from 'node:crypto';
import { supabaseAdmin } from '../config/supabase.js';
import { env } from '../config/env.js';

// Dominio técnico, no registrado ni pensado para resolver DNS: solo existe
// para darle a Supabase Auth un email con formato válido. La familia nunca
// ve ni necesita este valor — inicia sesión únicamente con el código.
const DOMINIO_TECNICO = 'familias.vidriera.internal';

function slugify(str) {
  return String(str)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // sin acentos
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'familia';
}

function emailTecnico(nombreFamilia) {
  const sufijo = randomUUID().slice(0, 8);
  return `${slugify(nombreFamilia)}-${sufijo}@${DOMINIO_TECNICO}`;
}

// ---------------------------------------------------------------------------
// Gestión desde el panel admin (academia)
// ---------------------------------------------------------------------------
export async function getFamilias(academia_id) {
  const { data, error } = await supabaseAdmin
    .from('vidriera_codigos_familia')
    .select('*')
    .eq('academia_id', academia_id)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

async function codigoEnUso(codigo, excluirId) {
  let query = supabaseAdmin.from('vidriera_codigos_familia').select('id').eq('codigo', codigo);
  if (excluirId) query = query.neq('id', excluirId);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

/**
 * Alta de una familia: crea la cuenta real de Supabase Auth (email técnico
 * invisible + el código como contraseña), el perfil (rol cliente, la
 * academia del admin que la da de alta) y la fila con el código en texto
 * plano para que el admin lo pueda visualizar después.
 */
export async function crearFamilia(academia_id, { nombre_familia, codigo, es_demo = false }) {
  if (await codigoEnUso(codigo)) {
    return { error: 'Ya existe una familia con ese código. Elegí uno distinto.' };
  }

  const email = emailTecnico(nombre_familia);
  const { data: created, error: errorCreate } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: codigo,
    email_confirm: true,
  });
  if (errorCreate) return { error: `No se pudo crear la cuenta: ${errorCreate.message}` };

  const userId = created.user.id;

  const { error: errorPerfil } = await supabaseAdmin
    .from('vidriera_perfiles')
    .upsert({ user_id: userId, academia_id, rol: 'cliente', nombre: nombre_familia }, { onConflict: 'user_id' });
  if (errorPerfil) throw errorPerfil;

  const { data, error } = await supabaseAdmin
    .from('vidriera_codigos_familia')
    .insert({ academia_id, user_id: userId, nombre_familia, codigo, activo: true, es_demo })
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** Cambia el código de una familia existente (misma cuenta de Auth, nueva contraseña). */
export async function editarCodigoFamilia(academia_id, id, nuevoCodigo) {
  const { data: fila, error: errorSelect } = await supabaseAdmin
    .from('vidriera_codigos_familia')
    .select('*')
    .eq('id', id)
    .eq('academia_id', academia_id)
    .maybeSingle();
  if (errorSelect) throw errorSelect;
  if (!fila) return null;

  if (await codigoEnUso(nuevoCodigo, id)) {
    return { error: 'Ya existe una familia con ese código. Elegí uno distinto.' };
  }

  const { error: errorAuth } = await supabaseAdmin.auth.admin.updateUserById(fila.user_id, { password: nuevoCodigo });
  if (errorAuth) return { error: `No se pudo actualizar la contraseña: ${errorAuth.message}` };

  const { data, error } = await supabaseAdmin
    .from('vidriera_codigos_familia')
    .update({ codigo: nuevoCodigo, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/**
 * Da de baja/reactiva el acceso. No borra la fila ni el usuario de Auth
 * (las publicaciones existentes de la familia quedan intactas) — además de
 * marcar `activo`, banea/desbanea la cuenta real de Supabase Auth como
 * defensa en profundidad (Supabase no tiene "ban permanente" nativo, se
 * simula con una duración larga).
 */
export async function setEstadoFamilia(academia_id, id, activo) {
  const { data: fila, error: errorSelect } = await supabaseAdmin
    .from('vidriera_codigos_familia')
    .select('*')
    .eq('id', id)
    .eq('academia_id', academia_id)
    .maybeSingle();
  if (errorSelect) throw errorSelect;
  if (!fila) return null;

  const { error: errorAuth } = await supabaseAdmin.auth.admin.updateUserById(fila.user_id, {
    ban_duration: activo ? 'none' : '876000h', // ~100 años
  });
  if (errorAuth) throw errorAuth;

  const { data, error } = await supabaseAdmin
    .from('vidriera_codigos_familia')
    .update({ activo, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ---------------------------------------------------------------------------
// Login público por código (frontend de la vidriera)
// Resuelve el código a la cuenta real y arma la sesión contra Supabase Auth,
// exactamente como si la familia hubiera puesto su email y contraseña — la
// familia nunca ve ni maneja ese email técnico.
// ---------------------------------------------------------------------------
export async function loginConCodigo(codigo) {
  const { data, error } = await supabaseAdmin
    .from('vidriera_codigos_familia')
    .select('user_id, nombre_familia, activo')
    .eq('codigo', codigo)
    .maybeSingle();
  if (error) throw error;
  if (!data || !data.activo) return { error: 'Código inválido o dado de baja.' };

  const { data: userData, error: errorUser } = await supabaseAdmin.auth.admin.getUserById(data.user_id);
  if (errorUser || !userData?.user?.email) return { error: 'Código inválido o dado de baja.' };

  const tokenRes = await fetch(`${env.supabase.url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: env.supabase.anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: userData.user.email, password: codigo }),
  });
  const tokenData = await tokenRes.json();
  if (!tokenRes.ok) return { error: 'Código inválido o dado de baja.' };

  return {
    access_token: tokenData.access_token,
    expires_in: tokenData.expires_in,
    nombre_familia: data.nombre_familia,
  };
}
