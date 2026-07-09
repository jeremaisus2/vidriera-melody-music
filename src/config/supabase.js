import { createClient } from '@supabase/supabase-js';
import { env } from './env.js';

// En modo MOCK_AUTH los clientes no se instancian (las vars pueden estar vacías).
// En Etapa 2, con MOCK_AUTH=false y vars reales, se activan automáticamente.
export const supabaseAdmin = env.mockAuth
  ? null
  : createClient(env.supabase.url, env.supabase.serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

export function supabaseForToken(accessToken) {
  if (env.mockAuth) return null;
  return createClient(env.supabase.url, env.supabase.anonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
