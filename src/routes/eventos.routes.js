import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';

export const eventosRouter = Router();

const todo = (nombre) => (req, res) =>
  res.status(501).json({ error: `No implementado todavía: ${nombre}` });

// --- Calendario público ---
eventosRouter.get('/', todo('listar eventos'));
eventosRouter.get('/:id', todo('ver evento'));

// Código QR por evento (para compartir por WhatsApp).
eventosRouter.get('/:id/qr', todo('obtener QR del evento'));

// Sponsors del evento (emprendimientos destacados de ese evento).
eventosRouter.get('/:id/sponsors', todo('listar sponsors del evento'));

// Galería de fotos del evento (eventos pasados).
eventosRouter.get('/:id/galeria', todo('listar galería del evento'));

// Testimonios de familias vinculados al evento.
eventosRouter.get('/:id/testimonios', todo('listar testimonios del evento'));

// --- Familias autenticadas ---
// RSVP simple + reacciones ("voy a asistir" / "nos encantó").
eventosRouter.post('/:id/rsvp', requireAuth, todo('confirmar asistencia (RSVP)'));
eventosRouter.post('/:id/reaccion', requireAuth, todo('reaccionar al evento'));
eventosRouter.post('/:id/testimonios', requireAuth, todo('dejar testimonio'));
