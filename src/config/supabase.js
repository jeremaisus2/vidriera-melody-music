import { createClient } from '@supabase/supabase-js';
import { env } from './env.js';

/**
 * Cliente "admin" con service_role: salta RLS. Uso exclusivo del backend para
 * tareas administrativas (moderación, super-admin, jobs). NUNCA exponer al cliente.
 */
export const supabaseAdmin = createClient(
  env.supabase.url,
  env.supabase.serviceRoleKey,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

/**
 * Crea un cliente Supabase que actúa en nombre de un usuario, propagando su JWT.
 * Así las políticas RLS se evalúan con la identidad real del usuario.
 */
export function supabaseForToken(accessToken) {
  return createClient(env.supabase.url, env.supabase.anonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
