import { env } from '../config/env.js';
import { MOCK_USERS } from '../data/mockUsers.js';
import { supabaseAdmin, supabaseForToken } from '../config/supabase.js';

/**
 * Middleware de autenticación. Bifurca según MOCK_AUTH:
 *
 *   MOCK_AUTH=true  → Lee X-Mock-Rol (cliente|admin|super_admin). Sin Supabase.
 *   MOCK_AUTH=false → Valida JWT de Supabase y carga perfil de vidriera_perfiles.
 */
export async function requireAuth(req, res, next) {
  return env.mockAuth ? mockAuth(req, res, next) : supabaseAuth(req, res, next);
}

function mockAuth(req, res, next) {
  const rol = (req.headers['x-mock-rol'] ?? 'cliente').toLowerCase();
  const identity = MOCK_USERS[rol];
  if (!identity) {
    return res.status(400).json({
      error: `Rol de mock no reconocido: "${rol}". Opciones: cliente, admin, super_admin`,
    });
  }
  req.user     = identity.user;
  req.perfil   = identity.perfil;
  req.token    = null;
  req.supabase = null;
  return next();
}

async function supabaseAuth(req, res, next) {
  try {
    const header = req.headers.authorization ?? '';
    const [scheme, token] = header.split(' ');

    if (scheme !== 'Bearer' || !token) {
      return res.status(401).json({ error: 'Falta el token de autenticación' });
    }

    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data?.user) {
      return res.status(401).json({ error: 'Token inválido o expirado' });
    }

    const { data: perfil } = await supabaseAdmin
      .from('vidriera_perfiles')
      .select('*')
      .eq('user_id', data.user.id)
      .maybeSingle();

    req.user     = data.user;
    req.token    = token;
    req.supabase = supabaseForToken(token);
    req.perfil   = perfil ?? null;

    return next();
  } catch (err) {
    return next(err);
  }
}
