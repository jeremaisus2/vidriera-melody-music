import * as publicacionesRepo from '../repos/publicaciones.repo.js';
import * as eventosRepo from '../repos/eventos.repo.js';
import * as textosRepo from '../repos/textos.repo.js';
import * as familiasRepo from '../repos/familias.repo.js';
import * as superadminRepo from '../repos/superadmin.repo.js';
import { CATEGORIAS_VALIDAS } from './publicaciones.controller.js';

const TIPOS_VALIDOS = ['concierto', 'muestra', 'examen'];
const CODIGO_MIN_LEN = 6; // no es una contraseña de alta seguridad, solo evita códigos triviales tipo "123"

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
const ESTADOS_VALIDOS = ['pending', 'approved', 'rejected'];

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

/**
 * Alta directa (Etapa G): mismo formulario completo que el envío de una
 * familia, pero se publica de inmediato (estado approved) sin pasar por la
 * cola de moderación. `owner_user_id` queda en el propio admin (la columna
 * es NOT NULL y no hay ninguna cuenta de "familia" real detrás de un alta
 * hecha directamente por el admin) — `familia` sigue siendo el nombre
 * identificador de texto libre, igual que en el resto de publicaciones.
 */
export async function crearPublicacionDirecta(req, res, next) {
  try {
    const { nombre, familia, categoria, descripcion, imagen_url, logo_url, sitio_web, instagram, direccion, whatsapp } = req.body;

    if (!nombre?.trim())  return res.status(400).json({ error: 'El campo nombre es requerido' });
    if (!familia?.trim()) return res.status(400).json({ error: 'El campo familia es requerido' });
    if (!CATEGORIAS_VALIDAS.includes(categoria)) {
      return res.status(400).json({ error: `Categoría inválida. Opciones: ${CATEGORIAS_VALIDAS.join(', ')}` });
    }
    if (!logo_url) {
      return res.status(400).json({ error: 'El logo es requerido' });
    }

    const nueva = await publicacionesRepo.crearPublicacionAprobada({
      academia_id: req.perfil.academia_id,
      owner_user_id: req.user.id,
      nombre: nombre.trim(),
      familia: familia.trim(),
      categoria,
      descripcion,
      imagen_url,
      logo_url,
      sitio_web,
      instagram,
      direccion,
      whatsapp,
    });

    return res.status(201).json(nueva);
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

// ---------------------------------------------------------------------------
// Textos de la página (Etapa D)
// ---------------------------------------------------------------------------
export async function listarTextosAdmin(req, res, next) {
  try {
    return res.json(await textosRepo.getTextosAdmin(req.perfil.academia_id));
  } catch (err) {
    return next(err);
  }
}

export async function actualizarTexto(req, res, next) {
  try {
    const { contenido } = req.body;
    if (!contenido?.trim()) {
      return res.status(400).json({ error: 'El campo contenido es requerido' });
    }

    const resultado = await textosRepo.setTexto(req.perfil.academia_id, req.params.clave, contenido);
    if (resultado.error) return res.status(400).json({ error: resultado.error });

    return res.json(resultado.texto);
  } catch (err) {
    return next(err);
  }
}

// ---------------------------------------------------------------------------
// Familias — códigos de acceso
// ---------------------------------------------------------------------------
export async function listarFamilias(req, res, next) {
  try {
    return res.json(await familiasRepo.getFamilias(req.perfil.academia_id));
  } catch (err) {
    return next(err);
  }
}

export async function crearFamilia(req, res, next) {
  try {
    const { nombre_familia, codigo } = req.body;
    if (!nombre_familia?.trim()) return res.status(400).json({ error: 'El nombre identificador es requerido' });
    if (!codigo?.trim() || codigo.trim().length < CODIGO_MIN_LEN) {
      return res.status(400).json({ error: `El código debe tener al menos ${CODIGO_MIN_LEN} caracteres` });
    }

    const resultado = await familiasRepo.crearFamilia(req.perfil.academia_id, {
      nombre_familia: nombre_familia.trim(),
      codigo: codigo.trim(),
    });
    if (resultado.error) return res.status(409).json({ error: resultado.error });
    return res.status(201).json(resultado);
  } catch (err) {
    return next(err);
  }
}

export async function editarCodigoFamilia(req, res, next) {
  try {
    const { codigo } = req.body;
    if (!codigo?.trim() || codigo.trim().length < CODIGO_MIN_LEN) {
      return res.status(400).json({ error: `El código debe tener al menos ${CODIGO_MIN_LEN} caracteres` });
    }

    const resultado = await familiasRepo.editarCodigoFamilia(req.perfil.academia_id, req.params.id, codigo.trim());
    if (!resultado) return res.status(404).json({ error: 'Familia no encontrada' });
    if (resultado.error) return res.status(409).json({ error: resultado.error });
    return res.json(resultado);
  } catch (err) {
    return next(err);
  }
}

export async function cambiarEstadoFamilia(req, res, next) {
  try {
    const { activo } = req.body;
    if (typeof activo !== 'boolean') return res.status(400).json({ error: 'El campo activo debe ser booleano' });

    const resultado = await familiasRepo.setEstadoFamilia(req.perfil.academia_id, req.params.id, activo);
    if (!resultado) return res.status(404).json({ error: 'Familia no encontrada' });
    return res.json({ mensaje: activo ? 'Acceso reactivado.' : 'Acceso dado de baja.', familia: resultado });
  } catch (err) {
    return next(err);
  }
}

// ---------------------------------------------------------------------------
// Módulos activos de la propia academia (solo lectura) — le permite al
// admin (no solo a super_admin) saber qué módulos tiene activos, para que
// el frontend pueda mostrar/ocultar accesos (Agenda, Eventos, Sponsors,
// etc.) según el catálogo real en vez de links fijos hardcodeados. Reusa
// tal cual superadminRepo.getModulosAcademia(), que ya existía para la
// pantalla de super-admin — no se agregó ninguna lógica de negocio nueva.
// ---------------------------------------------------------------------------
export async function listarModulosPropios(req, res, next) {
  try {
    return res.json(await superadminRepo.getModulosAcademia(req.perfil.academia_id));
  } catch (err) {
    return next(err);
  }
}
