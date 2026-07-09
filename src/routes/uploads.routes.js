import { Router } from 'express';
import multer from 'multer';
import { requireAuth } from '../middleware/auth.js';
import { subirImagen } from '../controllers/uploads.controller.js';

// Buffer en memoria (no disco): sharp procesa el buffer y lo sube directo a Storage.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB crudos antes de comprimir
});

export const uploadsRouter = Router();

uploadsRouter.post('/imagen', requireAuth, upload.single('imagen'), subirImagen);
