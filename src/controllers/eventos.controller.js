import QRCode from 'qrcode';
import { env } from '../config/env.js';
import * as eventosRepo from '../repos/eventos.repo.js';

const TIPOS_VALIDOS    = ['concierto', 'muestra', 'examen'];
const REACCIONES_VALIDAS = ['voy_a_asistir', 'nos_encanto'];

// --- Público ---

export async function listarEventos(req, res, next) {
  try {
    const { tipo, soloFuturos } = req.query;

    if (tipo && !TIPOS_VALIDOS.includes(tipo)) {
      return res.status(400).json({ error: `Tipo no válido: "${tipo}". Opciones: ${TIPOS_VALIDOS.join(', ')}` });
    }

    return res.json(await eventosRepo.getEventos({
      tipo,
      soloFuturos: soloFuturos === 'true',
    }));
  } catch (err) {
    return next(err);
  }
}

export async function verEvento(req, res, next) {
  try {
    const evento = await eventosRepo.getEventoById(req.params.id);
    if (!evento) return res.status(404).json({ error: 'Evento no encontrado' });
    return res.json(evento);
  } catch (err) {
    return next(err);
  }
}

export async function obtenerQR(req, res, next) {
  try {
    const evento = await eventosRepo.getEventoById(req.params.id);
    if (!evento) return res.status(404).json({ error: 'Evento no encontrado' });

    const url = `${env.appUrl}/eventos/${evento.id}`;
    const buffer = await QRCode.toBuffer(url, { type: 'png', width: 400, margin: 2 });

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Disposition', `inline; filename="qr-evento-${evento.id}.png"`);
    return res.send(buffer);
  } catch (err) {
    return next(err);
  }
}

export async function listarSponsors(req, res, next) {
  try {
    const evento = await eventosRepo.getEventoById(req.params.id);
    if (!evento) return res.status(404).json({ error: 'Evento no encontrado' });
    return res.json(await eventosRepo.getSponsorsDelEvento(req.params.id));
  } catch (err) {
    return next(err);
  }
}

export async function listarGaleria(req, res, next) {
  try {
    const evento = await eventosRepo.getEventoById(req.params.id);
    if (!evento) return res.status(404).json({ error: 'Evento no encontrado' });
    return res.json(await eventosRepo.getGaleriaDelEvento(req.params.id));
  } catch (err) {
    return next(err);
  }
}

export async function listarTestimonios(req, res, next) {
  try {
    const evento = await eventosRepo.getEventoById(req.params.id);
    if (!evento) return res.status(404).json({ error: 'Evento no encontrado' });
    return res.json(await eventosRepo.getTestimoniosDelEvento(req.params.id));
  } catch (err) {
    return next(err);
  }
}

// --- Familias autenticadas ---

export async function confirmarRsvp(req, res, next) {
  try {
    const evento = await eventosRepo.getEventoById(req.params.id);
    if (!evento) return res.status(404).json({ error: 'Evento no encontrado' });

    const asiste = req.body.asiste !== false; // default true si no se envía
    const registro = await eventosRepo.upsertRsvp(req.supabase, req.params.id, req.user.id, asiste);
    return res.json({
      mensaje: asiste ? 'Asistencia confirmada.' : 'Asistencia cancelada.',
      rsvp: registro,
    });
  } catch (err) {
    return next(err);
  }
}

export async function reaccionar(req, res, next) {
  try {
    const evento = await eventosRepo.getEventoById(req.params.id);
    if (!evento) return res.status(404).json({ error: 'Evento no encontrado' });

    const { tipo } = req.body;
    if (!REACCIONES_VALIDAS.includes(tipo)) {
      return res.status(400).json({ error: `Tipo de reacción no válido. Opciones: ${REACCIONES_VALIDAS.join(', ')}` });
    }

    const resultado = await eventosRepo.toggleReaccion(req.supabase, req.params.id, req.user.id, tipo);
    return res.json({
      mensaje: resultado.activa ? 'Reacción registrada.' : 'Reacción eliminada.',
      ...resultado,
    });
  } catch (err) {
    return next(err);
  }
}

export async function dejarTestimonio(req, res, next) {
  try {
    const evento = await eventosRepo.getEventoById(req.params.id);
    if (!evento) return res.status(404).json({ error: 'Evento no encontrado' });

    const { texto, familia } = req.body;
    if (!texto?.trim()) {
      return res.status(400).json({ error: 'El campo texto es requerido' });
    }
    if (texto.trim().length > 500) {
      return res.status(400).json({ error: 'El testimonio no puede superar los 500 caracteres' });
    }
    if (!familia?.trim()) {
      return res.status(400).json({ error: 'El campo familia es requerido' });
    }

    const testimonio = await eventosRepo.crearTestimonio(req.supabase, req.params.id, req.user.id, texto.trim(), familia.trim());
    return res.status(201).json(testimonio);
  } catch (err) {
    return next(err);
  }
}

// --- Familias autenticadas: mis reacciones (para pintar el estado activo/inactivo) ---

export async function misReacciones(req, res, next) {
  try {
    return res.json(await eventosRepo.getReaccionesByUser(req.supabase, req.user.id));
  } catch (err) {
    return next(err);
  }
}
