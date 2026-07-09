import QRCode from 'qrcode';
import { env } from '../config/env.js';
import * as store from '../data/store.js';

const TIPOS_VALIDOS    = ['concierto', 'muestra', 'examen'];
const REACCIONES_VALIDAS = ['voy_a_asistir', 'nos_encanto'];

// --- Público ---

export function listarEventos(req, res) {
  const { tipo, soloFuturos } = req.query;

  if (tipo && !TIPOS_VALIDOS.includes(tipo)) {
    return res.status(400).json({ error: `Tipo no válido: "${tipo}". Opciones: ${TIPOS_VALIDOS.join(', ')}` });
  }

  return res.json(store.getEventos({
    tipo,
    soloFuturos: soloFuturos === 'true',
  }));
}

export function verEvento(req, res) {
  const evento = store.getEventoById(req.params.id);
  if (!evento) return res.status(404).json({ error: 'Evento no encontrado' });
  return res.json(evento);
}

export async function obtenerQR(req, res, next) {
  try {
    const evento = store.getEventoById(req.params.id);
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

export function listarSponsors(req, res) {
  const evento = store.getEventoById(req.params.id);
  if (!evento) return res.status(404).json({ error: 'Evento no encontrado' });
  return res.json(store.getSponsorsDelEvento(req.params.id));
}

export function listarGaleria(req, res) {
  const evento = store.getEventoById(req.params.id);
  if (!evento) return res.status(404).json({ error: 'Evento no encontrado' });
  return res.json(store.getGaleriaDelEvento(req.params.id));
}

export function listarTestimonios(req, res) {
  const evento = store.getEventoById(req.params.id);
  if (!evento) return res.status(404).json({ error: 'Evento no encontrado' });
  return res.json(store.getTestimoniosDelEvento(req.params.id));
}

// --- Familias autenticadas ---

export function confirmarRsvp(req, res) {
  const evento = store.getEventoById(req.params.id);
  if (!evento) return res.status(404).json({ error: 'Evento no encontrado' });

  const asiste = req.body.asiste !== false; // default true si no se envía
  const registro = store.upsertRsvp(req.params.id, req.user.id, asiste);
  return res.json({
    mensaje: asiste ? 'Asistencia confirmada.' : 'Asistencia cancelada.',
    rsvp: registro,
  });
}

export function reaccionar(req, res) {
  const evento = store.getEventoById(req.params.id);
  if (!evento) return res.status(404).json({ error: 'Evento no encontrado' });

  const { tipo } = req.body;
  if (!REACCIONES_VALIDAS.includes(tipo)) {
    return res.status(400).json({ error: `Tipo de reacción no válido. Opciones: ${REACCIONES_VALIDAS.join(', ')}` });
  }

  const resultado = store.toggleReaccion(req.params.id, req.user.id, tipo);
  return res.json({
    mensaje: resultado.activa ? 'Reacción registrada.' : 'Reacción eliminada.',
    ...resultado,
  });
}

export function dejarTestimonio(req, res) {
  const evento = store.getEventoById(req.params.id);
  if (!evento) return res.status(404).json({ error: 'Evento no encontrado' });

  const { texto } = req.body;
  if (!texto?.trim()) {
    return res.status(400).json({ error: 'El campo texto es requerido' });
  }
  if (texto.trim().length > 500) {
    return res.status(400).json({ error: 'El testimonio no puede superar los 500 caracteres' });
  }

  const testimonio = store.crearTestimonio(req.params.id, req.user.id, texto.trim());
  return res.status(201).json(testimonio);
}
