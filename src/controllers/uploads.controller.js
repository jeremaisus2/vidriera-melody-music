import * as uploadsRepo from '../repos/uploads.repo.js';

const TIPOS_ACEPTADOS = ['image/jpeg', 'image/png', 'image/webp'];

export async function subirImagen(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Se requiere un archivo en el campo "imagen"' });
    }
    if (!TIPOS_ACEPTADOS.includes(req.file.mimetype)) {
      return res.status(400).json({ error: `Formato no soportado: "${req.file.mimetype}". Opciones: ${TIPOS_ACEPTADOS.join(', ')}` });
    }
    if (!req.perfil.academia_id) {
      return res.status(400).json({ error: 'Tu usuario no tiene una academia asociada' });
    }

    const resultado = await uploadsRepo.subirImagen(req.file.buffer, {
      academia_id: req.perfil.academia_id,
    });

    return res.status(201).json({ imagen_url: resultado.url });
  } catch (err) {
    return next(err);
  }
}
