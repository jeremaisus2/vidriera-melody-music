import { Router } from 'express';

import { publicacionesRouter } from './publicaciones.routes.js';
import { eventosRouter } from './eventos.routes.js';
import { adminRouter } from './admin.routes.js';
import { superadminRouter } from './superadmin.routes.js';
import { uploadsRouter } from './uploads.routes.js';
import { textosRouter } from './textos.routes.js';
import { authRouter } from './auth.routes.js';
import { agendaRouter } from './agenda.routes.js';
import { muroRouter } from './muro.routes.js';

export const apiRouter = Router();

// Login público de familias por código (sistema de "código de acceso")
apiRouter.use('/auth', authRouter);

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

// Módulo: Agenda de la comunidad (landing pública "Comunidad Melody")
apiRouter.use('/agenda', agendaRouter);

// Módulo: Muro de la comunidad (mensajes de familias con moderación)
apiRouter.use('/muro', muroRouter);
