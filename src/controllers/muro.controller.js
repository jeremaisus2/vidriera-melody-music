import * as muroRepo from '../repos/muro.repo.js';

const ESTADOS_MODERACION = ['aprobado', 'rechazado'];

// ---------------------------------------------------------------------------
// Público
// ---------------------------------------------------------------------------
export async function listarMuroPublico(req, res, next) {
  try {
    return res.json(await muroRepo.getMuroPublico());
  } catch (err) {
    return next(err);
  }
}

export async function listarCategoriasPublicas(req, res, next) {
  try {
    return res.json(await muroRepo.getCategoriasPublicas());
  } catch (err) {
    return next(err);
  }
}

// ---------------------------------------------------------------------------
// Familia autenticada
// ---------------------------------------------------------------------------
export async function crearPost(req, res, next) {
  try {
    const { contenido, categoria } = req.body;

    if (!contenido?.trim()) return res.status(400).json({ error: 'El campo contenido es requerido' });
    if (!categoria?.trim()) return res.status(400).json({ error: 'El campo categoria es requerido' });

    const categoriasActivas = await muroRepo.getCategoriasPublicas();
    if (!categoriasActivas.some((c) => c.clave === categoria)) {
      return res.status(400).json({ error: `Categoría inválida. Opciones: ${categoriasActivas.map((c) => c.clave).join(', ')}` });
    }

    const nuevo = await muroRepo.crearPost(req.supabase, {
      academia_id: req.perfil.academia_id,
      familia_id: req.user.id,
      contenido: contenido.trim(),
      categoria,
    });
    return res.status(201).json(nuevo);
  } catch (err) {
    return next(err);
  }
}

// ---------------------------------------------------------------------------
// Panel admin — moderación
// ---------------------------------------------------------------------------
export async function listarMuroAdmin(req, res, next) {
  try {
    return res.json(await muroRepo.getMuroAdmin(req.perfil.academia_id));
  } catch (err) {
    return next(err);
  }
}

export async function actualizarEstadoPost(req, res, next) {
  try {
    const { estado } = req.body;
    if (!ESTADOS_MODERACION.includes(estado)) {
      return res.status(400).json({ error: `Estado inválido. Opciones: ${ESTADOS_MODERACION.join(', ')}` });
    }

    const resultado = await muroRepo.moderarPost(req.perfil.academia_id, req.params.id, estado);
    if (!resultado) return res.status(404).json({ error: 'Post no encontrado' });
    if (resultado.error) return res.status(409).json({ error: resultado.error });
    return res.json(resultado);
  } catch (err) {
    return next(err);
  }
}

// ---------------------------------------------------------------------------
// Panel admin — catálogo de categorías
// ---------------------------------------------------------------------------
export async function listarCategoriasAdmin(req, res, next) {
  try {
    return res.json(await muroRepo.getCatalogoCategorias({ incluirInactivas: true }));
  } catch (err) {
    return next(err);
  }
}

const CLAVE_REGEX = /^[a-z0-9-]+$/;

export async function crearCategoria(req, res, next) {
  try {
    const { clave, nombre, color } = req.body;
    if (!clave?.trim() || !CLAVE_REGEX.test(clave.trim())) {
      return res.status(400).json({ error: 'La clave es requerida y solo puede tener minúsculas, números y guiones' });
    }
    if (!nombre?.trim()) return res.status(400).json({ error: 'El campo nombre es requerido' });

    const resultado = await muroRepo.crearCategoria({ clave: clave.trim(), nombre: nombre.trim(), color: color?.trim() || null });
    if (resultado.error) return res.status(409).json({ error: resultado.error });
    return res.status(201).json(resultado);
  } catch (err) {
    return next(err);
  }
}

export async function editarCategoria(req, res, next) {
  try {
    const { nombre, color } = req.body;
    const cambios = {};
    if (nombre !== undefined) {
      if (!nombre.trim()) return res.status(400).json({ error: 'El nombre no puede quedar vacío' });
      cambios.nombre = nombre.trim();
    }
    if (color !== undefined) cambios.color = color?.trim() || null;

    if (Object.keys(cambios).length === 0) {
      return res.status(400).json({ error: 'No se enviaron cambios' });
    }

    const resultado = await muroRepo.editarCategoria(req.params.clave, cambios);
    if (!resultado) return res.status(404).json({ error: 'Categoría no encontrada' });
    return res.json(resultado);
  } catch (err) {
    return next(err);
  }
}

export async function cambiarEstadoCategoria(req, res, next) {
  try {
    const { activo } = req.body;
    if (typeof activo !== 'boolean') return res.status(400).json({ error: 'El campo activo debe ser booleano' });

    const resultado = await muroRepo.setEstadoCategoria(req.params.clave, activo);
    if (!resultado) return res.status(404).json({ error: 'Categoría no encontrada' });
    return res.json(resultado);
  } catch (err) {
    return next(err);
  }
}

export async function reordenarCategorias(req, res, next) {
  try {
    const { orden } = req.body;
    if (!Array.isArray(orden) || orden.length === 0 || orden.some((c) => typeof c !== 'string')) {
      return res.status(400).json({ error: 'Se requiere "orden" como array de claves (strings)' });
    }

    const resultado = await muroRepo.setOrdenCategorias(orden);
    const respuesta = { ok: true };
    if (resultado.invalidas.length > 0) {
      respuesta.advertencia = `Claves ignoradas (no existen): ${resultado.invalidas.join(', ')}`;
    }
    return res.json(respuesta);
  } catch (err) {
    return next(err);
  }
}
