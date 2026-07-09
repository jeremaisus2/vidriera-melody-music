import { createApp } from './app.js';
import { env } from './config/env.js';

const app = createApp();

app.listen(env.port, () => {
  console.log(`Vidriera Melody Music escuchando en http://localhost:${env.port} (${env.nodeEnv})`);
});
