import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import {
  listarAcademias,
  crearAcademia,
  editarAcademia,
  cambiarEstado,
  catalogoModulos,
  crearModulo,
  editarModulo,
  cambiarEstadoModulo,
  modulosAcademia,
  actualizarModulos,
  resumenAcademia,
  obtenerConfigPlataforma,
  actualizarConfigPlataforma,
  borrarDemo,
} from '../controllers/superadmin.controller.js';

export const superadminRouter = Router();

superadminRouter.use(requireAuth, requireRole('super_admin'));

// --- Academias ---
superadminRouter.get('/academias',              listarAcademias);
superadminRouter.post('/academias',             crearAcademia);
superadminRouter.put('/academias/:id',          editarAcademia);
superadminRouter.post('/academias/:id/estado',  cambiarEstado);

// --- Catálogo global de módulos (Etapa E: alta/edición/baja desde el panel) ---
superadminRouter.get('/modulos',                catalogoModulos);
superadminRouter.post('/modulos',               crearModulo);
superadminRouter.put('/modulos/:clave',         editarModulo);
superadminRouter.post('/modulos/:clave/estado', cambiarEstadoModulo);

// --- Módulos por academia (switch de activación) ---
superadminRouter.get('/academias/:id/modulos',  modulosAcademia);
superadminRouter.put('/academias/:id/modulos',  actualizarModulos);

// --- Resumen por cliente ---
superadminRouter.get('/academias/:id/resumen',  resumenAcademia);

// --- Configuración general de la plataforma (Etapa E) ---
superadminRouter.get('/configuracion',          obtenerConfigPlataforma);
superadminRouter.put('/configuracion',          actualizarConfigPlataforma);

// --- Contenido de demostración (Etapa H) ---
superadminRouter.post('/demo/borrar',           borrarDemo);
