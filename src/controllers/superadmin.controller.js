import * as store from '../data/store.js';

const SLUG_RE = /^[a-z0-9-]+$/;

// ---------------------------------------------------------------------------
// Academias
// ---------------------------------------------------------------------------
export function listarAcademias(req, res) {
  return res.json(store.getAcademias());
}

export function crearAcademia(req, res) {
  const { nombre, slug } = req.body;

  if (!nombre?.trim()) return res.status(400).json({ error: 'El campo nombre es requerido' });
  if (!slug?.trim())   return res.status(400).json({ error: 'El campo slug es requerido' });
  if (!SLUG_RE.test(slug.trim())) {
    return res.status(400).json({ error: 'El slug solo puede tener letras minúsculas, números y guiones' });
  }

  const resultado = store.crearAcademia({ nombre: nombre.trim(), slug: slug.trim() });
  if (resultado.error) return res.status(409).json({ error: resultado.error });
  return res.status(201).json(resultado);
}

export function editarAcademia(req, res) {
  const { nombre, slug } = req.body;

  if (slug !== undefined && !SLUG_RE.test(slug)) {
    return res.status(400).json({ error: 'El slug solo puede tener letras minúsculas, números y guiones' });
  }

  const cambios = {};
  if (nombre !== undefined) cambios.nombre = nombre.trim();
  if (slug   !== undefined) cambios.slug   = slug.trim();

  if (Object.keys(cambios).length === 0) {
    return res.status(400).json({ error: 'No se enviaron cambios' });
  }

  const resultado = store.editarAcademia(req.params.id, cambios);
  if (!resultado)      return res.status(404).json({ error: 'Academia no encontrada' });
  if (resultado.error) return res.status(409).json({ error: resultado.error });
  return res.json(resultado);
}

export function cambiarEstado(req, res) {
  const { estado } = req.body;
  if (!['activa', 'pausada'].includes(estado)) {
    return res.status(400).json({ error: 'El campo estado debe ser "activa" o "pausada"' });
  }
  const resultado = store.setEstadoAcademia(req.params.id, estado);
  if (!resultado) return res.status(404).json({ error: 'Academia no encontrada' });
  return res.json({ mensaje: `Academia ${estado}.`, academia: resultado });
}

// ---------------------------------------------------------------------------
// Catálogo de módulos
// ---------------------------------------------------------------------------
export function catalogoModulos(req, res) {
  return res.json(store.getCatalogoModulos());
}

// ---------------------------------------------------------------------------
// Módulos por academia
// ---------------------------------------------------------------------------
export function modulosAcademia(req, res) {
  const academia = store.getAcademiaById(req.params.id);
  if (!academia) return res.status(404).json({ error: 'Academia no encontrada' });
  return res.json(store.getModulosAcademia(req.params.id));
}

export function actualizarModulos(req, res) {
  const academia = store.getAcademiaById(req.params.id);
  if (!academia) return res.status(404).json({ error: 'Academia no encontrada' });

  const cambios = req.body;
  if (
    typeof cambios !== 'object' ||
    Array.isArray(cambios) ||
    Object.keys(cambios).length === 0
  ) {
    return res.status(400).json({ error: 'El body debe ser un objeto { clave: boolean }, ej: { "galeria": true }' });
  }

  // Validar que todos los valores sean booleanos.
  const noBooleanos = Object.entries(cambios).filter(([, v]) => typeof v !== 'boolean');
  if (noBooleanos.length > 0) {
    return res.status(400).json({ error: `Los valores deben ser booleanos. Inválidos: ${noBooleanos.map(([k]) => k).join(', ')}` });
  }

  const resultado = store.setModulosAcademia(req.params.id, cambios);

  const respuesta = { modulos: resultado.modulos };
  if (resultado.invalidas.length > 0) {
    respuesta.advertencia = `Claves no reconocidas ignoradas: ${resultado.invalidas.join(', ')}`;
  }
  return res.json(respuesta);
}

// ---------------------------------------------------------------------------
// Resumen por cliente
// ---------------------------------------------------------------------------
export function resumenAcademia(req, res) {
  const resumen = store.getResumenAcademia(req.params.id);
  if (!resumen) return res.status(404).json({ error: 'Academia no encontrada' });
  return res.json(resumen);
}
