import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';

export const superadminRouter = Router();

// Panel exclusivo del proveedor de la plataforma (GIZA).
superadminRouter.use(requireAuth, requireRole('super_admin'));

const todo = (nombre) => (req, res) =>
  res.status(501).json({ error: `No implementado todavía: ${nombre}` });

// --- Clientes / academias ---
superadminRouter.get('/academias', todo('listar academias (nombre, estado, antigüedad)'));
superadminRouter.post('/academias', todo('alta de academia'));
superadminRouter.put('/academias/:id', todo('editar academia'));
superadminRouter.post('/academias/:id/estado', todo('activar/pausar academia'));

// --- Catálogo de módulos y activación por academia ---
superadminRouter.get('/modulos', todo('catálogo de módulos (incluido/adicional)'));
superadminRouter.get('/academias/:id/modulos', todo('módulos activos de una academia'));
superadminRouter.put('/academias/:id/modulos', todo('activar/desactivar módulos de una academia'));

// Resumen por cliente: módulos activos + antigüedad.
superadminRouter.get('/academias/:id/resumen', todo('resumen del cliente'));
