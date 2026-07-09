import { Router } from 'express';
import { listarTextosPublicos } from '../controllers/textos.controller.js';

export const textosRouter = Router();

// Público: textos fijos de la vidriera (títulos/subtítulos de sección).
textosRouter.get('/', listarTextosPublicos);
