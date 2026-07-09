import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';

export const adminRouter = Router();

// Todo el panel de academia requiere rol admin.
adminRouter.use(requireAuth, requireRole('admin'));

const todo = (nombre) => (req, res) =>
  res.status(501).json({ error: `No implementado todavía: ${nombre}` });

// --- Cola de moderación ---
adminRouter.get('/moderacion', todo('cola de moderación (altas + ediciones pendientes)'));
adminRouter.post('/moderacion/publicaciones/:id/aprobar', todo('aprobar publicación'));
adminRouter.post('/moderacion/publicaciones/:id/rechazar', todo('rechazar publicación (con motivo)'));
adminRouter.post('/moderacion/ediciones/:id/aprobar', todo('aprobar edición (aplica al dato público)'));
adminRouter.post('/moderacion/ediciones/:id/rechazar', todo('rechazar edición (con motivo)'));

// --- Calendario de eventos ---
adminRouter.post('/eventos', todo('crear evento'));
adminRouter.put('/eventos/:id', todo('editar evento'));
adminRouter.delete('/eventos/:id', todo('eliminar evento'));

// Sponsors por evento y destacado rotativo asociado al calendario.
adminRouter.put('/eventos/:id/sponsors', todo('definir sponsors del evento'));

// --- Estadísticas ---
adminRouter.get('/estadisticas/vistas', todo('vistas por emprendimiento'));
