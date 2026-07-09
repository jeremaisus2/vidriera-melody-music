import 'dotenv/config';

const mockAuth = process.env.MOCK_AUTH === 'true';

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Falta la variable de entorno requerida: ${name}`);
  }
  return value;
}

// En modo MOCK_AUTH las vars de Supabase son opcionales; en producción son obligatorias.
function supabaseVar(name) {
  return mockAuth ? (process.env[name] ?? '') : required(name);
}

export const env = {
  port: Number(process.env.PORT ?? 3000),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  mockAuth,
  supabase: {
    url: supabaseVar('SUPABASE_URL'),
    anonKey: supabaseVar('SUPABASE_ANON_KEY'),
    serviceRoleKey: supabaseVar('SUPABASE_SERVICE_ROLE_KEY'),
    jwtSecret: process.env.SUPABASE_JWT_SECRET ?? null,
  },
};

export const isProd = env.nodeEnv === 'production';
