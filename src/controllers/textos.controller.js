import * as textosRepo from '../repos/textos.repo.js';

export async function listarTextosPublicos(req, res, next) {
  try {
    return res.json(await textosRepo.getTextosPublicos());
  } catch (err) {
    return next(err);
  }
}
