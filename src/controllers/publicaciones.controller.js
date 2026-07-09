import * as publicacionesRepo from '../repos/publicaciones.repo.js';
import * as eventosRepo from '../repos/eventos.repo.js';

const CATEGORIAS_VALIDAS = [
  'fotografia_video',
  'vestuario_arreglos',
  'instrumentos',
  'servicios_eventos',
  'general',
];

// --- Rutas públicas ---

export async function listarVidriera(req, res, next) {
  try {
    const { categoria } = req.query;
    if (categoria && !CATEGORIAS_VALIDAS.includes(categoria)) {
      return res.status(400).json({ error: `Categoría no válida: "${categoria}". Opciones: ${CATEGORIAS_VALIDAS.join(', ')}` });
    }
    return res.json(await publicacionesRepo.getPublicacionesAprobadas({ categoria }));
  } catch (err) {
    return next(err);
  }
}

export async function verPublicacion(req, res, next) {
  try {
    const pub = await publicacionesRepo.getPublicacionById(req.params.id);
    if (!pub || pub.estado !== 'approved') {
      return res.status(404).json({ error: 'Publicación no encontrada' });
    }
    return res.json(pub);
  } catch (err) {
    return next(err);
  }
}

export async function registrarVista(req, res, next) {
  try {
    const pub = await publicacionesRepo.getPublicacionById(req.params.id);
    if (!pub || pub.estado !== 'approved') {
      return res.status(404).json({ error: 'Publicación no encontrada' });
    }
    await publicacionesRepo.incrementarVistas(req.params.id);
    return res.status(204).end();
  } catch (err) {
    return next(err);
  }
}

// --- Rutas cliente (autenticado) ---

export async function misPublicaciones(req, res, next) {
  try {
    return res.json(await publicacionesRepo.getPublicacionesByOwner(req.supabase, req.user.id));
  } catch (err) {
    return next(err);
  }
}

/**
 * Destacado rotativo: sponsors del evento más próximo cuya ventana está activa.
 * Ventana = 7 días antes a 2 días después del evento.
 * Devuelve null en `destacado` si no hay evento activo.
 */
export async function destacadoRotativo(req, res, next) {
  try {
    const destacado = await eventosRepo.getDestacadoRotativo();
    return res.json(destacado ?? { destacado: null, mensaje: 'Sin evento activo en ventana de destacado.' });
  } catch (err) {
    return next(err);
  }
}

export async function crearPublicacion(req, res, next) {
  try {
    const { nombre, categoria, descripcion, imagen_url, whatsapp } = req.body;

    if (!nombre?.trim()) {
      return res.status(400).json({ error: 'El campo nombre es requerido' });
    }
    if (!CATEGORIAS_VALIDAS.includes(categoria)) {
      return res.status(400).json({ error: `Categoría inválida. Opciones: ${CATEGORIAS_VALIDAS.join(', ')}` });
    }

    const nueva = await publicacionesRepo.crearPublicacion(req.supabase, {
      academia_id: req.perfil.academia_id,
      owner_user_id: req.user.id,
      nombre: nombre.trim(),
      categoria,
      descripcion,
      imagen_url,
      whatsapp,
    });

    return res.status(201).json(nueva);
  } catch (err) {
    return next(err);
  }
}

export async function proponerEdicion(req, res, next) {
  try {
    const pub = await publicacionesRepo.getPublicacionById(req.params.id);
    if (!pub) {
      return res.status(404).json({ error: 'Publicación no encontrada' });
    }
    if (pub.owner_user_id !== req.user.id) {
      return res.status(403).json({ error: 'No tenés permisos para editar esta publicación' });
    }

    const { nombre, categoria, descripcion, imagen_url, whatsapp } = req.body;

    if (categoria !== undefined && !CATEGORIAS_VALIDAS.includes(categoria)) {
      return res.status(400).json({ error: `Categoría inválida: "${categoria}"` });
    }

    const cambios = {};
    if (nombre      !== undefined) cambios.nombre      = nombre.trim();
    if (categoria   !== undefined) cambios.categoria   = categoria;
    if (descripcion !== undefined) cambios.descripcion = descripcion;
    if (imagen_url  !== undefined) cambios.imagen_url  = imagen_url;
    if (whatsapp    !== undefined) cambios.whatsapp    = whatsapp;

    if (Object.keys(cambios).length === 0) {
      return res.status(400).json({ error: 'No se enviaron cambios' });
    }

    const resultado = await publicacionesRepo.editarPublicacion(req.supabase, req.params.id, cambios, req.user.id);

    if (resultado.tipo === 'edicion_creada') {
      return res.status(202).json({
        mensaje: 'La edición quedó en revisión. El dato público no cambia hasta que el admin la apruebe.',
        edicion: resultado.edicion,
      });
    }

    return res.json({
      mensaje: 'Publicación actualizada y puesta en revisión.',
      publicacion: resultado.publicacion,
    });
  } catch (err) {
    return next(err);
  }
}
