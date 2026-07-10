import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import {
  colaModeracion,
  aprobarPublicacion,
  rechazarPublicacion,
  aprobarEdicion,
  rechazarEdicion,
  listarEventosAdmin,
  crearEvento,
  editarEvento,
  eliminarEvento,
  definirSponsors,
  agregarFoto,
  eliminarFoto,
  estadisticasVistas,
  listarPublicacionesAdmin,
  crearPublicacionDirecta,
  actualizarOrden,
  actualizarDestacadoOverride,
  listarTextosAdmin,
  actualizarTexto,
  listarFamilias,
  crearFamilia,
  editarCodigoFamilia,
  cambiarEstadoFamilia,
} from '../controllers/admin.controller.js';

export const adminRouter = Router();

adminRouter.use(requireAuth, requireRole('admin'));

// --- Cola de moderación ---
adminRouter.get('/moderacion',                              colaModeracion);
adminRouter.post('/moderacion/publicaciones/:id/aprobar',  aprobarPublicacion);
adminRouter.post('/moderacion/publicaciones/:id/rechazar', rechazarPublicacion);
adminRouter.post('/moderacion/ediciones/:id/aprobar',      aprobarEdicion);
adminRouter.post('/moderacion/ediciones/:id/rechazar',     rechazarEdicion);

// --- Calendario de eventos ---
adminRouter.get('/eventos',              listarEventosAdmin);
adminRouter.post('/eventos',             crearEvento);
adminRouter.put('/eventos/:id',          editarEvento);
adminRouter.delete('/eventos/:id',       eliminarEvento);
adminRouter.put('/eventos/:id/sponsors', definirSponsors);

// --- Galería ---
adminRouter.post('/galeria/:evento_id',  agregarFoto);
adminRouter.delete('/galeria/:foto_id',  eliminarFoto);

// --- Estadísticas (Etapa 2) ---
adminRouter.get('/estadisticas/vistas',  estadisticasVistas);

// --- Orden de la vidriera + anulación puntual del destacado (Etapa C) ---
// Rutas estáticas antes de cualquier /:id — no hay /publicaciones/:id en este
// router hoy, pero se mantiene el mismo criterio que el resto del proyecto.
adminRouter.get('/publicaciones',           listarPublicacionesAdmin);
adminRouter.post('/publicaciones',          crearPublicacionDirecta);
adminRouter.put('/publicaciones/orden',     actualizarOrden);
adminRouter.put('/destacado-override',      actualizarDestacadoOverride);

// --- Textos de la página (Etapa D) ---
adminRouter.get('/textos',          listarTextosAdmin);
adminRouter.put('/textos/:clave',   actualizarTexto);

// --- Familias: códigos de acceso ---
adminRouter.get('/familias',            listarFamilias);
adminRouter.post('/familias',           crearFamilia);
adminRouter.put('/familias/:id',        editarCodigoFamilia);
adminRouter.post('/familias/:id/estado', cambiarEstadoFamilia);
