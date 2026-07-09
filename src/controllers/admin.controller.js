import * as store from '../data/store.js';

const TIPOS_VALIDOS = ['concierto', 'muestra', 'examen'];

// ---------------------------------------------------------------------------
// Moderación de publicaciones
// ---------------------------------------------------------------------------
export function colaModeracion(req, res) {
  return res.json(store.getPendientes());
}

export function aprobarPublicacion(req, res) {
  const resultado = store.moderarPublicacion(req.params.id, 'approved');
  if (!resultado)      return res.status(404).json({ error: 'Publicación no encontrada' });
  if (resultado.error) return res.status(409).json({ error: resultado.error });
  return res.json({ mensaje: 'Publicación aprobada.', publicacion: resultado });
}

export function rechazarPublicacion(req, res) {
  const { motivo } = req.body;
  if (!motivo?.trim()) return res.status(400).json({ error: 'Se requiere un motivo de rechazo' });
  const resultado = store.moderarPublicacion(req.params.id, 'rejected', motivo.trim());
  if (!resultado)      return res.status(404).json({ error: 'Publicación no encontrada' });
  if (resultado.error) return res.status(409).json({ error: resultado.error });
  return res.json({ mensaje: 'Publicación rechazada.', publicacion: resultado });
}

export function aprobarEdicion(req, res) {
  const resultado = store.moderarEdicion(req.params.id, 'approved');
  if (!resultado)      return res.status(404).json({ error: 'Edición no encontrada' });
  if (resultado.error) return res.status(409).json({ error: resultado.error });
  return res.json({
    mensaje: 'Edición aprobada y aplicada al dato público.',
    publicacion: resultado.publicacion,
    edicion: resultado.edicion,
  });
}

export function rechazarEdicion(req, res) {
  const { motivo } = req.body;
  if (!motivo?.trim()) return res.status(400).json({ error: 'Se requiere un motivo de rechazo' });
  const resultado = store.moderarEdicion(req.params.id, 'rejected', motivo.trim());
  if (!resultado)      return res.status(404).json({ error: 'Edición no encontrada' });
  if (resultado.error) return res.status(409).json({ error: resultado.error });
  return res.json({ mensaje: 'Edición rechazada.', edicion: resultado.edicion });
}

// ---------------------------------------------------------------------------
// Gestión del calendario
// ---------------------------------------------------------------------------
export function listarEventosAdmin(req, res) {
  return res.json(store.getEventosAdmin(req.perfil.academia_id));
}

export function crearEvento(req, res) {
  const { nombre, tipo, fecha, descripcion } = req.body;

  if (!nombre?.trim()) return res.status(400).json({ error: 'El campo nombre es requerido' });
  if (!TIPOS_VALIDOS.includes(tipo)) {
    return res.status(400).json({ error: `Tipo inválido. Opciones: ${TIPOS_VALIDOS.join(', ')}` });
  }
  if (!fecha || isNaN(Date.parse(fecha))) {
    return res.status(400).json({ error: 'El campo fecha es requerido y debe ser una fecha válida (ISO 8601)' });
  }

  const nuevo = store.crearEvento({
    academia_id: req.perfil.academia_id,
    nombre: nombre.trim(),
    tipo,
    fecha,
    descripcion,
  });
  return res.status(201).json(nuevo);
}

export function editarEvento(req, res) {
  const { nombre, tipo, fecha, descripcion } = req.body;

  if (tipo !== undefined && !TIPOS_VALIDOS.includes(tipo)) {
    return res.status(400).json({ error: `Tipo inválido. Opciones: ${TIPOS_VALIDOS.join(', ')}` });
  }
  if (fecha !== undefined && isNaN(Date.parse(fecha))) {
    return res.status(400).json({ error: 'La fecha debe ser una fecha válida (ISO 8601)' });
  }

  const cambios = {};
  if (nombre      !== undefined) cambios.nombre      = nombre.trim();
  if (tipo        !== undefined) cambios.tipo        = tipo;
  if (fecha       !== undefined) cambios.fecha       = fecha;
  if (descripcion !== undefined) cambios.descripcion = descripcion;

  if (Object.keys(cambios).length === 0) {
    return res.status(400).json({ error: 'No se enviaron cambios' });
  }

  const resultado = store.editarEvento(req.params.id, cambios);
  if (!resultado) return res.status(404).json({ error: 'Evento no encontrado' });
  return res.json(resultado);
}

export function eliminarEvento(req, res) {
  const ok = store.eliminarEvento(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Evento no encontrado' });
  return res.status(204).end();
}

// ---------------------------------------------------------------------------
// Sponsors del evento
// ---------------------------------------------------------------------------
export function definirSponsors(req, res) {
  const evento = store.getEventoById(req.params.id);
  if (!evento) return res.status(404).json({ error: 'Evento no encontrado' });

  const { publicacion_ids } = req.body;
  if (!Array.isArray(publicacion_ids)) {
    return res.status(400).json({ error: 'Se requiere publicacion_ids como array' });
  }

  const resultado = store.setSponsors(req.params.id, publicacion_ids);

  const respuesta = { sponsors: resultado.sponsors };
  if (resultado.rechazadas.length > 0) {
    respuesta.advertencia = `Las siguientes IDs no se agregaron (no existen o no están aprobadas): ${resultado.rechazadas.join(', ')}`;
  }
  return res.json(respuesta);
}

// ---------------------------------------------------------------------------
// Galería de eventos
// ---------------------------------------------------------------------------
export function agregarFoto(req, res) {
  const evento = store.getEventoById(req.params.evento_id);
  if (!evento) return res.status(404).json({ error: 'Evento no encontrado' });

  const { imagen_url, orden } = req.body;
  if (!imagen_url?.trim()) return res.status(400).json({ error: 'El campo imagen_url es requerido' });

  const foto = store.agregarFotoGaleria(req.params.evento_id, {
    imagen_url: imagen_url.trim(),
    orden: typeof orden === 'number' ? orden : undefined,
  });
  return res.status(201).json(foto);
}

export function eliminarFoto(req, res) {
  const ok = store.eliminarFotoGaleria(req.params.foto_id);
  if (!ok) return res.status(404).json({ error: 'Foto no encontrada' });
  return res.status(204).end();
}

// ---------------------------------------------------------------------------
// Estadísticas (Etapa 2)
// ---------------------------------------------------------------------------
export const estadisticasVistas = (req, res) =>
  res.status(501).json({ error: 'No implementado todavía: estadísticas de vistas' });
