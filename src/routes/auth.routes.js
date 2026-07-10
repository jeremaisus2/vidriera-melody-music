import { Router } from 'express';
import { loginFamilia } from '../controllers/auth.controller.js';

export const authRouter = Router();

// Público: la familia entra con un único código (sin email visible).
authRouter.post('/familia-login', loginFamilia);
