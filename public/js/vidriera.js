const CATEGORIAS = [
  { clave: 'fotografia_video', nombre: 'Fotografía y video' },
  { clave: 'vestuario_arreglos', nombre: 'Vestuario y arreglos' },
  { clave: 'instrumentos', nombre: 'Instrumentos y accesorios' },
  { clave: 'servicios_eventos', nombre: 'Servicios para eventos' },
  { clave: 'general', nombre: 'General' },
];

const MESES_ABREV = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
const MESES_LARGO = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

function categoriaNombre(clave) {
  return CATEGORIAS.find((c) => c.clave === clave)?.nombre ?? clave;
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function formatHora(fechaISO) {
  const d = new Date(fechaISO);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())} hs`;
}

function formatFechaLarga(fechaISO) {
  const d = new Date(fechaISO);
  return `${d.getDate()} de ${MESES_LARGO[d.getMonth()]} de ${d.getFullYear()}`;
}

function formatFechaCorta(fechaISO) {
  const d = new Date(fechaISO);
  return `${d.getDate()} de ${MESES_LARGO[d.getMonth()]}`;
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// "Negrita simple" (Etapa D, panel admin "Textos de la página"): convención
// mínima tipo markdown, **así**, que el admin aplica a una selección dentro
// del textarea de edición. Nunca se guarda HTML — siempre se escapa primero
// y recién después se reemplazan los ** por <strong>, así el contenido en sí
// no puede inyectar markup.
function renderNegritaHtml(contenido) {
  return escapeHtml(contenido).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

// ---------------------------------------------------------------------------
// Auth (solo para autenticar familias antes de reaccionar a un evento o
// enviar su emprendimiento; la lectura pública de la vidriera no requiere
// sesión). Sistema de "código de acceso": la familia solo escribe el código
// que le dio la academia (sin email visible) — el backend
// (POST /api/auth/familia-login) resuelve a qué cuenta técnica corresponde
// y arma la sesión real contra Supabase Auth. El email técnico nunca llega
// al frontend.
// ---------------------------------------------------------------------------
const AUTH_STORAGE_KEY = 'mm_auth_session';

function loadStoredSession() {
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

let session = loadStoredSession();

async function signIn(codigo) {
  const res = await fetch('/api/auth/familia-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ codigo }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Código inválido');

  session = {
    access_token: data.access_token,
    expires_at: Math.floor(Date.now() / 1000) + data.expires_in,
    nombre_familia: data.nombre_familia,
  };
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
  return session;
}

function signOut() {
  session = null;
  misReaccionesCache = [];
  localStorage.removeItem(AUTH_STORAGE_KEY);
  updateAvatar();
}

function updateAvatar() {
  const avatarBtn = document.getElementById('avatarBtn');
  if (session) {
    const nombre = session.nombre_familia ?? 'Familia';
    avatarBtn.textContent = nombre.slice(0, 2).toUpperCase();
    avatarBtn.title = `Sesión iniciada: ${nombre} (click para salir)`;
  } else {
    avatarBtn.textContent = '?';
    avatarBtn.title = 'Iniciar sesión';
  }
}

document.getElementById('avatarBtn').addEventListener('click', () => {
  if (session) {
    if (confirm('¿Cerrar sesión?')) signOut();
  } else {
    openLoginModal();
  }
});

// ---------------------------------------------------------------------------
// Login modal
// ---------------------------------------------------------------------------
const loginBackdrop = document.getElementById('loginBackdrop');
const loginForm = document.getElementById('loginForm');
const loginError = document.getElementById('loginError');
let pendingAfterLogin = null;

function openLoginModal(afterLogin) {
  pendingAfterLogin = afterLogin ?? null;
  loginError.hidden = true;
  loginForm.reset();
  loginBackdrop.hidden = false;
}

function closeLoginModal() {
  loginBackdrop.hidden = true;
  pendingAfterLogin = null;
}

document.getElementById('loginCancel').addEventListener('click', closeLoginModal);
loginBackdrop.addEventListener('click', (e) => {
  if (e.target === loginBackdrop) closeLoginModal();
});

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const formData = new FormData(loginForm);
  loginError.hidden = true;

  try {
    await signIn(formData.get('codigo'));
  } catch (err) {
    loginError.textContent = 'No pudimos iniciar sesión: ' + err.message;
    loginError.hidden = false;
    return;
  }
  const afterLogin = pendingAfterLogin;
  updateAvatar();
  closeLoginModal();
  if (afterLogin) {
    afterLogin();
  } else {
    // Login disparado desde el avatar, no desde un click de reacción: igual
    // hay que refrescar el estado real de "mis reacciones" y re-pintar los
    // botones (si no, quedarían todos en "inactivo" hasta recargar la página).
    await loadMisReacciones();
    await Promise.all([loadEventosProximos(), loadMomentos()]);
  }
});

// ---------------------------------------------------------------------------
// Toast
// ---------------------------------------------------------------------------
let toastTimer = null;
function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 3000);
}

// ---------------------------------------------------------------------------
// Envío de emprendimiento (Etapa G) — formulario real conectado a
// POST /api/publicaciones. Requiere sesión de familia; si no hay una activa,
// encadena el login por código (mismo mecanismo que ya usan las reacciones,
// `openLoginModal(afterLogin)`) y recién después abre este formulario.
// `familia` no es un campo del formulario: se toma de `session.nombre_familia`
// (ya conocido desde el login por código), no tiene sentido pedírselo de
// nuevo a la familia.
// ---------------------------------------------------------------------------
const submitBackdrop = document.getElementById('submitBackdrop');
const submitForm = document.getElementById('submitForm');
const submitError = document.getElementById('submitError');
let submitLogoUrl = null;
let submitImagenUrl = null;

document.getElementById('submitCategoria').innerHTML =
  CATEGORIAS.map((c) => `<option value="${c.clave}">${escapeHtml(c.nombre)}</option>`).join('');

function openSubmitModal() {
  if (!session) {
    openLoginModal(() => openSubmitModal());
    return;
  }
  submitForm.reset();
  submitError.hidden = true;
  submitLogoUrl = null;
  submitImagenUrl = null;
  document.getElementById('submitLogoPreview').hidden = true;
  document.getElementById('submitPortadaPreview').hidden = true;
  submitBackdrop.hidden = false;
}

function closeSubmitModal() {
  submitBackdrop.hidden = true;
}

document.getElementById('sumarEmprendimientoBtn').addEventListener('click', () => openSubmitModal());
document.getElementById('submitCancel').addEventListener('click', closeSubmitModal);
submitBackdrop.addEventListener('click', (e) => { if (e.target === submitBackdrop) closeSubmitModal(); });

async function subirArchivo(file, tipo) {
  const form = new FormData();
  form.append('imagen', file);
  form.append('tipo', tipo);
  const headers = {};
  if (session) headers.Authorization = `Bearer ${session.access_token}`;
  const res = await fetch('/api/uploads/imagen', { method: 'POST', headers, body: form });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'No se pudo subir la imagen');
  return data.imagen_url;
}

document.getElementById('submitLogoInput').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    submitLogoUrl = await subirArchivo(file, 'logo');
    const preview = document.getElementById('submitLogoPreview');
    preview.style.backgroundImage = `url('${submitLogoUrl}')`;
    preview.hidden = false;
  } catch (err) {
    submitError.textContent = err.message;
    submitError.hidden = false;
    e.target.value = '';
  }
});

document.getElementById('submitPortadaInput').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    submitImagenUrl = await subirArchivo(file, 'portada');
    const preview = document.getElementById('submitPortadaPreview');
    preview.style.backgroundImage = `url('${submitImagenUrl}')`;
    preview.hidden = false;
  } catch (err) {
    submitError.textContent = err.message;
    submitError.hidden = false;
    e.target.value = '';
  }
});

submitForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  submitError.hidden = true;

  if (!submitLogoUrl) {
    submitError.textContent = 'El logo es obligatorio.';
    submitError.hidden = false;
    return;
  }

  const formData = new FormData(submitForm);
  const saveBtn = document.getElementById('submitSaveBtn');
  saveBtn.disabled = true;

  const { ok, data } = await apiPost('/api/publicaciones', {
    nombre: formData.get('nombre'),
    familia: session.nombre_familia,
    categoria: formData.get('categoria'),
    descripcion: formData.get('descripcion'),
    whatsapp: formData.get('whatsapp'),
    logo_url: submitLogoUrl,
    imagen_url: submitImagenUrl,
    sitio_web: formData.get('sitio_web'),
    instagram: formData.get('instagram'),
    direccion: formData.get('direccion'),
  });

  saveBtn.disabled = false;

  if (!ok) {
    submitError.textContent = data.error ?? 'No se pudo enviar el emprendimiento.';
    submitError.hidden = false;
    return;
  }

  closeSubmitModal();
  showToast('¡Listo! Tu emprendimiento quedó en revisión del admin.');
});

// ---------------------------------------------------------------------------
// "Mis envíos" (Etapa G) — conecta GET /api/publicaciones/mias/listado (ya
// existía en el backend, pero no tenía ninguna interfaz visible) a un modal
// con el estado de cada publicación enviada por la familia logueada.
// ---------------------------------------------------------------------------
const ESTADO_LABELS = { pending: 'En revisión', approved: 'Publicado', rejected: 'Rechazado' };
const misEnviosBackdrop = document.getElementById('misEnviosBackdrop');

function openMisEnviosModal() {
  if (!session) {
    openLoginModal(() => openMisEnviosModal());
    return;
  }
  misEnviosBackdrop.hidden = false;
  loadMisEnvios();
}

function closeMisEnviosModal() {
  misEnviosBackdrop.hidden = true;
}

document.getElementById('misEnviosBtn').addEventListener('click', () => openMisEnviosModal());
document.getElementById('misEnviosCloseBtn').addEventListener('click', closeMisEnviosModal);
misEnviosBackdrop.addEventListener('click', (e) => { if (e.target === misEnviosBackdrop) closeMisEnviosModal(); });

function envioRowHtml(p) {
  return `
    <div class="mm-envio-row">
      <div>
        <div class="mm-envio-name">${escapeHtml(p.nombre)}</div>
        <div class="mm-envio-meta">${escapeHtml(categoriaNombre(p.categoria))}${p.estado === 'rejected' && p.motivo_rechazo ? ' · ' + escapeHtml(p.motivo_rechazo) : ''}</div>
      </div>
      <div class="mm-envio-status">
        ${p.edicion_pendiente ? '<span class="mm-status-pill pending">Cambios en revisión</span>' : ''}
        <span class="mm-status-pill ${p.estado}">${escapeHtml(ESTADO_LABELS[p.estado] ?? p.estado)}</span>
      </div>
    </div>`;
}

async function loadMisEnvios() {
  const wrap = document.getElementById('misEnviosList');
  wrap.innerHTML = '<p class="mm-empty">Cargando…</p>';
  try {
    const envios = await apiGet('/api/publicaciones/mias/listado');
    wrap.innerHTML = envios.length === 0
      ? '<p class="mm-empty">Todavía no enviaste ningún emprendimiento.</p>'
      : envios.map(envioRowHtml).join('');
  } catch (err) {
    console.error(err);
    wrap.innerHTML = '<p class="mm-empty">No pudimos cargar tus envíos.</p>';
  }
}

// ---------------------------------------------------------------------------
// Estado de error por sección — a diferencia de "sin datos" (mm-empty), esto
// es para cuando la carga en sí falló (backend caído, red, etc.): un mensaje
// que no se puede confundir con "no hay nada cargado todavía" y un botón para
// reintentar esa sección puntual, sin tener que recargar toda la página.
// ---------------------------------------------------------------------------
function renderErrorState(containerId, mensaje, onRetry) {
  const el = document.getElementById(containerId);
  el.innerHTML = `
    <div class="mm-error-state">
      <p class="mm-error-text">${escapeHtml(mensaje)}</p>
      <button type="button" class="mm-btn-outline mm-retry-btn">Reintentar</button>
    </div>`;
  el.querySelector('.mm-retry-btn').addEventListener('click', onRetry);
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------
async function apiGet(path) {
  const headers = {};
  if (session) headers.Authorization = `Bearer ${session.access_token}`;
  const res = await fetch(path, { headers });
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}`);
  return res.json();
}

async function apiPost(path, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (session) headers.Authorization = `Bearer ${session.access_token}`;
  const res = await fetch(path, { method: 'POST', headers, body: JSON.stringify(body ?? {}) });
  return { ok: res.ok, status: res.status, data: res.ok ? await res.json() : await res.json().catch(() => ({})) };
}

// ---------------------------------------------------------------------------
// Business card (usado en la vidriera y como preview de sponsors)
// ---------------------------------------------------------------------------
function bizLogoHtml(pub) {
  // Separado de la portada (imagen_url): opcional, no todas las publicaciones
  // lo tienen cargado — string vacío si no hay logo, así no cambia nada del
  // resto de la tarjeta.
  if (!pub.logo_url) return '';
  return `<div class="mm-biz-logo" style="background-image:url('${escapeHtml(pub.logo_url)}')"></div>`;
}

function bizImgHtml(pub) {
  if (pub.imagen_url) {
    return `<div class="mm-biz-img" style="background-image:url('${escapeHtml(pub.imagen_url)}')">${bizLogoHtml(pub)}</div>`;
  }
  return `<div class="mm-biz-img"><span class="mm-biz-img-caption">sin imagen</span>${bizLogoHtml(pub)}</div>`;
}

// sitio_web/instagram admiten que la familia haya cargado solo el handle
// ("@usuario") o una URL completa — se normalizan acá para armar un link
// usable en ambos casos.
function normalizarUrl(valor) {
  if (!valor) return null;
  return /^https?:\/\//i.test(valor) ? valor : `https://${valor}`;
}

function instagramUrl(valor) {
  if (!valor) return null;
  if (/^https?:\/\//i.test(valor)) return valor;
  return `https://instagram.com/${valor.replace(/^@/, '')}`;
}

// Íconos discretos junto al botón de WhatsApp — solo se agregan si el dato
// existe, así que una publicación sin sitio/instagram no cambia en nada el
// footer de las demás.
function bizLinksHtml(pub) {
  const links = [];
  if (pub.sitio_web) {
    links.push(`<a class="mm-biz-link-icon" href="${escapeHtml(normalizarUrl(pub.sitio_web))}" target="_blank" rel="noopener" title="Sitio web">🌐</a>`);
  }
  if (pub.instagram) {
    links.push(`<a class="mm-biz-link-icon" href="${escapeHtml(instagramUrl(pub.instagram))}" target="_blank" rel="noopener" title="Instagram">📷</a>`);
  }
  return links.join('');
}

function businessCardHtml(pub) {
  return `
    <div class="mm-biz-card">
      ${bizImgHtml(pub)}
      <div class="mm-biz-body">
        <span class="mm-biz-tag">${escapeHtml(categoriaNombre(pub.categoria))}</span>
        <div class="mm-biz-name">${escapeHtml(pub.nombre)}</div>
        <div class="mm-biz-desc">${escapeHtml(pub.descripcion ?? '')}</div>
        ${pub.direccion ? `<div class="mm-biz-direccion">📍 ${escapeHtml(pub.direccion)}</div>` : ''}
        <div class="mm-biz-footer">
          <span class="mm-biz-family">${escapeHtml(pub.familia ?? '')}</span>
          <div class="mm-biz-actions">
            ${bizLinksHtml(pub)}
            ${pub.whatsapp
              ? `<a class="mm-whatsapp-btn" href="https://wa.me/${escapeHtml(pub.whatsapp)}" target="_blank" rel="noopener" data-pub-id="${pub.id}">WhatsApp</a>`
              : ''}
          </div>
        </div>
      </div>
    </div>`;
}

// ---------------------------------------------------------------------------
// Vidriera (grid principal + filtro de categorías)
// ---------------------------------------------------------------------------
let allPublicaciones = [];
let activeCategoria = 'Todos';

function renderCategoryPills() {
  const wrap = document.getElementById('categoryPills');
  const opciones = [{ clave: 'Todos', nombre: 'Todos' }, ...CATEGORIAS];
  wrap.innerHTML = opciones.map((c) => `
    <button type="button" class="mm-pill ${c.clave === activeCategoria ? 'active' : ''}" data-cat="${c.clave}">
      ${escapeHtml(c.nombre)}
    </button>`).join('');

  wrap.querySelectorAll('.mm-pill').forEach((btn) => {
    btn.addEventListener('click', () => {
      activeCategoria = btn.dataset.cat;
      renderCategoryPills();
      renderBusinessGrid();
    });
  });
}

function renderBusinessGrid() {
  const grid = document.getElementById('businessGrid');
  const filtered = activeCategoria === 'Todos'
    ? allPublicaciones
    : allPublicaciones.filter((p) => p.categoria === activeCategoria);

  if (filtered.length === 0) {
    const scope = activeCategoria === 'Todos' ? '' : ' en esta categoría';
    grid.innerHTML = `<p class="mm-empty">Todavía no hay publicaciones${scope}.</p>`;
    return;
  }

  grid.innerHTML = filtered.map(businessCardHtml).join('');

  grid.querySelectorAll('.mm-whatsapp-btn').forEach((a) => {
    a.addEventListener('click', () => {
      fetch(`/api/publicaciones/${a.dataset.pubId}/vista`, { method: 'POST' }).catch(() => {});
    });
  });
}

async function loadPublicaciones() {
  try {
    allPublicaciones = await apiGet('/api/publicaciones');
    renderCategoryPills();
    renderBusinessGrid();
  } catch (err) {
    console.error(err);
    renderCategoryPills();
    renderErrorState('businessGrid', 'No pudimos cargar las publicaciones.', loadPublicaciones);
  }
}

// ---------------------------------------------------------------------------
// Destacado de la semana + sponsors
// ---------------------------------------------------------------------------
async function loadDestacado() {
  const destacadoWrap = document.getElementById('destacadoWrap');
  const sponsorsWrap = document.getElementById('sponsors');

  let data;
  try {
    data = await apiGet('/api/publicaciones/destacado');
  } catch (err) {
    // Sección decorativa, no protagonista: si falla, se comporta igual que
    // "no hay evento destacado" (se oculta) en vez de mostrar un error que el
    // usuario no puede accionar. Se loguea para poder diagnosticarlo igual.
    console.error(err);
    destacadoWrap.hidden = true;
    sponsorsWrap.hidden = true;
    return;
  }

  const link = document.getElementById('destacadoLink');

  // Anulación puntual del admin (Etapa C): destaca UNA publicación puntual,
  // sin contexto de evento — no hay sponsors que mostrar debajo.
  if (data.tipo === 'override') {
    const pub = data.publicacion;
    destacadoWrap.hidden = false;
    document.getElementById('destacadoText').textContent = `Esta semana destacamos a ${pub.nombre}.`;
    if (pub.whatsapp) {
      link.href = `https://wa.me/${encodeURIComponent(pub.whatsapp)}`;
      link.target = '_blank';
      link.textContent = `Ver a ${pub.nombre} →`;
      link.style.display = '';
    } else {
      link.style.display = 'none';
    }
    sponsorsWrap.hidden = true;
    return;
  }

  if (data.tipo !== 'automatico' || !data.evento) {
    destacadoWrap.hidden = true;
    sponsorsWrap.hidden = true;
    return;
  }

  const { evento, destacadas } = data;

  destacadoWrap.hidden = false;
  document.getElementById('destacadoText').textContent =
    `Esta semana destacamos a los sponsors de "${evento.nombre}" (${formatFechaCorta(evento.fecha)}).`;
  link.href = '#sponsors';
  link.removeAttribute('target');
  link.textContent = 'Ver sponsors →';
  link.style.display = destacadas.length > 0 ? '' : 'none';

  if (destacadas.length === 0) {
    sponsorsWrap.hidden = true;
    return;
  }

  sponsorsWrap.hidden = false;
  document.getElementById('sponsorsLabel').textContent = `Sponsors de ${evento.nombre}`;
  document.getElementById('sponsorsRow').innerHTML = destacadas.map((sp) => `
    <div class="mm-sponsor-card">
      <div class="mm-thumb" ${sp.imagen_url ? `style="background-image:url('${escapeHtml(sp.imagen_url)}')"` : ''}></div>
      <div>
        <div class="mm-sponsor-label">Sponsor oficial</div>
        <div class="mm-sponsor-name">${escapeHtml(sp.nombre)}</div>
      </div>
    </div>`).join('');
}

// ---------------------------------------------------------------------------
// Reacciones (requieren sesión)
//
// misReaccionesCache guarda la verdad del servidor (GET /api/eventos/mias/reacciones)
// para saber, ANTES de mandar un toggle, si el usuario ya había reaccionado en otra
// sesión/dispositivo. Sin esto, un click en un botón que se veía "inactivo" solo
// porque todavía no sabíamos su estado real (ej. recién logueado) podía terminar
// des-reaccionando por accidente en vez de reaccionar.
// ---------------------------------------------------------------------------
let misReaccionesCache = [];

async function loadMisReacciones() {
  if (!session) {
    misReaccionesCache = [];
    return;
  }
  try {
    misReaccionesCache = await apiGet('/api/eventos/mias/reacciones');
  } catch (err) {
    // No debe bloquear el resto de la página: si falla, los botones de
    // reacción arrancan en "inactivo" (degradación aceptable) en vez de
    // tumbar la carga de toda la vidriera, que no depende de esto.
    console.error(err);
    misReaccionesCache = [];
  }
}

function isReactionActive(eventoId, tipo) {
  return misReaccionesCache.some((r) => r.evento_id === eventoId && r.tipo === tipo);
}

async function toggleReaccion(eventoId, tipo, btn, onResult) {
  const desiredActive = !isReactionActive(eventoId, tipo);

  if (!session) {
    openLoginModal(async () => {
      await loadMisReacciones();
      if (isReactionActive(eventoId, tipo) === desiredActive) {
        // El servidor ya tenía el estado que el click pedía (reaccionó desde otro
        // dispositivo/sesión) — solo sincronizamos la UI, sin mandar otro toggle.
        onResult(desiredActive, false);
        return;
      }
      await performToggle(eventoId, tipo, btn, onResult);
    });
    return;
  }

  await performToggle(eventoId, tipo, btn, onResult);
}

async function performToggle(eventoId, tipo, btn, onResult) {
  btn.disabled = true;
  const { ok, status, data } = await apiPost(`/api/eventos/${eventoId}/reaccion`, { tipo });
  btn.disabled = false;
  if (status === 401) {
    signOut();
    openLoginModal(() => toggleReaccion(eventoId, tipo, btn, onResult));
    return;
  }
  if (!ok) {
    showToast(data.error ?? 'No se pudo registrar la reacción.');
    return;
  }
  if (data.activa) {
    misReaccionesCache.push({ evento_id: eventoId, tipo });
  } else {
    misReaccionesCache = misReaccionesCache.filter((r) => !(r.evento_id === eventoId && r.tipo === tipo));
  }
  onResult(data.activa, true);
}

// ---------------------------------------------------------------------------
// Calendario de eventos (próximos)
// ---------------------------------------------------------------------------
function eventCardHtml(ev) {
  const activo = isReactionActive(ev.id, 'voy_a_asistir');
  const count = ev.stats.reacciones.voy_a_asistir;
  return `
    <div class="mm-event-card">
      <div class="mm-event-date">
        <span class="mm-event-day">${new Date(ev.fecha).getDate()}</span>
        <span class="mm-event-month">${MESES_ABREV[new Date(ev.fecha).getMonth()]}</span>
      </div>
      <div class="mm-event-title">${escapeHtml(ev.nombre)}</div>
      <div class="mm-event-subtitle">${formatHora(ev.fecha)}${ev.lugar ? ' · ' + escapeHtml(ev.lugar) : ''}</div>
      <button type="button" class="mm-reaction-btn ${activo ? 'active' : ''}" data-evento-id="${ev.id}">
        Voy a asistir · ${count}
      </button>
      <div class="mm-qr"><img src="/api/eventos/${ev.id}/qr" alt="QR para compartir ${escapeHtml(ev.nombre)}" loading="lazy"></div>
    </div>`;
}

async function loadEventosProximos() {
  const row = document.getElementById('eventsRow');
  let eventos;
  try {
    eventos = await apiGet('/api/eventos?soloFuturos=true');
  } catch (err) {
    console.error(err);
    renderErrorState('eventsRow', 'No pudimos cargar el calendario de eventos.', loadEventosProximos);
    return;
  }

  if (eventos.length === 0) {
    row.innerHTML = '<p class="mm-empty">No hay próximos eventos cargados todavía.</p>';
    return;
  }

  row.innerHTML = eventos.map(eventCardHtml).join('');
  row.querySelectorAll('.mm-reaction-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.eventoId;
      toggleReaccion(id, 'voy_a_asistir', btn, (activa, serverChanged) => {
        const ev = eventos.find((e) => e.id === id);
        if (serverChanged) ev.stats.reacciones.voy_a_asistir += activa ? 1 : -1;
        btn.classList.toggle('active', activa);
        btn.textContent = `Voy a asistir · ${ev.stats.reacciones.voy_a_asistir}`;
      });
    });
  });
}

// ---------------------------------------------------------------------------
// Momentos que ya vivimos (eventos pasados) + galería + testimonios
// ---------------------------------------------------------------------------
function pastEventCardHtml(ev) {
  const activo = isReactionActive(ev.id, 'nos_encanto');
  const count = ev.stats.reacciones.nos_encanto;
  return `
    <div class="mm-past-event-card">
      <div>
        <div class="mm-past-event-title">${escapeHtml(ev.nombre)}</div>
        <div class="mm-past-event-date">${formatFechaLarga(ev.fecha)}</div>
      </div>
      <button type="button" class="mm-reaction-btn ${activo ? 'active' : ''}" data-evento-id="${ev.id}">
        Nos encantó · ${count}
      </button>
    </div>`;
}

async function loadMomentos() {
  let eventos;
  try {
    eventos = await apiGet('/api/eventos');
  } catch (err) {
    console.error(err);
    renderErrorState('pastEventsRow', 'No pudimos cargar los eventos pasados.', loadMomentos);
    renderErrorState('galleryGrid', 'No pudimos cargar la galería.', loadMomentos);
    renderErrorState('testimonialsGrid', 'No pudimos cargar los testimonios.', loadMomentos);
    return;
  }

  const pasados = eventos
    .filter((e) => e.es_pasado)
    .sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

  const pastRow = document.getElementById('pastEventsRow');
  if (pasados.length === 0) {
    pastRow.innerHTML = '<p class="mm-empty">Todavía no hay eventos pasados para mostrar.</p>';
  } else {
    const destacar = pasados.slice(0, 4);
    pastRow.innerHTML = destacar.map(pastEventCardHtml).join('');
    pastRow.querySelectorAll('.mm-reaction-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.eventoId;
        toggleReaccion(id, 'nos_encanto', btn, (activa, serverChanged) => {
          const ev = pasados.find((e) => e.id === id);
          if (serverChanged) ev.stats.reacciones.nos_encanto += activa ? 1 : -1;
          btn.classList.toggle('active', activa);
          btn.textContent = `Nos encantó · ${ev.stats.reacciones.nos_encanto}`;
        });
      });
    });
  }

  const recientes = pasados.slice(0, 3);
  let galerias, testimonios;
  try {
    [galerias, testimonios] = await Promise.all([
      Promise.all(recientes.map((e) => apiGet(`/api/eventos/${e.id}/galeria`))),
      Promise.all(recientes.map((e) => apiGet(`/api/eventos/${e.id}/testimonios`))),
    ]);
  } catch (err) {
    console.error(err);
    renderErrorState('galleryGrid', 'No pudimos cargar la galería.', loadMomentos);
    renderErrorState('testimonialsGrid', 'No pudimos cargar los testimonios.', loadMomentos);
    return;
  }

  const galleryGrid = document.getElementById('galleryGrid');
  const fotos = galerias.flat().slice(0, 8);
  galleryGrid.innerHTML = fotos.length === 0
    ? '<p class="mm-empty">Todavía no hay fotos cargadas.</p>'
    : fotos.map((f) => `
        <div class="mm-gallery-item" ${f.imagen_url ? `style="background-image:url('${escapeHtml(f.imagen_url)}')"` : ''}></div>
      `).join('');

  const testimonialsGrid = document.getElementById('testimonialsGrid');
  const quotes = [];
  testimonios.forEach((lista, idx) => {
    lista.forEach((t) => quotes.push({ ...t, eventoNombre: recientes[idx].nombre }));
  });
  testimonialsGrid.innerHTML = quotes.length === 0
    ? '<p class="mm-empty">Todavía no hay testimonios cargados.</p>'
    : quotes.slice(0, 6).map((t) => `
        <div class="mm-testimonial-card">
          <div class="mm-testimonial-quote">"${escapeHtml(t.texto)}"</div>
          <div class="mm-testimonial-meta">— ${escapeHtml(t.familia)} · ${escapeHtml(t.eventoNombre)}</div>
        </div>`).join('');
}

// ---------------------------------------------------------------------------
// Textos fijos editables (Etapa D)
// ---------------------------------------------------------------------------
async function loadTextos() {
  try {
    const textos = await apiGet('/api/textos');
    document.querySelectorAll('[data-texto-clave]').forEach((el) => {
      const t = textos[el.dataset.textoClave];
      if (t) el.innerHTML = renderNegritaHtml(t.contenido);
    });
  } catch (err) {
    // No es protagonista ni bloquea nada: si falla, quedan los textos
    // hardcodeados del HTML como default (son el mismo valor por defecto
    // que usaría el backend de todos modos).
    console.error(err);
  }
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------
async function main() {
  updateAvatar();
  await loadMisReacciones();
  await Promise.all([
    loadPublicaciones(),
    loadDestacado(),
    loadEventosProximos(),
    loadMomentos(),
    loadTextos(),
  ]);
}

main().catch((err) => {
  console.error(err);
  showToast('Ocurrió un error cargando la vidriera.');
});
