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
// Estado: Calendario de eventos
// ---------------------------------------------------------------------------
let eventos = [
  {
    id: 'evento-seed-001',
    academia_id: ACADEMIA_ID,
    nombre: 'Concierto de fin de año',
    tipo: 'concierto',
    fecha: '2026-12-12T22:00:00.000Z',
    descripcion: 'Gran concierto de cierre de ciclo con todos los alumnos.',
    created_at: '2026-07-01T10:00:00.000Z',
  },
  {
    id: 'evento-seed-002',
    academia_id: ACADEMIA_ID,
    nombre: 'Muestra de guitarras',
    tipo: 'muestra',
    fecha: '2026-08-20T21:00:00.000Z',
    descripcion: 'Muestra anual de los alumnos avanzados de guitarra.',
    created_at: '2026-07-02T10:00:00.000Z',
  },
  {
    id: 'evento-seed-003',
    academia_id: ACADEMIA_ID,
    nombre: 'Examen de piano — 1er semestre',
    tipo: 'examen',
    fecha: '2026-06-15T13:00:00.000Z', // pasado (para galería y testimonios)
    descripcion: 'Evaluación de fin de semestre de piano.',
    created_at: '2026-05-01T10:00:00.000Z',
  },
];

// { evento_id, publicacion_id }
let eventoSponsors = [
  { evento_id: 'evento-seed-002', publicacion_id: 'pub-seed-001' },
];

// { evento_id, user_id, asiste, created_at }
let rsvp = [];

// { evento_id, user_id, tipo, created_at }
let reacciones = [];

// { id, evento_id, imagen_url, orden, created_at }
let galeria = [
  {
    id: 'foto-seed-001',
    evento_id: 'evento-seed-003',
    imagen_url: 'https://picsum.photos/id/1084/800/600',
    orden: 1,
    created_at: '2026-06-15T23:00:00.000Z',
  },
  {
    id: 'foto-seed-002',
    evento_id: 'evento-seed-003',
    imagen_url: 'https://picsum.photos/id/1081/800/600',
    orden: 2,
    created_at: '2026-06-15T23:05:00.000Z',
  },
];

// { id, evento_id, user_id, texto, created_at }
let testimonios = [];

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

// ---------------------------------------------------------------------------
// Eventos — lectura
// ---------------------------------------------------------------------------
function statsEvento(evento_id) {
  const rsvp_confirmados = rsvp.filter((r) => r.evento_id === evento_id && r.asiste).length;
  const reaccionesDelEvento = reacciones.filter((r) => r.evento_id === evento_id);
  return {
    rsvp_confirmados,
    reacciones: {
      voy_a_asistir: reaccionesDelEvento.filter((r) => r.tipo === 'voy_a_asistir').length,
      nos_encanto:   reaccionesDelEvento.filter((r) => r.tipo === 'nos_encanto').length,
    },
  };
}

export function getEventos({ tipo, soloFuturos } = {}) {
  const ahora = new Date();
  return eventos
    .filter((e) => {
      if (tipo && e.tipo !== tipo) return false;
      if (soloFuturos && new Date(e.fecha) <= ahora) return false;
      return true;
    })
    .sort((a, b) => new Date(a.fecha) - new Date(b.fecha))
    .map((e) => ({ ...e, es_pasado: new Date(e.fecha) < ahora, stats: statsEvento(e.id) }));
}

export function getEventoById(id) {
  const e = eventos.find((e) => e.id === id);
  if (!e) return null;
  return {
    ...e,
    es_pasado: new Date(e.fecha) < new Date(),
    stats: statsEvento(id),
    sponsors: getSponsorsDelEvento(id),
  };
}

export function getSponsorsDelEvento(evento_id) {
  return eventoSponsors
    .filter((s) => s.evento_id === evento_id)
    .map((s) => publicaciones.find((p) => p.id === s.publicacion_id))
    .filter(Boolean);
}

export function getGaleriaDelEvento(evento_id) {
  return galeria
    .filter((f) => f.evento_id === evento_id)
    .sort((a, b) => a.orden - b.orden);
}

export function getTestimoniosDelEvento(evento_id) {
  return testimonios
    .filter((t) => t.evento_id === evento_id)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

export function getRsvpDelUsuario(evento_id, user_id) {
  return rsvp.find((r) => r.evento_id === evento_id && r.user_id === user_id) ?? null;
}

export function getReaccionesDelUsuario(evento_id, user_id) {
  return reacciones
    .filter((r) => r.evento_id === evento_id && r.user_id === user_id)
    .map((r) => r.tipo);
}

// ---------------------------------------------------------------------------
// Eventos — escritura (familias)
// ---------------------------------------------------------------------------

/** Upsert RSVP. Devuelve el registro actualizado. */
export function upsertRsvp(evento_id, user_id, asiste) {
  const existente = rsvp.find((r) => r.evento_id === evento_id && r.user_id === user_id);
  if (existente) {
    existente.asiste = asiste;
    return existente;
  }
  const nuevo = { evento_id, user_id, asiste, created_at: new Date().toISOString() };
  rsvp.push(nuevo);
  return nuevo;
}

/**
 * Reacción toggle por tipo: si ya existe la elimina (unlike), si no existe la agrega.
 * Devuelve { activa, tipo } para que el controlador informe el estado resultante.
 */
export function toggleReaccion(evento_id, user_id, tipo) {
  const idx = reacciones.findIndex(
    (r) => r.evento_id === evento_id && r.user_id === user_id && r.tipo === tipo
  );
  if (idx !== -1) {
    reacciones.splice(idx, 1);
    return { activa: false, tipo };
  }
  reacciones.push({ evento_id, user_id, tipo, created_at: new Date().toISOString() });
  return { activa: true, tipo };
}

export function crearTestimonio(evento_id, user_id, texto) {
  const nuevo = {
    id: randomUUID(),
    evento_id,
    user_id,
    texto,
    created_at: new Date().toISOString(),
  };
  testimonios.push(nuevo);
  return nuevo;
}

// ---------------------------------------------------------------------------
// Eventos — escritura (admin)
// ---------------------------------------------------------------------------
export function crearEvento({ academia_id, nombre, tipo, fecha, descripcion }) {
  const nuevo = {
    id: randomUUID(),
    academia_id,
    nombre,
    tipo,
    fecha,
    descripcion: descripcion ?? null,
    created_at: new Date().toISOString(),
  };
  eventos.push(nuevo);
  return nuevo;
}

export function editarEvento(id, cambios) {
  const e = eventos.find((e) => e.id === id);
  if (!e) return null;
  Object.assign(e, cambios);
  return e;
}

export function eliminarEvento(id) {
  const idx = eventos.findIndex((e) => e.id === id);
  if (idx === -1) return false;
  eventos.splice(idx, 1);
  // Limpiar datos asociados.
  eventoSponsors = eventoSponsors.filter((s) => s.evento_id !== id);
  rsvp          = rsvp.filter((r) => r.evento_id !== id);
  reacciones    = reacciones.filter((r) => r.evento_id !== id);
  galeria       = galeria.filter((f) => f.evento_id !== id);
  testimonios   = testimonios.filter((t) => t.evento_id !== id);
  return true;
}

/**
 * Reemplaza todos los sponsors de un evento.
 * Solo se admiten publicaciones en estado 'approved'.
 * Devuelve { sponsors, rechazadas } con las IDs que no existían o no estaban approved.
 */
export function setSponsors(evento_id, publicacion_ids) {
  const aprobadas = [];
  const rechazadas = [];

  for (const pid of publicacion_ids) {
    const pub = publicaciones.find((p) => p.id === pid && p.estado === 'approved');
    if (pub) aprobadas.push(pid);
    else rechazadas.push(pid);
  }

  eventoSponsors = [
    ...eventoSponsors.filter((s) => s.evento_id !== evento_id),
    ...aprobadas.map((pid) => ({ evento_id, publicacion_id: pid })),
  ];

  return {
    sponsors: getSponsorsDelEvento(evento_id),
    rechazadas,
  };
}

export function agregarFotoGaleria(evento_id, { imagen_url, orden }) {
  const nueva = {
    id: randomUUID(),
    evento_id,
    imagen_url,
    orden: orden ?? galeria.filter((f) => f.evento_id === evento_id).length + 1,
    created_at: new Date().toISOString(),
  };
  galeria.push(nueva);
  return nueva;
}

export function eliminarFotoGaleria(foto_id) {
  const idx = galeria.findIndex((f) => f.id === foto_id);
  if (idx === -1) return false;
  galeria.splice(idx, 1);
  return true;
}

/**
 * Destacado rotativo: devuelve el evento "activo" y sus sponsors como destacadas.
 * Ventana activa: desde 7 días antes hasta 2 días después de la fecha del evento.
 * Si hay varios eventos en ventana, gana el más cercano (por diferencia absoluta).
 * Si no hay evento activo, devuelve null.
 */
export function getDestacadoRotativo() {
  const ahora = new Date();
  const ANTES_MS  = 7 * 24 * 60 * 60 * 1000;
  const DESPUES_MS = 2 * 24 * 60 * 60 * 1000;

  const activos = eventos.filter((e) => {
    const fecha = new Date(e.fecha);
    return ahora >= new Date(fecha.getTime() - ANTES_MS)
        && ahora <= new Date(fecha.getTime() + DESPUES_MS);
  });

  if (activos.length === 0) return null;

  activos.sort(
    (a, b) => Math.abs(new Date(a.fecha) - ahora) - Math.abs(new Date(b.fecha) - ahora)
  );
  const eventoActivo = activos[0];

  return {
    evento: eventoActivo,
    destacadas: getSponsorsDelEvento(eventoActivo.id),
  };
}

export function getEventosAdmin(academia_id) {
  return eventos
    .filter((e) => e.academia_id === academia_id)
    .sort((a, b) => new Date(a.fecha) - new Date(b.fecha))
    .map((e) => ({
      ...e,
      es_pasado:      new Date(e.fecha) < new Date(),
      stats:          statsEvento(e.id),
      sponsors_count: eventoSponsors.filter((s) => s.evento_id === e.id).length,
      galeria_count:  galeria.filter((f) => f.evento_id === e.id).length,
    }));
}
