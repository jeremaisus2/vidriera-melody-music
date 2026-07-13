// ---------------------------------------------------------------------------
// Sponsors · Melody Music — panel de gestión
// Reusa la MISMA clave de localStorage que public/js/admin.js
// (mm_admin_auth_session, mismo origen) — ver public/js/agenda-admin.js
// para el mismo criterio ya aplicado ahí.
//
// No agrega ningún endpoint nuevo: reusa GET /api/admin/eventos, GET
// /api/eventos/:id/sponsors (público, ya existente) para saber quiénes son
// sponsors hoy, GET /api/admin/publicaciones?estado=approved para el
// universo de publicaciones elegibles, y PUT /api/admin/eventos/:id/sponsors
// para guardar.
// ---------------------------------------------------------------------------

const CATEGORIAS = [
  { clave: 'fotografia_video', nombre: 'Fotografía y video' },
  { clave: 'vestuario_arreglos', nombre: 'Vestuario y arreglos' },
  { clave: 'instrumentos', nombre: 'Instrumentos y accesorios' },
  { clave: 'servicios_eventos', nombre: 'Servicios para eventos' },
  { clave: 'general', nombre: 'General' },
];
function categoriaNombre(clave) {
  return CATEGORIAS.find((c) => c.clave === clave)?.nombre ?? clave;
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function fechaCorta(fechaISO) {
  return new Date(fechaISO).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ---------------------------------------------------------------------------
// Auth (idéntico mecanismo a admin.js / agenda-admin.js / eventos-admin.js)
// ---------------------------------------------------------------------------
const { supabaseUrl, supabaseAnonKey } = window.APP_CONFIG ?? {};
const AUTH_STORAGE_KEY = 'mm_admin_auth_session';

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

async function signIn(email, password) {
  const res = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: supabaseAnonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description ?? data.msg ?? 'Credenciales inválidas');

  session = {
    access_token: data.access_token,
    expires_at: Math.floor(Date.now() / 1000) + data.expires_in,
    user: data.user,
  };
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
  return session;
}

function signOut() {
  session = null;
  localStorage.removeItem(AUTH_STORAGE_KEY);
  showLoginGate();
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------
async function apiGet(path) {
  const headers = {};
  if (session) headers.Authorization = `Bearer ${session.access_token}`;
  const res = await fetch(path, { headers });
  return { ok: res.ok, status: res.status, data: await res.json().catch(() => ({})) };
}

async function apiPut(path, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (session) headers.Authorization = `Bearer ${session.access_token}`;
  const res = await fetch(path, { method: 'PUT', headers, body: JSON.stringify(body ?? {}) });
  return { ok: res.ok, status: res.status, data: await res.json().catch(() => ({})) };
}

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
// Gate / shell visibility
// ---------------------------------------------------------------------------
function showLoginGate() {
  document.getElementById('loginGate').hidden = false;
  document.getElementById('moduloInactivoGate').hidden = true;
  document.getElementById('spShell').hidden = true;
}

function showModuloInactivo() {
  document.getElementById('loginGate').hidden = true;
  document.getElementById('moduloInactivoGate').hidden = false;
  document.getElementById('spShell').hidden = true;
}

function showShell() {
  document.getElementById('loginGate').hidden = true;
  document.getElementById('moduloInactivoGate').hidden = true;
  document.getElementById('spShell').hidden = false;
}

document.getElementById('avatarBtn').addEventListener('click', () => {
  if (confirm('¿Cerrar sesión?')) signOut();
});

const loginForm = document.getElementById('loginForm');
const loginError = document.getElementById('loginError');

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError.hidden = true;
  const formData = new FormData(loginForm);

  try {
    await signIn(formData.get('email'), formData.get('password'));
  } catch (err) {
    loginError.textContent = 'No pudimos iniciar sesión: ' + err.message;
    loginError.hidden = false;
    return;
  }

  await verifyAdminAndEnter();
});

async function verifyAdminAndEnter() {
  const { ok, status, data } = await apiGet('/api/admin/eventos');
  if (status === 403) {
    loginError.textContent = data.error ?? 'Esta cuenta no tiene permisos de administrador.';
    loginError.hidden = false;
    session = null;
    localStorage.removeItem(AUTH_STORAGE_KEY);
    return;
  }
  if (!ok) {
    loginError.textContent = 'No pudimos verificar la cuenta. Intentá de nuevo.';
    loginError.hidden = false;
    return;
  }

  // Gate de página: si el módulo "sponsors" no está activo para esta
  // academia en el catálogo real, no se muestra el panel aunque el
  // login/rol sean válidos. No reemplaza el control por rol de arriba.
  const modulos = await apiGet('/api/admin/modulos');
  const activo = modulos.ok && modulos.data.some((m) => m.clave === 'sponsors' && m.activo);
  if (!activo) {
    showModuloInactivo();
    return;
  }

  showShell();
  const avatarBtn = document.getElementById('avatarBtn');
  const email = session?.user?.email ?? '';
  avatarBtn.textContent = email.slice(0, 2).toUpperCase() || 'A';
  avatarBtn.title = `Sesión iniciada: ${email} (click para salir)`;
  renderEventosList(data);

  // Si se llegó desde "Eventos" con ?evento_id=..., seleccionarlo de entrada.
  const params = new URLSearchParams(window.location.search);
  const eventoId = params.get('evento_id');
  if (eventoId && eventosById.has(eventoId)) {
    seleccionarEvento(eventoId);
  }
}

// ---------------------------------------------------------------------------
// Lista de eventos (columna izquierda)
// ---------------------------------------------------------------------------
let eventosById = new Map();
let eventoActivoId = null;

function renderEventosList(lista) {
  eventosById = new Map(lista.map((e) => [e.id, e]));
  const wrap = document.getElementById('eventosList');

  if (lista.length === 0) {
    wrap.innerHTML = `<p style="font-size:12.5px;color:var(--muted);">Todavía no hay eventos cargados. Sumá uno primero desde <a href="/eventos-admin.html">Eventos</a>.</p>`;
    return;
  }

  wrap.innerHTML = lista.map((e) => `
    <button type="button" class="sp-event-item ${e.id === eventoActivoId ? 'sp-active' : ''}" data-id="${e.id}">
      <div class="sp-event-name">${escapeHtml(e.nombre)}</div>
      <div class="sp-event-date">${fechaCorta(e.fecha)}</div>
      <div class="sp-event-count">${e.sponsors_count} sponsor${e.sponsors_count === 1 ? '' : 's'}</div>
    </button>`).join('');

  wrap.querySelectorAll('.sp-event-item').forEach((btn) => {
    btn.addEventListener('click', () => seleccionarEvento(btn.dataset.id));
  });
}

async function seleccionarEvento(id) {
  eventoActivoId = id;
  document.querySelectorAll('.sp-event-item').forEach((btn) => {
    btn.classList.toggle('sp-active', btn.dataset.id === id);
  });
  await renderSponsorsPane(id);
}

// ---------------------------------------------------------------------------
// Panel de sponsors del evento seleccionado
// ---------------------------------------------------------------------------
async function renderSponsorsPane(eventoId) {
  const pane = document.getElementById('sponsorsPane');
  const evento = eventosById.get(eventoId);
  pane.innerHTML = `<p style="font-size:12.5px;color:var(--muted);">Cargando…</p>`;

  const [sponsorsRes, publicacionesRes] = await Promise.all([
    apiGet(`/api/eventos/${eventoId}/sponsors`),
    apiGet('/api/admin/publicaciones?estado=approved'),
  ]);

  if (!publicacionesRes.ok) {
    pane.innerHTML = `<p style="font-size:12.5px;color:var(--muted);">No pudimos cargar las publicaciones aprobadas.</p>`;
    return;
  }

  const publicaciones = publicacionesRes.data.publicaciones ?? [];
  const sponsorIds = new Set((sponsorsRes.data ?? []).map((p) => p.id));

  if (publicaciones.length === 0) {
    pane.innerHTML = `
      <div class="sp-empty">
        <div class="sp-empty-icon">📭</div>
        <h3>Sin publicaciones aprobadas todavía</h3>
        <p>Para elegir un sponsor primero necesitás al menos una publicación aprobada en la vidriera.</p>
      </div>`;
    return;
  }

  pane.innerHTML = `
    <div class="sp-panel">
      <div class="sp-panel-title">${escapeHtml(evento.nombre)}</div>
      <div class="sp-panel-sub">${fechaCorta(evento.fecha)}${evento.lugar ? ` · ${escapeHtml(evento.lugar)}` : ''} — marcá quiénes acompañan este evento</div>
      <div class="sp-checklist">
        ${publicaciones.map((p) => `
          <label class="sp-check-row">
            <input type="checkbox" value="${p.id}" ${sponsorIds.has(p.id) ? 'checked' : ''}>
            <div class="sp-check-thumb" ${p.imagen_url ? `style="background-image:url('${escapeHtml(p.imagen_url)}')"` : ''}></div>
            <div>
              <div class="sp-check-name">${escapeHtml(p.nombre)}</div>
              <div class="sp-check-cat">${escapeHtml(categoriaNombre(p.categoria))} · ${escapeHtml(p.familia)}</div>
            </div>
          </label>`).join('')}
      </div>
      <div class="sp-panel-actions">
        <button type="button" class="sp-btn-solid" id="guardarSponsorsBtn">Guardar sponsors</button>
      </div>
    </div>`;

  document.getElementById('guardarSponsorsBtn').addEventListener('click', () => guardarSponsors(eventoId));
}

async function guardarSponsors(eventoId) {
  const ids = Array.from(document.querySelectorAll('.sp-check-row input:checked')).map((i) => i.value);
  const btn = document.getElementById('guardarSponsorsBtn');
  btn.disabled = true;

  const { ok, data } = await apiPut(`/api/admin/eventos/${eventoId}/sponsors`, { publicacion_ids: ids });
  btn.disabled = false;

  if (!ok) {
    showToast(data.error ?? 'No se pudieron guardar los sponsors.');
    return;
  }

  showToast(data.advertencia ? `Guardado, con avisos: ${data.advertencia}` : 'Sponsors actualizados.');

  const e = eventosById.get(eventoId);
  if (e) e.sponsors_count = data.sponsors.length;
  renderEventosList(Array.from(eventosById.values()));
  document.querySelectorAll('.sp-event-item').forEach((b) => b.classList.toggle('sp-active', b.dataset.id === eventoId));
}

// ---------------------------------------------------------------------------
// Arranque
// ---------------------------------------------------------------------------
if (session) {
  verifyAdminAndEnter();
} else {
  showLoginGate();
}
