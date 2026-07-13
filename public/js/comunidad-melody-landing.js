// ---------------------------------------------------------------------------
// comunidad-melody-landing.js
//
// Extraído del <script> inline original: el CSP de este backend (helmet,
// ver src/app.js) usa script-src 'self' sin 'unsafe-inline' — un script
// inline queda bloqueado por el navegador sin ningún aviso visible más que
// la consola (mismo criterio que el resto de las pantallas del proyecto,
// que siempre cargan un archivo externo). Este bloqueo era la causa real
// de que "Ver calendario completo →" (un <a href="#">) saltara al tope de
// la página: sin este script corriendo, su preventDefault() nunca se
// registraba y el navegador ejecutaba el salto nativo del ancla vacía.
// ---------------------------------------------------------------------------

// Menú mobile
const hamburgerBtn = document.getElementById('hamburgerBtn');
const mobileNav = document.getElementById('mobileNav');
hamburgerBtn.addEventListener('click', () => {
  const isOpen = mobileNav.classList.toggle('open');
  hamburgerBtn.setAttribute('aria-expanded', isOpen);
});
mobileNav.querySelectorAll('a').forEach(a => {
  a.addEventListener('click', () => {
    mobileNav.classList.remove('open');
    hamburgerBtn.setAttribute('aria-expanded', 'false');
  });
});

// Animación sutil al hacer scroll (una sola vez, sin exagerar)
const revealEls = document.querySelectorAll('.reveal');
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting){
      entry.target.classList.add('show');
      observer.unobserve(entry.target);
    }
  });
}, { threshold: 0.12 });
revealEls.forEach(el => observer.observe(el));

// Modal / lightbox del evento destacado
const eventModal = document.getElementById('eventModal');
window.openEventModal = function(){
  eventModal.classList.add('open');
  document.body.style.overflow = 'hidden';
};
window.closeEventModal = function(){
  eventModal.classList.remove('open');
  document.body.style.overflow = '';
};
eventModal.addEventListener('click', (e) => {
  if (e.target === eventModal) closeEventModal();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeEventModal();
});

// Agenda: reemplaza el contenido hardcodeado por los eventos reales de
// GET /api/agenda (público, solo activos). Fetch relativo: funciona sin
// configuración de CORS porque este HTML se sirve desde el mismo origen
// que la API (Express, express.static sobre esta misma carpeta).
//
// agendaEventosCache guarda el mismo array que ya trae este fetch para
// que el modal de calendario completo (más abajo) lo reuse sin pegarle
// una segunda vez a /api/agenda — no hace falta un endpoint ni parámetro
// nuevo, la lista completa ya viaja acá (el volumen esperado de una
// agenda comunitaria es chico, filtrar por mes en el cliente alcanza).
let agendaEventosCache = [];

(function cargarAgenda(){
  const wrap = document.getElementById('agendaList');
  if (!wrap) return;

  fetch('/api/agenda')
    .then((res) => { if (!res.ok) throw new Error('respuesta no OK'); return res.json(); })
    .then((eventos) => {
      agendaEventosCache = Array.isArray(eventos) ? eventos : [];
      if (agendaEventosCache.length === 0){
        wrap.innerHTML = '<p class="agenda-empty">Todavía no hay eventos programados. ¡Volvé pronto!</p>';
        return;
      }
      wrap.innerHTML = agendaEventosCache.map((e) => {
        const fecha = new Date(`${e.fecha}T00:00:00`);
        const dia = fecha.getDate();
        const mes = fecha.toLocaleDateString('es-AR', { month: 'short' }).replace('.', '').toUpperCase();
        const hora = String(e.hora ?? '').slice(0, 5);
        return `
          <div class="agenda-row">
            <div class="agenda-date"><div class="d">${dia}</div><div class="m">${mes}</div></div>
            <div class="agenda-info"><h5>${escapeHtmlAgenda(e.titulo)}</h5><span>${escapeHtmlAgenda(e.lugar)}</span></div>
            <div class="agenda-time">${hora} hs</div>
          </div>`;
      }).join('');
    })
    .catch(() => {
      wrap.innerHTML = '<p class="agenda-empty">No pudimos cargar la agenda en este momento.</p>';
    })
    .finally(postHeight);
})();

function escapeHtmlAgenda(str){
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
  }[c]));
}

// ---------------------------------------------------------------------
// Modal de calendario completo (vista mensual tipo Google Calendar)
//
// Vanilla JS, sin librería: la lógica de un calendario mensual es simple
// (grid de 7 columnas, offset de días fuera de mes) y así queda 100%
// re-estilable con la misma paleta cream/olive/clay del resto de la
// página, sin pelear contra el CSS de un componente de terceros.
//
// max-height:85vh + overflow-y:auto en .calendar-modal-inner (ver CSS):
// el modal tiene su propio scroll interno, independiente del mecanismo
// de auto-resize del <iframe> de abajo — nunca necesita que WordPress
// cambie la altura del iframe mientras está abierto, ni al abrir ni al
// cerrar.
//
// Scroll: se guarda window.scrollY antes de bloquear y se restaura al
// cerrar (las 3 formas: X, click afuera, Escape). El bloqueo se aplica a
// <html> Y <body> — en esta página el "scrolling element" real es
// <html> (confirmado con document.scrollingElement), no <body>; bloquear
// solo body no alcanza en todos los navegadores.
// ---------------------------------------------------------------------
const calendarModal = document.getElementById('calendarModal');
const calGrid = document.getElementById('calGrid');
const calMonthLabel = document.getElementById('calMonthLabel');
const calDetail = document.getElementById('calDetail');

const hoy = new Date();
let calAnio = hoy.getFullYear();
let calMes = hoy.getMonth(); // 0-11
let calDiaSeleccionado = null; // "YYYY-MM-DD" o null
let scrollYGuardado = 0;

function eventosPorDia(){
  const mapa = new Map();
  agendaEventosCache.forEach((e) => {
    if (!mapa.has(e.fecha)) mapa.set(e.fecha, []);
    mapa.get(e.fecha).push(e);
  });
  return mapa;
}

function renderCalendario(){
  const mapa = eventosPorDia();
  calMonthLabel.textContent = new Date(calAnio, calMes, 1)
    .toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });

  const primerDiaSemana = (new Date(calAnio, calMes, 1).getDay() + 6) % 7; // 0=lunes
  const diasEnMes = new Date(calAnio, calMes + 1, 0).getDate();
  const diasMesAnterior = new Date(calAnio, calMes, 0).getDate();
  const hoyStr = formatoFecha(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());

  const celdas = [];
  for (let i = primerDiaSemana - 1; i >= 0; i--){
    celdas.push({ dia: diasMesAnterior - i, fuera: true });
  }
  for (let d = 1; d <= diasEnMes; d++){
    celdas.push({ dia: d, fuera: false, fechaStr: formatoFecha(calAnio, calMes, d) });
  }
  while (celdas.length % 7 !== 0){
    celdas.push({ dia: celdas.length - (primerDiaSemana + diasEnMes) + 1, fuera: true });
  }

  calGrid.innerHTML = celdas.map((c) => {
    if (c.fuera) return `<div class="cal-day cal-day-outside">${c.dia}</div>`;
    const eventosDelDia = mapa.get(c.fechaStr);
    const clases = ['cal-day'];
    if (c.fechaStr === hoyStr) clases.push('cal-day-today');
    if (eventosDelDia) clases.push('cal-day-has-events');
    if (c.fechaStr === calDiaSeleccionado) clases.push('cal-day-selected');
    return `
      <button type="button" class="${clases.join(' ')}" data-fecha="${c.fechaStr}" ${eventosDelDia ? '' : 'disabled'}>
        ${c.dia}${eventosDelDia ? '<span class="cal-day-dot"></span>' : ''}
      </button>`;
  }).join('');

  calGrid.querySelectorAll('.cal-day-has-events').forEach((btn) => {
    btn.addEventListener('click', () => {
      calDiaSeleccionado = btn.dataset.fecha;
      renderCalendario();
      renderDetalleDia(mapa.get(calDiaSeleccionado));
    });
  });

  if (calDiaSeleccionado && mapa.has(calDiaSeleccionado)){
    renderDetalleDia(mapa.get(calDiaSeleccionado));
  } else {
    calDiaSeleccionado = null;
    calDetail.innerHTML = '<p class="cal-detail-empty">Elegí un día marcado para ver sus eventos.</p>';
  }
}

function renderDetalleDia(eventosDelDia){
  calDetail.innerHTML = eventosDelDia.map((e) => {
    const fecha = new Date(`${e.fecha}T00:00:00`);
    const dia = fecha.getDate();
    const mes = fecha.toLocaleDateString('es-AR', { month: 'short' }).replace('.', '').toUpperCase();
    const hora = String(e.hora ?? '').slice(0, 5);
    return `
      <div class="cal-detail-item">
        <div class="cal-detail-date"><div class="d">${dia}</div><div class="m">${mes}</div></div>
        <div class="cal-detail-body">
          <h5>${escapeHtmlAgenda(e.titulo)}</h5>
          <span>${escapeHtmlAgenda(e.lugar)} · ${hora} hs</span>
        </div>
      </div>`;
  }).join('');
}

function formatoFecha(anio, mes, dia){
  const pad = (n) => String(n).padStart(2, '0');
  return `${anio}-${pad(mes + 1)}-${pad(dia)}`;
}

// -----------------------------------------------------------------------
// Posicionamiento cuando la página está embebida en un <iframe>
//
// El <iframe> de WordPress usa scrolling="no" y se dimensiona exacto al
// contenido (ver postHeight más abajo) — el scroll real ocurre en la
// página de WordPress por fuera, no dentro de este documento. Por eso
// "position:fixed" acá adentro NO queda centrado respecto a lo que
// el usuario ve: se centra respecto al alto TOTAL del iframe (que puede
// ser miles de píxeles), no respecto al viewport visible real.
//
// Para resolverlo, el snippet de WordPress (público/snippets/wordpress-
// iframe-comunidad-melody.html) postea el rango verticalmente visible del
// iframe (en coordenadas propias del iframe) cada vez que la página
// externa scrollea o cambia de tamaño. Si nunca llega ese mensaje (ej.
// vista standalone, o snippet viejo sin actualizar), se usa el fallback
// normal de position:fixed, que ya funciona bien solo.
// -----------------------------------------------------------------------
const enIframe = window.self !== window.top;
let ultimoRangoVisible = null; // { top, height } en píxeles, coordenadas del documento de ESTA página

if (enIframe) {
  window.addEventListener('message', (event) => {
    const data = event.data;
    if (data && data.tipo === 'melody-visible-range') {
      ultimoRangoVisible = { top: data.top, height: data.height };
      if (calendarModal.classList.contains('open')) posicionarModalEnIframe();
    }
  });
}

function posicionarModalEnIframe(){
  if (!enIframe || !ultimoRangoVisible) return;
  const { top, height } = ultimoRangoVisible;
  // El overlay pasa de fixed (cubre todo el documento) a absolute,
  // acotado a la franja que el usuario realmente ve dentro del iframe.
  // Importante: la clase CSS fija "inset:0" (top/right/bottom/left en un
  // solo shorthand) — hay que pisar top/left/right/bottom uno por uno,
  // NUNCA reasignar el shorthand "inset" después, porque eso resetea de
  // nuevo los cuatro lados a su valor y tira abajo el top/left/right que
  // se acaba de fijar (bug real encontrado en la verificación con
  // Playwright: el "top" quedaba en "auto" en vez del valor posteado).
  calendarModal.style.position = 'absolute';
  calendarModal.style.top = `${top}px`;
  calendarModal.style.bottom = 'auto';
  calendarModal.style.height = `${height}px`;
  calendarModal.style.left = '0';
  calendarModal.style.right = '0';
}

function restaurarPosicionModal(){
  calendarModal.style.position = '';
  calendarModal.style.top = '';
  calendarModal.style.bottom = '';
  calendarModal.style.height = '';
  calendarModal.style.left = '';
  calendarModal.style.right = '';
}

function abrirCalendarModal(e){
  if (e) e.preventDefault();
  scrollYGuardado = window.scrollY;
  calAnio = hoy.getFullYear();
  calMes = hoy.getMonth();
  calDiaSeleccionado = null;
  renderCalendario();
  if (enIframe) posicionarModalEnIframe();
  calendarModal.classList.add('open');
  document.documentElement.style.overflow = 'hidden';
  document.body.style.overflow = 'hidden';
}
function cerrarCalendarModal(){
  calendarModal.classList.remove('open');
  restaurarPosicionModal();
  document.documentElement.style.overflow = '';
  document.body.style.overflow = '';
  window.scrollTo(0, scrollYGuardado);
}

document.getElementById('verTodaLaAgendaBtn')?.addEventListener('click', abrirCalendarModal);
document.getElementById('verCalendarioCompletoLink')?.addEventListener('click', abrirCalendarModal);
document.getElementById('calendarCloseBtn').addEventListener('click', cerrarCalendarModal);
document.getElementById('calPrevBtn').addEventListener('click', () => {
  calMes--; if (calMes < 0){ calMes = 11; calAnio--; }
  renderCalendario();
});
document.getElementById('calNextBtn').addEventListener('click', () => {
  calMes++; if (calMes > 11){ calMes = 0; calAnio++; }
  renderCalendario();
});
calendarModal.addEventListener('click', (e) => {
  if (e.target === calendarModal) cerrarCalendarModal();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && calendarModal.classList.contains('open')) cerrarCalendarModal();
});

// Auto-resize para embeber esta página en un <iframe> (ej. WordPress/
// Elementor): postea la altura real del contenido al parent. Se vuelve a
// ejecutar en load, cuando cambia el tamaño del body (ResizeObserver cubre
// el fetch de la agenda y cualquier módulo futuro sin depender de un
// callback puntual por sección) y explícitamente al terminar el fetch de
// arriba (por si el ResizeObserver todavía no se disparó).
function postHeight(){
  window.parent.postMessage({ tipo: 'melody-agenda-resize', height: document.body.scrollHeight }, '*');
}
window.addEventListener('load', postHeight);
if (typeof ResizeObserver !== 'undefined'){
  new ResizeObserver(postHeight).observe(document.body);
}
