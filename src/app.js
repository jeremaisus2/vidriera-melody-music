import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';

import { env, isProd } from './config/env.js';
import { apiRouter } from './routes/index.js';
import { notFound, errorHandler } from './middleware/errorHandler.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, '..', 'public');

export function createApp() {
  const app = express();

  // CSP relajado para permitir Google Fonts (tipografía) y llamadas fetch directas
  // a Supabase Auth (login de familias) desde el frontend estático en public/.
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          ...helmet.contentSecurityPolicy.getDefaultDirectives(),
          'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          'font-src': ["'self'", 'https://fonts.gstatic.com'],
          'img-src': ["'self'", 'data:', 'https:'],
          'connect-src': ["'self'", env.supabase.url].filter(Boolean),
        },
      },
    })
  );
  app.use(cors());
  app.use(express.json({ limit: '2mb' }));
  app.use(morgan(isProd ? 'combined' : 'dev'));

  app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'vidriera-melody-music', ts: new Date().toISOString() });
  });

  // Config pública para el frontend estático: SUPABASE_URL y la anon key son
  // seguras de exponer al navegador (están diseñadas para eso, RLS las protege).
  app.get('/config.js', (req, res) => {
    res.type('application/javascript').send(
      `window.APP_CONFIG = ${JSON.stringify({
        supabaseUrl: env.supabase.url,
        supabaseAnonKey: env.supabase.anonKey,
      })};`
    );
  });

  app.use('/api', apiRouter);

  app.use(express.static(publicDir));

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
