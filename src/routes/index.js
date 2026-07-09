import { Router } from 'express';

import { publicacionesRouter } from './publicaciones.routes.js';
import { eventosRouter } from './eventos.routes.js';
import { adminRouter } from './admin.routes.js';
import { superadminRouter } from './superadmin.routes.js';
import { uploadsRouter } from './uploads.routes.js';
import { textosRouter } from './textos.routes.js';

export const apiRouter = Router();

// Módulo: Vidriera de emprendimientos
apiRouter.use('/publicaciones', publicacionesRouter);

// Módulo: Textos fijos editables de la vidriera pública (Etapa D)
apiRouter.use('/textos', textosRouter);

// Módulo: Calendario de eventos (RSVP, reacciones, galería, testimonios, QR)
apiRouter.use('/eventos', eventosRouter);

// Módulo: Panel de administración (academia)
apiRouter.use('/admin', adminRouter);

// Módulo: Panel de super-administrador (GIZA)
apiRouter.use('/super-admin', superadminRouter);

// Upload de imágenes (Supabase Storage) — usado por publicaciones y galería
apiRouter.use('/uploads', uploadsRouter);
