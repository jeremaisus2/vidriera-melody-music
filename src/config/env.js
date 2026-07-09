import 'dotenv/config';

/**
 * Carga y valida las variables de entorno una sola vez.
 * Si falta algo crítico, fallamos rápido al arrancar en vez de romper en runtime.
 */
function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Falta la variable de entorno requerida: ${name}`);
  }
  return value;
}

export const env = {
  port: Number(process.env.PORT ?? 3000),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  supabase: {
    url: required('SUPABASE_URL'),
    anonKey: required('SUPABASE_ANON_KEY'),
    serviceRoleKey: required('SUPABASE_SERVICE_ROLE_KEY'),
    jwtSecret: process.env.SUPABASE_JWT_SECRET ?? null,
  },
};

export const isProd = env.nodeEnv === 'production';
