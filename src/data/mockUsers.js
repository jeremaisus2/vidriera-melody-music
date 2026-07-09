const ACADEMIA_ID = 'acad-melody-001';

// Usuarios fijos para desarrollo (Etapa 1, sin Supabase real).
// Seleccioná el rol con el header X-Mock-Rol: cliente | admin | super_admin
export const MOCK_USERS = {
  cliente: {
    user:   { id: 'mock-user-cliente', email: 'familia@melodia.com' },
    perfil: { user_id: 'mock-user-cliente', academia_id: ACADEMIA_ID, rol: 'cliente',     nombre: 'Familia García'  },
  },
  admin: {
    user:   { id: 'mock-user-admin', email: 'admin@melodia.com' },
    perfil: { user_id: 'mock-user-admin',   academia_id: ACADEMIA_ID, rol: 'admin',       nombre: 'Admin Melody'    },
  },
  super_admin: {
    user:   { id: 'mock-user-superadmin', email: 'giza@giza.com' },
    perfil: { user_id: 'mock-user-superadmin', academia_id: null,    rol: 'super_admin',  nombre: 'GIZA Admin'      },
  },
};
