import * as familiasRepo from '../repos/familias.repo.js';

/**
 * Login público de familias por código único (sin email visible). El
 * frontend solo pide el código; acá se resuelve a qué cuenta corresponde y
 * se arma la sesión real contra Supabase Auth.
 */
export async function loginFamilia(req, res, next) {
  try {
    const { codigo } = req.body;
    if (!codigo?.trim()) return res.status(400).json({ error: 'Ingresá el código de acceso de tu familia' });

    const resultado = await familiasRepo.loginConCodigo(codigo.trim());
    if (resultado.error) return res.status(401).json({ error: resultado.error });

    return res.json(resultado);
  } catch (err) {
    return next(err);
  }
}
