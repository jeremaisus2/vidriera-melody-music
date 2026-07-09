import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import {
  colaModeracion,
  aprobarPublicacion,
  rechazarPublicacion,
  aprobarEdicion,
  rechazarEdicion,
  crearEvento,
  editarEvento,
  eliminarEvento,
  definirSponsors,
  estadisticasVistas,
} from '../controllers/admin.controller.js';

export const adminRouter = Router();

adminRouter.use(requireAuth, requireRole('admin'));

// --- Cola de moderación ---
adminRouter.get('/moderacion',                               colaModeracion);
adminRouter.post('/moderacion/publicaciones/:id/aprobar',   aprobarPublicacion);
adminRouter.post('/moderacion/publicaciones/:id/rechazar',  rechazarPublicacion);
adminRouter.post('/moderacion/ediciones/:id/aprobar',       aprobarEdicion);
adminRouter.post('/moderacion/ediciones/:id/rechazar',      rechazarEdicion);

// --- Calendario de eventos (Etapa 2) ---
adminRouter.post('/eventos',             crearEvento);
adminRouter.put('/eventos/:id',          editarEvento);
adminRouter.delete('/eventos/:id',       eliminarEvento);
adminRouter.put('/eventos/:id/sponsors', definirSponsors);

// --- Estadísticas ---
adminRouter.get('/estadisticas/vistas',  estadisticasVistas);
