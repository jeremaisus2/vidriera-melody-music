import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { listarMuroPublico, listarCategoriasPublicas, crearPost } from '../controllers/muro.controller.js';

export const muroRouter = Router();

// --- Muro de la comunidad (público) ---
// Ruta estática antes de cualquier /:id — no hay /:id en este router hoy,
// pero se mantiene el mismo criterio que el resto del proyecto.
muroRouter.get('/categorias', listarCategoriasPublicas);
muroRouter.get('/',           listarMuroPublico);

// --- Familia autenticada ---
// Mismo criterio que RSVP/reacciones/testimonios de eventos: solo
// requireAuth acá, el rol 'cliente' lo exige la política RLS de INSERT
// como defensa en profundidad (no un requireRole a nivel de ruta).
muroRouter.post('/', requireAuth, crearPost);
