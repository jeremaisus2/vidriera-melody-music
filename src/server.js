import { createApp } from './app.js';
import { env } from './config/env.js';

const app = createApp();

const HOST = '0.0.0.0'; // todas las interfaces: en hosting gestionado (ej. Hostinger) el proxy externo necesita alcanzar el proceso, no solo localhost

app.listen(env.port, HOST, () => {
  console.log(`Vidriera Melody Music escuchando en http://${HOST}:${env.port} (${env.nodeEnv})`);
});
