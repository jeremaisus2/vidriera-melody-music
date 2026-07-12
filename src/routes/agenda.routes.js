import { Router } from 'express';
import { listarAgendaPublica } from '../controllers/agenda.controller.js';

export const agendaRouter = Router();

// --- Agenda pública (landing "Comunidad Melody") ---
agendaRouter.get('/', listarAgendaPublica);
