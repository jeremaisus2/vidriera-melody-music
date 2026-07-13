// ---------------------------------------------------------------------------
// Eventos · Melody Music — panel de gestión
// Reusa la MISMA clave de localStorage que public/js/admin.js
// (mm_admin_auth_session, mismo origen) — ver public/js/agenda-admin.js
// para el mismo criterio ya aplicado ahí.
// ---------------------------------------------------------------------------

const TIPO_LABELS = { concierto: 'Concierto', muestra: 'Muestra', examen: 'Examen' };

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function fechaLabel(fechaISO) {
  const d = new Date(fechaISO);
  const fecha = d.toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });
  const hora = d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  return `${fecha} · ${hora} hs`;
}

// datetime-local necesita "YYYY-MM-DDTHH:MM" en hora LOCAL, no UTC.
function fechaToDatetimeLocal(fechaISO) {
  const d = new Date(fechaISO);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ---------------------------------------------------------------------------
// Auth (idéntico mecanismo a admin.js / agenda-admin.js)
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

async function apiSend(method, path, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (session) headers.Authorization = `Bearer ${session.access_token}`;
  const res = await fetch(path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  const data = res.status === 204 ? {} : await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}
const apiPost   = (path, body) => apiSend('POST', path, body);
const apiPut    = (path, body) => apiSend('PUT', path, body);
const apiDelete = (path) => apiSend('DELETE', path);

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
  document.getElementById('evShell').hidden = true;
}

function showModuloInactivo() {
  document.getElementById('loginGate').hidden = true;
  document.getElementById('moduloInactivoGate').hidden = false;
  document.getElementById('evShell').hidden = true;
}

function showShell() {
  document.getElementById('loginGate').hidden = true;
  document.getElementById('moduloInactivoGate').hidden = true;
  document.getElementById('evShell').hidden = false;
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

  // Gate de página: si el módulo "eventos" no está activo para esta
  // academia en el catálogo real, no se muestra el panel aunque el
  // login/rol sean válidos. No reemplaza el control por rol de arriba.
  const modulos = await apiGet('/api/admin/modulos');
  const activo = modulos.ok && modulos.data.some((m) => m.clave === 'eventos' && m.activo);
  if (!activo) {
    showModuloInactivo();
    return;
  }

  showShell();
  const avatarBtn = document.getElementById('avatarBtn');
  const email = session?.user?.email ?? '';
  avatarBtn.textContent = email.slice(0, 2).toUpperCase() || 'A';
  avatarBtn.title = `Sesión iniciada: ${email} (click para salir)`;
  renderEventos(data);
}

// ---------------------------------------------------------------------------
// Lista de eventos
// ---------------------------------------------------------------------------
let eventosById = new Map();

function renderEventos(lista) {
  eventosById = new Map(lista.map((e) => [e.id, e]));
  const wrap = document.getElementById('eventosList');

  if (lista.length === 0) {
    wrap.innerHTML = `
      <div class="ev-empty">
        <div class="ev-empty-icon">🎻</div>
        <h3>Todavía no hay eventos en el calendario</h3>
        <p>Sumá el primer concierto, muestra o examen — va a aparecer al instante en la vidriera pública con su propio botón de asistencia.</p>
        <button type="button" class="ev-btn-solid" id="emptyNewBtn">+ Sumar el primer evento</button>
      </div>`;
    document.getElementById('emptyNewBtn').addEventListener('click', () => openForm());
    return;
  }

  wrap.innerHTML = lista.map((e) => {
    const reacciones = e.stats?.reacciones ?? { voy_a_asistir: 0, nos_encanto: 0 };
    return `
      <div class="ev-card ${e.es_pasado ? 'ev-card-pasado' : ''}" data-id="${e.id}">
        <div class="ev-card-top">
          <div>
            <div class="ev-card-title-row">
              <h4>${escapeHtml(e.nombre)}</h4>
              <span class="ev-tipo-pill">${TIPO_LABELS[e.tipo] ?? e.tipo}</span>
              ${e.es_pasado ? '<span class="ev-pasado-pill">Pasado</span>' : ''}
            </div>
            <div class="ev-card-meta">${fechaLabel(e.fecha)}${e.lugar ? ` · ${escapeHtml(e.lugar)}` : ''}</div>
            ${e.descripcion ? `<div class="ev-card-desc">${escapeHtml(e.descripcion)}</div>` : ''}
          </div>
          <div class="ev-card-actions">
            <button type="button" class="ev-icon-btn" data-edit="${e.id}" title="Editar">✎</button>
            <button type="button" class="ev-icon-btn ev-icon-danger" data-delete="${e.id}" title="Eliminar">🗑</button>
          </div>
        </div>
        <div class="ev-stats-row">
          <span class="ev-stat-chip">✋ ${e.stats?.rsvp_confirmados ?? 0} confirmados</span>
          <span class="ev-stat-chip ev-stat-muted">👋 ${reacciones.voy_a_asistir} voy a asistir</span>
          <span class="ev-stat-chip ev-stat-muted">💚 ${reacciones.nos_encanto} nos encantó</span>
          <span class="ev-stat-chip ev-stat-muted"><a href="/sponsors-admin.html?evento_id=${e.id}">🤝 ${e.sponsors_count} sponsor${e.sponsors_count === 1 ? '' : 's'}</a></span>
          <span class="ev-stat-chip ev-stat-muted">🖼️ ${e.galeria_count} foto${e.galeria_count === 1 ? '' : 's'}</span>
        </div>
      </div>`;
  }).join('');

  wrap.querySelectorAll('[data-edit]').forEach((btn) => {
    btn.addEventListener('click', () => openForm(eventosById.get(btn.dataset.edit)));
  });
  wrap.querySelectorAll('[data-delete]').forEach((btn) => {
    btn.addEventListener('click', () => eliminarEvento(btn.dataset.delete));
  });
}

async function recargarEventos() {
  const { ok, data } = await apiGet('/api/admin/eventos');
  if (ok) renderEventos(data);
}

async function eliminarEvento(id) {
  const e = eventosById.get(id);
  if (!e) return;
  if (!confirm(`¿Eliminar "${e.nombre}"? Esta acción no se puede deshacer.`)) return;

  const { ok, data } = await apiDelete(`/api/admin/eventos/${id}`);
  if (!ok) {
    showToast(data.error ?? 'No se pudo eliminar el evento.');
    return;
  }
  showToast('Evento eliminado.');
  await recargarEventos();
}

// ---------------------------------------------------------------------------
// Panel lateral (alta/edición)
// ---------------------------------------------------------------------------
const overlay = document.getElementById('formOverlay');
const panel = document.getElementById('formPanel');
const eventoForm = document.getElementById('eventoForm');
const formError = document.getElementById('formError');

function openForm(evento = null) {
  eventoForm.reset();
  formError.hidden = true;
  document.getElementById('formId').value = evento?.id ?? '';
  document.getElementById('formNombre').value = evento?.nombre ?? '';
  document.getElementById('formTipo').value = evento?.tipo ?? 'concierto';
  document.getElementById('formFecha').value = evento ? fechaToDatetimeLocal(evento.fecha) : '';
  document.getElementById('formLugar').value = evento?.lugar ?? '';
  document.getElementById('formDescripcion').value = evento?.descripcion ?? '';
  document.getElementById('formTitle').textContent = evento ? 'Editar evento' : 'Nuevo evento';

  overlay.hidden = false;
  panel.hidden = false;
  requestAnimationFrame(() => {
    overlay.classList.add('ev-show');
    panel.classList.add('ev-show');
  });
}

function closeForm() {
  overlay.classList.remove('ev-show');
  panel.classList.remove('ev-show');
  setTimeout(() => {
    overlay.hidden = true;
    panel.hidden = true;
  }, 300);
}

document.getElementById('newEventoBtn').addEventListener('click', () => openForm());
document.getElementById('formCancelBtn').addEventListener('click', closeForm);
document.getElementById('formCloseBtn').addEventListener('click', closeForm);
overlay.addEventListener('click', closeForm);

eventoForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  formError.hidden = true;

  const id = document.getElementById('formId').value;
  const fechaLocal = document.getElementById('formFecha').value;
  const body = {
    nombre: document.getElementById('formNombre').value.trim(),
    tipo: document.getElementById('formTipo').value,
    fecha: fechaLocal ? new Date(fechaLocal).toISOString() : '',
    lugar: document.getElementById('formLugar').value.trim() || null,
    descripcion: document.getElementById('formDescripcion').value.trim() || null,
  };

  const saveBtn = document.getElementById('formSaveBtn');
  saveBtn.disabled = true;

  const { ok, data } = id
    ? await apiPut(`/api/admin/eventos/${id}`, body)
    : await apiPost('/api/admin/eventos', body);

  saveBtn.disabled = false;

  if (!ok) {
    formError.textContent = data.error ?? 'No se pudo guardar el evento.';
    formError.hidden = false;
    return;
  }

  closeForm();
  showToast(id ? 'Evento actualizado.' : 'Evento creado.');
  await recargarEventos();
});

// ---------------------------------------------------------------------------
// Arranque
// ---------------------------------------------------------------------------
if (session) {
  verifyAdminAndEnter();
} else {
  showLoginGate();
}
