import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  listarVidriera,
  verPublicacion,
  registrarVista,
  misPublicaciones,
  crearPublicacion,
  proponerEdicion,
  destacadoRotativo,
} from '../controllers/publicaciones.controller.js';

export const publicacionesRouter = Router();

// Rutas estáticas ANTES de /:id para evitar que Express las capture como parámetro.
publicacionesRouter.get('/mias/listado', requireAuth, misPublicaciones);
publicacionesRouter.get('/destacado',    destacadoRotativo);

// Público
publicacionesRouter.get('/',    listarVidriera);
publicacionesRouter.get('/:id', verPublicacion);
publicacionesRouter.post('/:id/vista', registrarVista);

// Cliente autenticado
publicacionesRouter.post('/',    requireAuth, crearPublicacion);
publicacionesRouter.put('/:id',  requireAuth, proponerEdicion);
