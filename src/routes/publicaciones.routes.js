import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';

export const publicacionesRouter = Router();

// Respuesta temporal mientras se implementan los controladores.
const todo = (nombre) => (req, res) =>
  res.status(501).json({ error: `No implementado todavía: ${nombre}` });

// --- Público (vidriera visible) ---
// Solo publicaciones en estado approved. Soporta filtro por categoría.
publicacionesRouter.get('/', todo('listar vidriera pública'));
publicacionesRouter.get('/:id', todo('ver publicación'));

// Incrementa contador de vistas (para estadísticas del admin).
publicacionesRouter.post('/:id/vista', todo('registrar vista'));

// --- Cliente (familia dueña) ---
// Crear queda en estado pending hasta aprobación del admin.
publicacionesRouter.post('/', requireAuth, todo('crear publicación (queda pending)'));

// Editar una publicación aprobada NO pisa el dato público: genera una edición
// pendiente en vidriera_publicaciones_ediciones.
publicacionesRouter.put('/:id', requireAuth, todo('proponer edición (queda en revisión)'));

// Mis publicaciones (incluye estados no públicos y ediciones pendientes).
publicacionesRouter.get('/mias/listado', requireAuth, todo('listar mis publicaciones'));
