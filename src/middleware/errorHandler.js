import multer from 'multer';
import { isProd } from '../config/env.js';

/** Handler 404 para rutas no encontradas. */
export function notFound(req, res) {
  res.status(404).json({ error: `Ruta no encontrada: ${req.method} ${req.originalUrl}` });
}

/** Handler de errores centralizado. Debe registrarse al final de la cadena. */
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  const status = err instanceof multer.MulterError ? 400 : (err.status ?? 500);
  const payload = { error: err.message ?? 'Error interno del servidor' };
  if (!isProd && err.stack) {
    payload.stack = err.stack;
  }
  if (status >= 500) {
    console.error('[error]', err);
  }
  res.status(status).json(payload);
}
