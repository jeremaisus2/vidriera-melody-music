import * as store from '../data/store.js';

const CATEGORIAS_VALIDAS = [
  'fotografia_video',
  'vestuario_arreglos',
  'instrumentos',
  'servicios_eventos',
  'general',
];

// --- Rutas públicas ---

export function listarVidriera(req, res) {
  const { categoria } = req.query;
  if (categoria && !CATEGORIAS_VALIDAS.includes(categoria)) {
    return res.status(400).json({ error: `Categoría no válida: "${categoria}". Opciones: ${CATEGORIAS_VALIDAS.join(', ')}` });
  }
  return res.json(store.getPublicacionesAprobadas({ categoria }));
}

export function verPublicacion(req, res) {
  const pub = store.getPublicacionById(req.params.id);
  if (!pub || pub.estado !== 'approved') {
    return res.status(404).json({ error: 'Publicación no encontrada' });
  }
  return res.json(pub);
}

export function registrarVista(req, res) {
  const pub = store.getPublicacionById(req.params.id);
  if (!pub || pub.estado !== 'approved') {
    return res.status(404).json({ error: 'Publicación no encontrada' });
  }
  store.incrementarVistas(req.params.id);
  return res.status(204).end();
}

// --- Rutas cliente (autenticado) ---

export function misPublicaciones(req, res) {
  return res.json(store.getPublicacionesByOwner(req.user.id));
}

export function crearPublicacion(req, res) {
  const { nombre, categoria, descripcion, imagen_url, whatsapp } = req.body;

  if (!nombre?.trim()) {
    return res.status(400).json({ error: 'El campo nombre es requerido' });
  }
  if (!CATEGORIAS_VALIDAS.includes(categoria)) {
    return res.status(400).json({ error: `Categoría inválida. Opciones: ${CATEGORIAS_VALIDAS.join(', ')}` });
  }

  const nueva = store.crearPublicacion({
    academia_id: req.perfil.academia_id,
    owner_user_id: req.user.id,
    nombre: nombre.trim(),
    categoria,
    descripcion,
    imagen_url,
    whatsapp,
  });

  return res.status(201).json(nueva);
}

export function proponerEdicion(req, res) {
  const pub = store.getPublicacionById(req.params.id);
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

  const resultado = store.editarPublicacion(req.params.id, cambios, req.user.id);

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
}
