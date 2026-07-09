/**
 * Restringe una ruta a uno o más roles. Debe ir SIEMPRE después de requireAuth.
 *
 * Roles: 'cliente' | 'admin' | 'super_admin'
 *
 * Uso: router.get('/moderacion', requireAuth, requireRole('admin'), handler)
 */
export function requireRole(...roles) {
  return (req, res, next) => {
    const rol = req.perfil?.rol;
    if (!rol) {
      return res.status(403).json({ error: 'El usuario no tiene un perfil/rol asignado' });
    }
    if (!roles.includes(rol)) {
      return res.status(403).json({ error: 'No tenés permisos para esta acción' });
    }
    return next();
  };
}
