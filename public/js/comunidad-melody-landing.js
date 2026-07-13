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
// Modal helper genérico (scroll-lock + posicionamiento en iframe)
//
// Extraído de la lógica del calendario (sesión #27, ya probada con
// Playwright) para reusarla tal cual en cualquier modal nuevo — Muro de
// la comunidad la reusa más abajo sin duplicar ni un renglón de esto.
//
// El <iframe> de WordPress usa scrolling="no" y se dimensiona exacto al
// contenido (ver postHeight más abajo) — el scroll real ocurre en la
// página de WordPress por fuera, no dentro de este documento. Por eso
// "position:fixed" acá adentro NO queda centrado respecto a lo que el
// usuario ve: se centra respecto al alto TOTAL del iframe (que puede ser
// miles de píxeles), no respecto al viewport visible real.
//
// Para resolverlo, el snippet de WordPress (público/snippets/wordpress-
// iframe-comunidad-melody.html) postea el rango verticalmente visible del
// iframe (en coordenadas propias del iframe) cada vez que la página
// externa scrollea o cambia de tamaño. Si nunca llega ese mensaje (ej.
// vista standalone, o snippet viejo sin actualizar), se usa el fallback
// normal de position:fixed, que ya funciona bien solo.
//
// Solo un modal "genérico" puede estar abierto a la vez (todos son overlays
// de pantalla completa) — modalAbierto trackea cuál, para que Escape y el
// reposicionamiento en vivo por iframe sepan a cuál aplicarse.
// -----------------------------------------------------------------------
const enIframe = window.self !== window.top;
let ultimoRangoVisible = null; // { top, height } en píxeles, coordenadas del documento de ESTA página
let modalAbierto = null;       // referencia al elemento .xxx-modal actualmente abierto, o null
let scrollYGuardado = 0;

if (enIframe) {
  window.addEventListener('message', (event) => {
    const data = event.data;
    if (data && data.tipo === 'melody-visible-range') {
      ultimoRangoVisible = { top: data.top, height: data.height };
      if (modalAbierto) posicionarModalEnIframe(modalAbierto);
    }
  });
}

function posicionarModalEnIframe(modalEl){
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
  modalEl.style.position = 'absolute';
  modalEl.style.top = `${top}px`;
  modalEl.style.bottom = 'auto';
  modalEl.style.height = `${height}px`;
  modalEl.style.left = '0';
  modalEl.style.right = '0';
}

function restaurarPosicionModal(modalEl){
  modalEl.style.position = '';
  modalEl.style.top = '';
  modalEl.style.bottom = '';
  modalEl.style.height = '';
  modalEl.style.left = '';
  modalEl.style.right = '';
}

function abrirModal(modalEl){
  if (modalAbierto && modalAbierto !== modalEl) cerrarModal(modalAbierto);
  scrollYGuardado = window.scrollY;
  if (enIframe) posicionarModalEnIframe(modalEl);
  modalEl.classList.add('open');
  document.documentElement.style.overflow = 'hidden';
  document.body.style.overflow = 'hidden';
  modalAbierto = modalEl;
}

function cerrarModal(modalEl){
  modalEl.classList.remove('open');
  restaurarPosicionModal(modalEl);
  document.documentElement.style.overflow = '';
  document.body.style.overflow = '';
  window.scrollTo(0, scrollYGuardado);
  if (modalAbierto === modalEl) modalAbierto = null;
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && modalAbierto) cerrarModal(modalAbierto);
});

// --- Calendario completo (Agenda) ---
function abrirCalendarModal(e){
  if (e) e.preventDefault();
  calAnio = hoy.getFullYear();
  calMes = hoy.getMonth();
  calDiaSeleccionado = null;
  renderCalendario();
  abrirModal(calendarModal);
}
function cerrarCalendarModal(){
  cerrarModal(calendarModal);
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

// ---------------------------------------------------------------------
// Muro de la comunidad
//
// Auth de familia: EXACTO el mismo mecanismo que usaba public/js/
// vidriera.js (borrado en la sesión #25 junto con la vidriera pública
// vieja, pero el backend que consume — POST /api/auth/familia-login — no
// se tocó) — código de acceso, sesión guardada en localStorage bajo
// "mm_auth_session" con { access_token, expires_at, nombre_familia },
// reusada para llamadas futuras sin pedir el código de nuevo mientras no
// expire. Mismo patrón de encadenamiento openLoginModal(afterLogin): si
// falta sesión, se pide el código primero y recién después se continúa
// con la acción original (acá, abrir el formulario de publicación).
// ---------------------------------------------------------------------
const AUTH_STORAGE_KEY = 'mm_auth_session';

function loadStoredFamiliaSession() {
  try {
    const parsed = JSON.parse(localStorage.getItem(AUTH_STORAGE_KEY));
    if (!parsed?.access_token || !parsed?.expires_at) return null;
    if (Date.now() / 1000 > parsed.expires_at) {
      localStorage.removeItem(AUTH_STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

let familiaSession = loadStoredFamiliaSession();

async function familiaSignIn(codigo) {
  const res = await fetch('/api/auth/familia-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ codigo }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Código inválido');

  familiaSession = {
    access_token: data.access_token,
    expires_at: Math.floor(Date.now() / 1000) + data.expires_in,
    nombre_familia: data.nombre_familia,
  };
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(familiaSession));
  return familiaSession;
}

// --- Modal de login por código ---
const familiaLoginModal = document.getElementById('familiaLoginModal');
const familiaLoginForm = document.getElementById('familiaLoginForm');
const familiaLoginError = document.getElementById('familiaLoginError');
let pendingAfterFamiliaLogin = null;

function openFamiliaLoginModal(afterLogin) {
  pendingAfterFamiliaLogin = afterLogin ?? null;
  familiaLoginError.hidden = true;
  familiaLoginForm.reset();
  abrirModal(familiaLoginModal);
}
function closeFamiliaLoginModal() {
  cerrarModal(familiaLoginModal);
  pendingAfterFamiliaLogin = null;
}
document.getElementById('familiaLoginCancelBtn').addEventListener('click', closeFamiliaLoginModal);
document.getElementById('familiaLoginCloseBtn').addEventListener('click', closeFamiliaLoginModal);
familiaLoginModal.addEventListener('click', (e) => { if (e.target === familiaLoginModal) closeFamiliaLoginModal(); });

familiaLoginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  familiaLoginError.hidden = true;
  try {
    await familiaSignIn(document.getElementById('familiaLoginCodigo').value.trim());
  } catch (err) {
    familiaLoginError.textContent = 'No pudimos iniciar sesión: ' + err.message;
    familiaLoginError.hidden = false;
    return;
  }
  const afterLogin = pendingAfterFamiliaLogin;
  pendingAfterFamiliaLogin = null;
  cerrarModal(familiaLoginModal);
  if (afterLogin) afterLogin();
});

// --- Categorías del muro (cache compartido entre el panel chico, el
// formulario de publicación y el modal "ver muro completo") ---
let muroCategoriasCache = [];
let muroPostsCache = [];

function categoriaInfo(clave) {
  return muroCategoriasCache.find((c) => c.clave === clave) ?? { nombre: clave, color: '#EAEEE3' };
}

function tiempoRelativoMuro(fechaISO) {
  const diffMs = Date.now() - new Date(fechaISO).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return 'recién';
  if (min < 60) return `hace ${min} minuto${min === 1 ? '' : 's'}`;
  const horas = Math.floor(min / 60);
  if (horas < 24) return `hace ${horas} hora${horas === 1 ? '' : 's'}`;
  const dias = Math.floor(horas / 24);
  return `hace ${dias} día${dias === 1 ? '' : 's'}`;
}

function wallPostHtml(p) {
  const cat = categoriaInfo(p.categoria);
  return `
    <div class="wall-post">
      <span class="wall-tag" style="background:${escapeHtmlAgenda(cat.color ?? '#EAEEE3')};color:#2B2B24;">${escapeHtmlAgenda(cat.nombre).toUpperCase()}</span>
      <p>${escapeHtmlAgenda(p.contenido)}</p>
      <span class="wall-meta">${tiempoRelativoMuro(p.created_at)}</span>
    </div>`;
}

// Panel chico: primeros N posts aprobados (el fetch ya viene ordenado por
// fecha descendente desde el backend). Sin datos de comentarios/reacciones
// en el mockup original: no existen en el backend real, así que no se
// muestran (pedido explícito: no inventarlos).
const MURO_PANEL_LIMITE = 3;

(async function cargarMuro(){
  const wrap = document.getElementById('wallList');
  if (!wrap) return;

  try {
    const [categorias, posts] = await Promise.all([
      fetch('/api/muro/categorias').then((r) => { if (!r.ok) throw new Error('no ok'); return r.json(); }),
      fetch('/api/muro').then((r) => { if (!r.ok) throw new Error('no ok'); return r.json(); }),
    ]);
    muroCategoriasCache = Array.isArray(categorias) ? categorias : [];
    muroPostsCache = Array.isArray(posts) ? posts : [];

    if (muroPostsCache.length === 0) {
      wrap.innerHTML = '<p class="wall-empty">Todavía no hay publicaciones en el muro. ¡Sé el primero en escribir algo!</p>';
    } else {
      wrap.innerHTML = muroPostsCache.slice(0, MURO_PANEL_LIMITE).map(wallPostHtml).join('');
    }
  } catch {
    wrap.innerHTML = '<p class="wall-empty">No pudimos cargar el muro en este momento.</p>';
  } finally {
    postHeight();
  }
})();

// --- Solicitar publicación ---
const solicitarPublicacionModal = document.getElementById('solicitarPublicacionModal');
const solicitarForm = document.getElementById('solicitarForm');
const solicitarError = document.getElementById('solicitarError');
const solicitarConfirm = document.getElementById('solicitarConfirm');

function openSolicitarModal() {
  if (!familiaSession) {
    openFamiliaLoginModal(() => openSolicitarModal());
    return;
  }
  solicitarForm.reset();
  solicitarForm.hidden = false;
  solicitarConfirm.hidden = true;
  solicitarError.hidden = true;

  const select = document.getElementById('solicitarCategoria');
  select.innerHTML = muroCategoriasCache.map((c) => `<option value="${c.clave}">${escapeHtmlAgenda(c.nombre)}</option>`).join('');

  abrirModal(solicitarPublicacionModal);
}
function closeSolicitarModal() {
  cerrarModal(solicitarPublicacionModal);
}
document.getElementById('solicitarPublicacionBtn').addEventListener('click', openSolicitarModal);
document.getElementById('solicitarCancelBtn').addEventListener('click', closeSolicitarModal);
document.getElementById('solicitarCloseBtn').addEventListener('click', closeSolicitarModal);
document.getElementById('solicitarConfirmCloseBtn').addEventListener('click', closeSolicitarModal);
solicitarPublicacionModal.addEventListener('click', (e) => { if (e.target === solicitarPublicacionModal) closeSolicitarModal(); });

solicitarForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  solicitarError.hidden = true;

  const contenido = document.getElementById('solicitarContenido').value.trim();
  const categoria = document.getElementById('solicitarCategoria').value;
  const submitBtn = document.getElementById('solicitarSubmitBtn');
  submitBtn.disabled = true;

  try {
    const res = await fetch('/api/muro', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${familiaSession.access_token}` },
      body: JSON.stringify({ contenido, categoria }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? 'No se pudo enviar la publicación');

    solicitarForm.hidden = true;
    solicitarConfirm.hidden = false;
  } catch (err) {
    solicitarError.textContent = err.message;
    solicitarError.hidden = false;
  } finally {
    submitBtn.disabled = false;
  }
});

// --- Ver muro completo (todos los aprobados + filtro por categoría) ---
const muroCompletoModal = document.getElementById('muroCompletoModal');
let muroFiltroActivo = null; // clave de categoría, o null = todas

function openMuroCompletoModal() {
  muroFiltroActivo = null;
  renderMuroFiltro();
  renderMuroFullList();
  abrirModal(muroCompletoModal);
}
function closeMuroCompletoModal() {
  cerrarModal(muroCompletoModal);
}
document.getElementById('verMuroCompletoBtn').addEventListener('click', openMuroCompletoModal);
document.getElementById('muroCompletoCloseBtn').addEventListener('click', closeMuroCompletoModal);
muroCompletoModal.addEventListener('click', (e) => { if (e.target === muroCompletoModal) closeMuroCompletoModal(); });

function renderMuroFiltro() {
  const wrap = document.getElementById('muroFiltro');
  const pills = [{ clave: null, nombre: 'Todas' }, ...muroCategoriasCache];
  wrap.innerHTML = pills.map((c) => `
    <button type="button" class="wall-filtro-pill ${muroFiltroActivo === c.clave ? 'active' : ''}" data-clave="${c.clave ?? ''}">${escapeHtmlAgenda(c.nombre)}</button>`).join('');
  wrap.querySelectorAll('.wall-filtro-pill').forEach((btn) => {
    btn.addEventListener('click', () => {
      muroFiltroActivo = btn.dataset.clave || null;
      renderMuroFiltro();
      renderMuroFullList();
    });
  });
}

function renderMuroFullList() {
  const wrap = document.getElementById('muroFullList');
  const visibles = muroFiltroActivo ? muroPostsCache.filter((p) => p.categoria === muroFiltroActivo) : muroPostsCache;
  if (visibles.length === 0) {
    wrap.innerHTML = '<p class="wall-empty">Todavía no hay publicaciones en esta categoría.</p>';
    return;
  }
  wrap.innerHTML = visibles.map(wallPostHtml).join('');
}

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
