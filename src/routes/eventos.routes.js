import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  listarEventos,
  verEvento,
  obtenerQR,
  listarSponsors,
  listarGaleria,
  listarTestimonios,
  confirmarRsvp,
  reaccionar,
  dejarTestimonio,
  misReacciones,
} from '../controllers/eventos.controller.js';

export const eventosRouter = Router();

// Ruta estática ANTES de /:id para evitar que Express la capture como parámetro.
eventosRouter.get('/mias/reacciones', requireAuth, misReacciones);

// --- Calendario público ---
eventosRouter.get('/',                listarEventos);
eventosRouter.get('/:id',             verEvento);
eventosRouter.get('/:id/qr',          obtenerQR);
eventosRouter.get('/:id/sponsors',    listarSponsors);
eventosRouter.get('/:id/galeria',     listarGaleria);
eventosRouter.get('/:id/testimonios', listarTestimonios);

// --- Familias autenticadas ---
eventosRouter.post('/:id/rsvp',        requireAuth, confirmarRsvp);
eventosRouter.post('/:id/reaccion',    requireAuth, reaccionar);
eventosRouter.post('/:id/testimonios', requireAuth, dejarTestimonio);
