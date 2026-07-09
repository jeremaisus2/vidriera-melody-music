import * as publicacionesRepo from '../repos/publicaciones.repo.js';
import * as eventosRepo from '../repos/eventos.repo.js';

const TIPOS_VALIDOS = ['concierto', 'muestra', 'examen'];

// ---------------------------------------------------------------------------
// Moderación de publicaciones
// ---------------------------------------------------------------------------
export async function colaModeracion(req, res, next) {
  try {
    return res.json(await publicacionesRepo.getPendientes(req.perfil.academia_id));
  } catch (err) {
    return next(err);
  }
}

export async function aprobarPublicacion(req, res, next) {
  try {
    const resultado = await publicacionesRepo.moderarPublicacion(req.perfil.academia_id, req.params.id, 'approved');
    if (!resultado)      return res.status(404).json({ error: 'Publicación no encontrada' });
    if (resultado.error) return res.status(409).json({ error: resultado.error });
    return res.json({ mensaje: 'Publicación aprobada.', publicacion: resultado });
  } catch (err) {
    return next(err);
  }
}

export async function rechazarPublicacion(req, res, next) {
  try {
    const { motivo } = req.body;
    if (!motivo?.trim()) return res.status(400).json({ error: 'Se requiere un motivo de rechazo' });
    const resultado = await publicacionesRepo.moderarPublicacion(req.perfil.academia_id, req.params.id, 'rejected', motivo.trim());
    if (!resultado)      return res.status(404).json({ error: 'Publicación no encontrada' });
    if (resultado.error) return res.status(409).json({ error: resultado.error });
    return res.json({ mensaje: 'Publicación rechazada.', publicacion: resultado });
  } catch (err) {
    return next(err);
  }
}

export async function aprobarEdicion(req, res, next) {
  try {
    const resultado = await publicacionesRepo.moderarEdicion(req.perfil.academia_id, req.params.id, 'approved');
    if (!resultado)      return res.status(404).json({ error: 'Edición no encontrada' });
    if (resultado.error) return res.status(409).json({ error: resultado.error });
    return res.json({
      mensaje: 'Edición aprobada y aplicada al dato público.',
      publicacion: resultado.publicacion,
      edicion: resultado.edicion,
    });
  } catch (err) {
    return next(err);
  }
}

export async function rechazarEdicion(req, res, next) {
  try {
    const { motivo } = req.body;
    if (!motivo?.trim()) return res.status(400).json({ error: 'Se requiere un motivo de rechazo' });
    const resultado = await publicacionesRepo.moderarEdicion(req.perfil.academia_id, req.params.id, 'rejected', motivo.trim());
    if (!resultado)      return res.status(404).json({ error: 'Edición no encontrada' });
    if (resultado.error) return res.status(409).json({ error: resultado.error });
    return res.json({ mensaje: 'Edición rechazada.', edicion: resultado.edicion });
  } catch (err) {
    return next(err);
  }
}

// ---------------------------------------------------------------------------
// Gestión del calendario
// ---------------------------------------------------------------------------
export async function listarEventosAdmin(req, res, next) {
  try {
    return res.json(await eventosRepo.getEventosAdmin(req.perfil.academia_id));
  } catch (err) {
    return next(err);
  }
}

export async function crearEvento(req, res, next) {
  try {
    const { nombre, tipo, fecha, lugar, descripcion } = req.body;

    if (!nombre?.trim()) return res.status(400).json({ error: 'El campo nombre es requerido' });
    if (!TIPOS_VALIDOS.includes(tipo)) {
      return res.status(400).json({ error: `Tipo inválido. Opciones: ${TIPOS_VALIDOS.join(', ')}` });
    }
    if (!fecha || isNaN(Date.parse(fecha))) {
      return res.status(400).json({ error: 'El campo fecha es requerido y debe ser una fecha válida (ISO 8601)' });
    }

    const nuevo = await eventosRepo.crearEvento({
      academia_id: req.perfil.academia_id,
      nombre: nombre.trim(),
      tipo,
      fecha,
      lugar,
      descripcion,
    });
    return res.status(201).json(nuevo);
  } catch (err) {
    return next(err);
  }
}

export async function editarEvento(req, res, next) {
  try {
    const { nombre, tipo, fecha, lugar, descripcion } = req.body;

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
    if (lugar       !== undefined) cambios.lugar       = lugar;
    if (descripcion !== undefined) cambios.descripcion = descripcion;

    if (Object.keys(cambios).length === 0) {
      return res.status(400).json({ error: 'No se enviaron cambios' });
    }

    const resultado = await eventosRepo.editarEvento(req.perfil.academia_id, req.params.id, cambios);
    if (!resultado) return res.status(404).json({ error: 'Evento no encontrado' });
    return res.json(resultado);
  } catch (err) {
    return next(err);
  }
}

export async function eliminarEvento(req, res, next) {
  try {
    const ok = await eventosRepo.eliminarEvento(req.perfil.academia_id, req.params.id);
    if (!ok) return res.status(404).json({ error: 'Evento no encontrado' });
    return res.status(204).end();
  } catch (err) {
    return next(err);
  }
}

// ---------------------------------------------------------------------------
// Sponsors del evento
// ---------------------------------------------------------------------------
export async function definirSponsors(req, res, next) {
  try {
    const { publicacion_ids } = req.body;
    if (!Array.isArray(publicacion_ids)) {
      return res.status(400).json({ error: 'Se requiere publicacion_ids como array' });
    }

    const resultado = await eventosRepo.setSponsors(req.perfil.academia_id, req.params.id, publicacion_ids);
    if (resultado.evento_no_encontrado) return res.status(404).json({ error: 'Evento no encontrado' });

    const respuesta = { sponsors: resultado.sponsors };
    if (resultado.rechazadas.length > 0) {
      respuesta.advertencia = `Las siguientes IDs no se agregaron (no existen o no están aprobadas): ${resultado.rechazadas.join(', ')}`;
    }
    return res.json(respuesta);
  } catch (err) {
    return next(err);
  }
}

// ---------------------------------------------------------------------------
// Galería de eventos
// ---------------------------------------------------------------------------
export async function agregarFoto(req, res, next) {
  try {
    const { imagen_url, orden } = req.body;
    if (!imagen_url?.trim()) return res.status(400).json({ error: 'El campo imagen_url es requerido' });

    const foto = await eventosRepo.agregarFotoGaleria(req.perfil.academia_id, req.params.evento_id, {
      imagen_url: imagen_url.trim(),
      orden: typeof orden === 'number' ? orden : undefined,
    });
    if (!foto) return res.status(404).json({ error: 'Evento no encontrado' });
    return res.status(201).json(foto);
  } catch (err) {
    return next(err);
  }
}

export async function eliminarFoto(req, res, next) {
  try {
    const ok = await eventosRepo.eliminarFotoGaleria(req.perfil.academia_id, req.params.foto_id);
    if (!ok) return res.status(404).json({ error: 'Foto no encontrada' });
    return res.status(204).end();
  } catch (err) {
    return next(err);
  }
}

// ---------------------------------------------------------------------------
// Estadísticas de vistas
// ---------------------------------------------------------------------------
const CATEGORIAS_VALIDAS = ['fotografia_video', 'vestuario_arreglos', 'instrumentos', 'servicios_eventos', 'general'];
const ESTADOS_VALIDOS    = ['pending', 'approved', 'rejected'];

export async function estadisticasVistas(req, res, next) {
  try {
    const { categoria, estado } = req.query;

    if (categoria && !CATEGORIAS_VALIDAS.includes(categoria)) {
      return res.status(400).json({ error: `Categoría no válida: "${categoria}". Opciones: ${CATEGORIAS_VALIDAS.join(', ')}` });
    }
    if (estado && !ESTADOS_VALIDOS.includes(estado)) {
      return res.status(400).json({ error: `Estado no válido: "${estado}". Opciones: ${ESTADOS_VALIDOS.join(', ')}` });
    }

    return res.json(await publicacionesRepo.getEstadisticasVistas(req.perfil.academia_id, { categoria, estado }));
  } catch (err) {
    return next(err);
  }
}

// ---------------------------------------------------------------------------
// Orden de la vidriera + anulación puntual del destacado (Etapa C)
// ---------------------------------------------------------------------------
export async function listarPublicacionesAdmin(req, res, next) {
  try {
    const { estado } = req.query;
    if (estado && !ESTADOS_VALIDOS.includes(estado)) {
      return res.status(400).json({ error: `Estado no válido: "${estado}". Opciones: ${ESTADOS_VALIDOS.join(', ')}` });
    }

    const [publicaciones, destacado_override_id] = await Promise.all([
      publicacionesRepo.getPublicacionesAcademia(req.perfil.academia_id, { estado }),
      eventosRepo.getAcademiaDestacadoOverrideId(req.perfil.academia_id),
    ]);

    return res.json({ publicaciones, destacado_override_id });
  } catch (err) {
    return next(err);
  }
}

export async function actualizarOrden(req, res, next) {
  try {
    const { orden } = req.body;
    if (!Array.isArray(orden) || orden.length === 0 || orden.some((id) => typeof id !== 'string')) {
      return res.status(400).json({ error: 'Se requiere "orden" como array de ids (strings), ej: { "orden": ["id1", "id2"] }' });
    }

    const resultado = await publicacionesRepo.setOrden(req.perfil.academia_id, orden);
    const respuesta = { ok: true };
    if (resultado.invalidas.length > 0) {
      respuesta.advertencia = `Ids ignorados (no pertenecen a esta academia): ${resultado.invalidas.join(', ')}`;
    }
    return res.json(respuesta);
  } catch (err) {
    return next(err);
  }
}

export async function actualizarDestacadoOverride(req, res, next) {
  try {
    const { publicacion_id } = req.body;
    if (publicacion_id !== null && typeof publicacion_id !== 'string') {
      return res.status(400).json({ error: 'El campo publicacion_id debe ser un string o null (para quitar la anulación)' });
    }

    const resultado = await eventosRepo.setDestacadoOverride(req.perfil.academia_id, publicacion_id);
    if (resultado.error) return res.status(400).json({ error: resultado.error });

    return res.json({
      mensaje: publicacion_id ? 'Destacado fijado.' : 'Anulación quitada, vuelve a la rotación automática.',
      destacado_override_id: resultado.destacado_override_id,
    });
  } catch (err) {
    return next(err);
  }
}
