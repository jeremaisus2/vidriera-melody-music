import * as superadminRepo from '../repos/superadmin.repo.js';

const SLUG_RE = /^[a-z0-9-]+$/;

// ---------------------------------------------------------------------------
// Academias
// ---------------------------------------------------------------------------
export async function listarAcademias(req, res, next) {
  try {
    return res.json(await superadminRepo.getAcademias());
  } catch (err) {
    return next(err);
  }
}

export async function crearAcademia(req, res, next) {
  try {
    const { nombre, slug } = req.body;

    if (!nombre?.trim()) return res.status(400).json({ error: 'El campo nombre es requerido' });
    if (!slug?.trim())   return res.status(400).json({ error: 'El campo slug es requerido' });
    if (!SLUG_RE.test(slug.trim())) {
      return res.status(400).json({ error: 'El slug solo puede tener letras minúsculas, números y guiones' });
    }

    const resultado = await superadminRepo.crearAcademia({ nombre: nombre.trim(), slug: slug.trim() });
    if (resultado.error) return res.status(409).json({ error: resultado.error });
    return res.status(201).json(resultado);
  } catch (err) {
    return next(err);
  }
}

export async function editarAcademia(req, res, next) {
  try {
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

    const resultado = await superadminRepo.editarAcademia(req.params.id, cambios);
    if (!resultado)      return res.status(404).json({ error: 'Academia no encontrada' });
    if (resultado.error) return res.status(409).json({ error: resultado.error });
    return res.json(resultado);
  } catch (err) {
    return next(err);
  }
}

export async function cambiarEstado(req, res, next) {
  try {
    const { estado } = req.body;
    if (!['activa', 'pausada'].includes(estado)) {
      return res.status(400).json({ error: 'El campo estado debe ser "activa" o "pausada"' });
    }
    const resultado = await superadminRepo.setEstadoAcademia(req.params.id, estado);
    if (!resultado) return res.status(404).json({ error: 'Academia no encontrada' });
    return res.json({ mensaje: `Academia ${estado}.`, academia: resultado });
  } catch (err) {
    return next(err);
  }
}

// ---------------------------------------------------------------------------
// Catálogo de módulos
// ---------------------------------------------------------------------------
export async function catalogoModulos(req, res, next) {
  try {
    return res.json(await superadminRepo.getCatalogoModulos());
  } catch (err) {
    return next(err);
  }
}

// ---------------------------------------------------------------------------
// Módulos por academia
// ---------------------------------------------------------------------------
export async function modulosAcademia(req, res, next) {
  try {
    const academia = await superadminRepo.getAcademiaById(req.params.id);
    if (!academia) return res.status(404).json({ error: 'Academia no encontrada' });
    return res.json(await superadminRepo.getModulosAcademia(req.params.id));
  } catch (err) {
    return next(err);
  }
}

export async function actualizarModulos(req, res, next) {
  try {
    const academia = await superadminRepo.getAcademiaById(req.params.id);
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

    const resultado = await superadminRepo.setModulosAcademia(req.params.id, cambios);

    const respuesta = { modulos: resultado.modulos };
    if (resultado.invalidas.length > 0) {
      respuesta.advertencia = `Claves no reconocidas ignoradas: ${resultado.invalidas.join(', ')}`;
    }
    return res.json(respuesta);
  } catch (err) {
    return next(err);
  }
}

// ---------------------------------------------------------------------------
// Resumen por cliente
// ---------------------------------------------------------------------------
export async function resumenAcademia(req, res, next) {
  try {
    const resumen = await superadminRepo.getResumenAcademia(req.params.id);
    if (!resumen) return res.status(404).json({ error: 'Academia no encontrada' });
    return res.json(resumen);
  } catch (err) {
    return next(err);
  }
}
