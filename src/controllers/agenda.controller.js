import * as agendaRepo from '../repos/agenda.repo.js';

const HORA_REGEX = /^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/;

function fechaValida(fecha) {
  return typeof fecha === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(fecha) && !isNaN(Date.parse(fecha));
}

// ---------------------------------------------------------------------------
// Público
// ---------------------------------------------------------------------------
export async function listarAgendaPublica(req, res, next) {
  try {
    return res.json(await agendaRepo.getAgendaPublica());
  } catch (err) {
    return next(err);
  }
}

// ---------------------------------------------------------------------------
// Panel admin
// ---------------------------------------------------------------------------
export async function listarAgendaAdmin(req, res, next) {
  try {
    return res.json(await agendaRepo.getAgendaAdmin(req.perfil.academia_id));
  } catch (err) {
    return next(err);
  }
}

export async function crearEvento(req, res, next) {
  try {
    const { titulo, lugar, fecha, hora } = req.body;

    if (!titulo?.trim()) return res.status(400).json({ error: 'El campo titulo es requerido' });
    if (!lugar?.trim())  return res.status(400).json({ error: 'El campo lugar es requerido' });
    if (!fechaValida(fecha)) {
      return res.status(400).json({ error: 'El campo fecha es requerido, formato YYYY-MM-DD' });
    }
    if (!hora || !HORA_REGEX.test(hora)) {
      return res.status(400).json({ error: 'El campo hora es requerido, formato HH:MM' });
    }

    const nuevo = await agendaRepo.crearEvento({
      academia_id: req.perfil.academia_id,
      titulo: titulo.trim(),
      lugar: lugar.trim(),
      fecha,
      hora,
    });
    return res.status(201).json(nuevo);
  } catch (err) {
    return next(err);
  }
}

export async function editarEvento(req, res, next) {
  try {
    const { titulo, lugar, fecha, hora, activo } = req.body;

    if (fecha !== undefined && !fechaValida(fecha)) {
      return res.status(400).json({ error: 'La fecha debe tener formato YYYY-MM-DD' });
    }
    if (hora !== undefined && !HORA_REGEX.test(hora)) {
      return res.status(400).json({ error: 'La hora debe tener formato HH:MM' });
    }
    if (activo !== undefined && typeof activo !== 'boolean') {
      return res.status(400).json({ error: 'El campo activo debe ser boolean' });
    }

    const cambios = {};
    if (titulo !== undefined) cambios.titulo = titulo.trim();
    if (lugar  !== undefined) cambios.lugar  = lugar.trim();
    if (fecha  !== undefined) cambios.fecha  = fecha;
    if (hora   !== undefined) cambios.hora   = hora;
    if (activo !== undefined) cambios.activo = activo;

    if (Object.keys(cambios).length === 0) {
      return res.status(400).json({ error: 'No se enviaron cambios' });
    }

    const resultado = await agendaRepo.editarEvento(req.perfil.academia_id, req.params.id, cambios);
    if (!resultado) return res.status(404).json({ error: 'Evento no encontrado' });
    return res.json(resultado);
  } catch (err) {
    return next(err);
  }
}

export async function eliminarEvento(req, res, next) {
  try {
    const ok = await agendaRepo.eliminarEvento(req.perfil.academia_id, req.params.id);
    if (!ok) return res.status(404).json({ error: 'Evento no encontrado' });
    return res.status(204).end();
  } catch (err) {
    return next(err);
  }
}

export async function reordenarAgenda(req, res, next) {
  try {
    const { orden } = req.body;
    if (!Array.isArray(orden) || orden.length === 0 || orden.some((id) => typeof id !== 'string')) {
      return res.status(400).json({ error: 'Se requiere "orden" como array de ids (strings), ej: { "orden": ["id1", "id2"] }' });
    }

    const resultado = await agendaRepo.setOrden(req.perfil.academia_id, orden);
    const respuesta = { ok: true };
    if (resultado.invalidas.length > 0) {
      respuesta.advertencia = `Ids ignorados (no pertenecen a esta academia): ${resultado.invalidas.join(', ')}`;
    }
    return res.json(respuesta);
  } catch (err) {
    return next(err);
  }
}
