import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import {
  listarAcademias,
  crearAcademia,
  editarAcademia,
  cambiarEstado,
  catalogoModulos,
  modulosAcademia,
  actualizarModulos,
  resumenAcademia,
} from '../controllers/superadmin.controller.js';

export const superadminRouter = Router();

superadminRouter.use(requireAuth, requireRole('super_admin'));

// --- Academias ---
superadminRouter.get('/academias',              listarAcademias);
superadminRouter.post('/academias',             crearAcademia);
superadminRouter.put('/academias/:id',          editarAcademia);
superadminRouter.post('/academias/:id/estado',  cambiarEstado);

// --- Catálogo global de módulos ---
superadminRouter.get('/modulos',                catalogoModulos);

// --- Módulos por academia (switch de activación) ---
superadminRouter.get('/academias/:id/modulos',  modulosAcademia);
superadminRouter.put('/academias/:id/modulos',  actualizarModulos);

// --- Resumen por cliente ---
superadminRouter.get('/academias/:id/resumen',  resumenAcademia);
