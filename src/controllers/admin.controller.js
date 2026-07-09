import * as store from '../data/store.js';

// --- Moderación ---

export function colaModeracion(req, res) {
  return res.json(store.getPendientes());
}

export function aprobarPublicacion(req, res) {
  const resultado = store.moderarPublicacion(req.params.id, 'approved');
  if (!resultado)        return res.status(404).json({ error: 'Publicación no encontrada' });
  if (resultado.error)   return res.status(409).json({ error: resultado.error });
  return res.json({ mensaje: 'Publicación aprobada.', publicacion: resultado });
}

export function rechazarPublicacion(req, res) {
  const { motivo } = req.body;
  if (!motivo?.trim()) {
    return res.status(400).json({ error: 'Se requiere un motivo de rechazo' });
  }
  const resultado = store.moderarPublicacion(req.params.id, 'rejected', motivo.trim());
  if (!resultado)        return res.status(404).json({ error: 'Publicación no encontrada' });
  if (resultado.error)   return res.status(409).json({ error: resultado.error });
  return res.json({ mensaje: 'Publicación rechazada.', publicacion: resultado });
}

export function aprobarEdicion(req, res) {
  const resultado = store.moderarEdicion(req.params.id, 'approved');
  if (!resultado)        return res.status(404).json({ error: 'Edición no encontrada' });
  if (resultado.error)   return res.status(409).json({ error: resultado.error });
  return res.json({
    mensaje: 'Edición aprobada y aplicada al dato público.',
    publicacion: resultado.publicacion,
    edicion:     resultado.edicion,
  });
}

export function rechazarEdicion(req, res) {
  const { motivo } = req.body;
  if (!motivo?.trim()) {
    return res.status(400).json({ error: 'Se requiere un motivo de rechazo' });
  }
  const resultado = store.moderarEdicion(req.params.id, 'rejected', motivo.trim());
  if (!resultado)        return res.status(404).json({ error: 'Edición no encontrada' });
  if (resultado.error)   return res.status(409).json({ error: resultado.error });
  return res.json({ mensaje: 'Edición rechazada.', edicion: resultado.edicion });
}

// --- Eventos (stubs para Etapa 2) ---
const todo = (nombre) => (req, res) =>
  res.status(501).json({ error: `No implementado todavía: ${nombre}` });

export const crearEvento        = todo('crear evento');
export const editarEvento       = todo('editar evento');
export const eliminarEvento     = todo('eliminar evento');
export const definirSponsors    = todo('definir sponsors del evento');
export const estadisticasVistas = todo('estadísticas de vistas');
