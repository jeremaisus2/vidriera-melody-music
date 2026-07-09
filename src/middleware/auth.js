import { supabaseAdmin, supabaseForToken } from '../config/supabase.js';

/**
 * Middleware de autenticación por JWT de Supabase.
 *
 * Lee el header `Authorization: Bearer <token>`, valida el token contra Supabase
 * Auth y adjunta a la request:
 *   - req.user     -> usuario de Supabase Auth
 *   - req.token    -> access token (para hacer llamadas con RLS del usuario)
 *   - req.supabase -> cliente Supabase que actúa en nombre del usuario
 *   - req.perfil   -> fila de vidriera_perfiles (rol + academia)
 *
 * El rol vive en la tabla vidriera_perfiles, no en el token, para poder gestionarlo
 * desde el panel de admin/super-admin sin re-emitir tokens.
 */
export async function requireAuth(req, res, next) {
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

    req.user = data.user;
    req.token = token;
    req.supabase = supabaseForToken(token);
    req.perfil = perfil ?? null;

    return next();
  } catch (err) {
    return next(err);
  }
}
