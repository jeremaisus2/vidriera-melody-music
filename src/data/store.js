import { randomUUID } from 'crypto';

const ACADEMIA_ID = 'acad-melody-001';

// ---------------------------------------------------------------------------
// Estado en memoria
// ---------------------------------------------------------------------------
let publicaciones = [
  {
    id: 'pub-seed-001',
    academia_id: ACADEMIA_ID,
    owner_user_id: 'mock-user-cliente',
    nombre: 'Foto & Arte',
    categoria: 'fotografia_video',
    descripcion: 'Fotografía profesional para eventos y retratos.',
    imagen_url: null,
    whatsapp: '5491133445566',
    estado: 'approved',
    motivo_rechazo: null,
    vistas: 12,
    created_at: '2026-01-10T10:00:00.000Z',
    updated_at: '2026-01-10T10:00:00.000Z',
  },
  {
    id: 'pub-seed-002',
    academia_id: ACADEMIA_ID,
    owner_user_id: 'mock-user-cliente',
    nombre: 'Trajes Especiales',
    categoria: 'vestuario_arreglos',
    descripcion: 'Alquiler y confección de trajes para recitales.',
    imagen_url: null,
    whatsapp: '5491144556677',
    estado: 'pending',
    motivo_rechazo: null,
    vistas: 0,
    created_at: '2026-01-15T09:00:00.000Z',
    updated_at: '2026-01-15T09:00:00.000Z',
  },
];

let ediciones = [];

// ---------------------------------------------------------------------------
// Publicaciones — lectura
// ---------------------------------------------------------------------------
export function getPublicacionesAprobadas({ categoria } = {}) {
  return publicaciones.filter(
    (p) => p.estado === 'approved' && (!categoria || p.categoria === categoria)
  );
}

export function getPublicacionById(id) {
  return publicaciones.find((p) => p.id === id) ?? null;
}

export function getPublicacionesByOwner(owner_user_id) {
  return publicaciones
    .filter((p) => p.owner_user_id === owner_user_id)
    .map((p) => ({
      ...p,
      edicion_pendiente:
        ediciones.find((e) => e.publicacion_id === p.id && e.estado === 'pending') ?? null,
    }));
}

// ---------------------------------------------------------------------------
// Publicaciones — escritura
// ---------------------------------------------------------------------------
export function incrementarVistas(id) {
  const p = publicaciones.find((p) => p.id === id);
  if (p) p.vistas += 1;
}

export function crearPublicacion({ academia_id, owner_user_id, nombre, categoria, descripcion, imagen_url, whatsapp }) {
  const nueva = {
    id: randomUUID(),
    academia_id,
    owner_user_id,
    nombre,
    categoria,
    descripcion: descripcion ?? null,
    imagen_url: imagen_url ?? null,
    whatsapp: whatsapp ?? null,
    estado: 'pending',
    motivo_rechazo: null,
    vistas: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  publicaciones.push(nueva);
  return nueva;
}

/**
 * Editar publicación según estado:
 * - approved  → crea una edición pendiente; el dato público NO cambia.
 * - pending/rejected → actualiza en-place y vuelve a pending.
 */
export function editarPublicacion(id, cambios, autor_user_id) {
  const p = publicaciones.find((p) => p.id === id);
  if (!p) return { tipo: 'not_found' };

  if (p.estado === 'approved') {
    const edicion = {
      id: randomUUID(),
      publicacion_id: p.id,
      autor_user_id,
      cambios,
      estado: 'pending',
      motivo_rechazo: null,
      created_at: new Date().toISOString(),
      resuelto_at: null,
    };
    ediciones.push(edicion);
    return { tipo: 'edicion_creada', edicion };
  }

  Object.assign(p, cambios, { estado: 'pending', updated_at: new Date().toISOString() });
  return { tipo: 'publicacion_actualizada', publicacion: p };
}

// ---------------------------------------------------------------------------
// Moderación (panel admin)
// ---------------------------------------------------------------------------
export function getPendientes() {
  return {
    publicaciones: publicaciones.filter((p) => p.estado === 'pending'),
    ediciones: ediciones
      .filter((e) => e.estado === 'pending')
      .map((e) => ({
        ...e,
        publicacion: publicaciones.find((p) => p.id === e.publicacion_id) ?? null,
      })),
  };
}

export function moderarPublicacion(id, accion, motivo = null) {
  const p = publicaciones.find((p) => p.id === id);
  if (!p) return null;
  if (p.estado !== 'pending') return { error: `La publicación está en estado "${p.estado}", no "pending"` };

  p.estado = accion;
  p.motivo_rechazo = accion === 'rejected' ? motivo : null;
  p.updated_at = new Date().toISOString();
  return p;
}

export function moderarEdicion(id, accion, motivo = null) {
  const e = ediciones.find((e) => e.id === id);
  if (!e) return null;
  if (e.estado !== 'pending') return { error: `La edición está en estado "${e.estado}", no "pending"` };

  e.estado = accion;
  e.motivo_rechazo = accion === 'rejected' ? motivo : null;
  e.resuelto_at = new Date().toISOString();

  // Al aprobar, aplicar los cambios al dato público de la publicación.
  const pub = publicaciones.find((p) => p.id === e.publicacion_id) ?? null;
  if (accion === 'approved' && pub) {
    Object.assign(pub, e.cambios, { updated_at: new Date().toISOString() });
  }

  return { edicion: e, publicacion: pub };
}
