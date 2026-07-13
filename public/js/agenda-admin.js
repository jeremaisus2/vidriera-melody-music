// ---------------------------------------------------------------------------
// Agenda · Melody Music — panel de gestión
// Reusa la MISMA clave de localStorage que public/js/admin.js
// (mm_admin_auth_session, mismo origen) para no pedir un segundo login si
// el admin ya inició sesión en /admin.html — y viceversa, si se loguea acá
// primero, /admin.html también queda logueado.
// ---------------------------------------------------------------------------

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function fechaParts(fechaStr) {
  const d = new Date(`${fechaStr}T00:00:00`);
  const dia = d.getDate();
  const mes = d.toLocaleDateString('es-AR', { month: 'short' }).replace('.', '').toUpperCase();
  return { dia, mes };
}

function horaLabel(horaStr) {
  return `${String(horaStr ?? '').slice(0, 5)} hs`;
}

// ---------------------------------------------------------------------------
// Auth (idéntico mecanismo a admin.js)
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
  document.getElementById('agShell').hidden = true;
}

function showModuloInactivo() {
  document.getElementById('loginGate').hidden = true;
  document.getElementById('moduloInactivoGate').hidden = false;
  document.getElementById('agShell').hidden = true;
}

function showShell() {
  document.getElementById('loginGate').hidden = true;
  document.getElementById('moduloInactivoGate').hidden = true;
  document.getElementById('agShell').hidden = false;
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
  const { ok, status, data } = await apiGet('/api/admin/agenda');
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

  // Gate de página: si el módulo "agenda" no está activo para esta academia
  // en el catálogo real (ver superadminRepo.getModulosAcademia), no se
  // muestra el panel aunque el login/rol sean válidos. No reemplaza el
  // control por rol de arriba, es una capa adicional.
  const modulos = await apiGet('/api/admin/modulos');
  const activo = modulos.ok && modulos.data.some((m) => m.clave === 'agenda' && m.activo);
  if (!activo) {
    showModuloInactivo();
    return;
  }

  showShell();
  const avatarBtn = document.getElementById('avatarBtn');
  const email = session?.user?.email ?? '';
  avatarBtn.textContent = email.slice(0, 2).toUpperCase() || 'A';
  avatarBtn.title = `Sesión iniciada: ${email} (click para salir)`;
  setEventos(data);
}

// ---------------------------------------------------------------------------
// Lista + drag & drop + undo/redo (mismo patrón que "Orden de la vidriera"
// en public/js/admin.js: deshacer/rehacer solo de esta sesión de navegador,
// no persiste a través de un F5)
// ---------------------------------------------------------------------------
let currentOrder = [];
let eventosById = new Map();
let undoStack = [];
let redoStack = [];
let guardando = false;

function setEventos(lista) {
  eventosById = new Map(lista.map((e) => [e.id, e]));
  currentOrder = lista.map((e) => e.id);
  undoStack = [];
  redoStack = [];
  renderList();
}

function renderList() {
  const wrap = document.getElementById('agendaList');

  if (currentOrder.length === 0) {
    wrap.innerHTML = `
      <div class="ag-empty">
        <div class="ag-empty-icon">🗓️</div>
        <h3>Todavía no hay nada en el calendario</h3>
        <p>Sumá el primer evento de la comunidad — un concierto, una clase abierta, un cumpleaños — y va a aparecer al instante en la landing pública.</p>
        <button type="button" class="ag-btn-solid" id="emptyNewBtn">+ Sumar el primer evento</button>
      </div>`;
    document.getElementById('emptyNewBtn').addEventListener('click', () => openForm());
    updateUndoRedoButtons();
    return;
  }

  wrap.innerHTML = currentOrder.map((id) => {
    const e = eventosById.get(id);
    if (!e) return '';
    const { dia, mes } = fechaParts(e.fecha);
    return `
      <div class="ag-row ${e.activo ? '' : 'ag-row-inactive'}" draggable="true" data-id="${e.id}">
        <span class="ag-handle" aria-hidden="true">⠿⠿</span>
        <div class="ag-date"><div class="d">${dia}</div><div class="m">${mes}</div></div>
        <div class="ag-row-body">
          <h4>${escapeHtml(e.titulo)}</h4>
          <span>${escapeHtml(e.lugar)}</span>
        </div>
        <div class="ag-time">${horaLabel(e.hora)}</div>
        <button type="button" class="ag-pill ${e.activo ? 'ag-pill-activo' : 'ag-pill-inactivo'}" data-toggle="${e.id}">
          ${e.activo ? 'Visible' : 'Oculto'}
        </button>
        <div class="ag-row-actions">
          <button type="button" class="ag-icon-btn" data-edit="${e.id}" title="Editar">✎</button>
          <button type="button" class="ag-icon-btn ag-icon-danger" data-delete="${e.id}" title="Eliminar">🗑</button>
        </div>
      </div>`;
  }).join('');

  attachDragHandlers();
  wrap.querySelectorAll('[data-toggle]').forEach((btn) => {
    btn.addEventListener('click', () => toggleActivo(btn.dataset.toggle));
  });
  wrap.querySelectorAll('[data-edit]').forEach((btn) => {
    btn.addEventListener('click', () => openForm(eventosById.get(btn.dataset.edit)));
  });
  wrap.querySelectorAll('[data-delete]').forEach((btn) => {
    btn.addEventListener('click', () => eliminarEvento(btn.dataset.delete));
  });
  updateUndoRedoButtons();
}

function updateUndoRedoButtons() {
  document.getElementById('undoBtn').disabled = undoStack.length === 0 || guardando;
  document.getElementById('redoBtn').disabled = redoStack.length === 0 || guardando;
}

function attachDragHandlers() {
  const wrap = document.getElementById('agendaList');
  wrap.querySelectorAll('.ag-row').forEach((row) => {
    row.addEventListener('dragstart', () => row.classList.add('dragging'));
    row.addEventListener('dragend', () => row.classList.remove('dragging'));
    row.addEventListener('dragover', (e) => {
      e.preventDefault();
      const dragging = wrap.querySelector('.dragging');
      if (!dragging || dragging === row) return;
      const rect = row.getBoundingClientRect();
      const antes = (e.clientY - rect.top) < rect.height / 2;
      wrap.insertBefore(dragging, antes ? row : row.nextSibling);
    });
    row.addEventListener('drop', (e) => {
      e.preventDefault();
      const nuevoOrden = Array.from(wrap.querySelectorAll('.ag-row')).map((r) => r.dataset.id);
      const cambio = nuevoOrden.length !== currentOrder.length || nuevoOrden.some((id, i) => id !== currentOrder[i]);
      if (cambio) applyNewOrder(nuevoOrden);
    });
  });
}

function applyNewOrder(nuevoOrden, { registrarHistoria = true } = {}) {
  if (registrarHistoria) {
    undoStack.push(currentOrder.slice());
    redoStack = [];
  }
  currentOrder = nuevoOrden.slice();
  renderList();
  saveOrder(currentOrder);
}

async function saveOrder(ids) {
  guardando = true;
  updateUndoRedoButtons();
  const { ok, data } = await apiPut('/api/admin/agenda/reorder', { orden: ids });
  guardando = false;
  updateUndoRedoButtons();
  if (!ok) showToast(data.error ?? 'No se pudo guardar el nuevo orden.');
}

document.getElementById('undoBtn').addEventListener('click', () => {
  if (undoStack.length === 0) return;
  redoStack.push(currentOrder.slice());
  currentOrder = undoStack.pop();
  renderList();
  saveOrder(currentOrder);
});

document.getElementById('redoBtn').addEventListener('click', () => {
  if (redoStack.length === 0) return;
  undoStack.push(currentOrder.slice());
  currentOrder = redoStack.pop();
  renderList();
  saveOrder(currentOrder);
});

// ---------------------------------------------------------------------------
// Toggle activo / eliminar
// ---------------------------------------------------------------------------
async function toggleActivo(id) {
  const e = eventosById.get(id);
  if (!e) return;
  const { ok, data } = await apiPut(`/api/admin/agenda/${id}`, { activo: !e.activo });
  if (!ok) {
    showToast(data.error ?? 'No se pudo actualizar el evento.');
    return;
  }
  eventosById.set(id, data);
  renderList();
}

async function eliminarEvento(id) {
  const e = eventosById.get(id);
  if (!e) return;
  if (!confirm(`¿Eliminar "${e.titulo}"? Esta acción no se puede deshacer.`)) return;

  const { ok, data } = await apiDelete(`/api/admin/agenda/${id}`);
  if (!ok) {
    showToast(data.error ?? 'No se pudo eliminar el evento.');
    return;
  }
  eventosById.delete(id);
  currentOrder = currentOrder.filter((x) => x !== id);
  undoStack = [];
  redoStack = [];
  renderList();
  showToast('Evento eliminado.');
}

// ---------------------------------------------------------------------------
// Panel lateral (alta/edición)
// ---------------------------------------------------------------------------
const overlay = document.getElementById('formOverlay');
const panel = document.getElementById('formPanel');
const eventoForm = document.getElementById('eventoForm');
const formError = document.getElementById('formError');
const formActivoField = document.getElementById('formActivoField');
const formActivoToggle = document.getElementById('formActivoToggle');

function openForm(evento = null) {
  eventoForm.reset();
  formError.hidden = true;
  document.getElementById('formId').value = evento?.id ?? '';
  document.getElementById('formTitulo').value = evento?.titulo ?? '';
  document.getElementById('formLugar').value = evento?.lugar ?? '';
  document.getElementById('formFecha').value = evento?.fecha ?? '';
  document.getElementById('formHora').value = evento ? String(evento.hora).slice(0, 5) : '';
  document.getElementById('formTitle').textContent = evento ? 'Editar evento' : 'Nuevo evento';

  formActivoField.hidden = !evento;
  const activo = evento ? evento.activo : true;
  formActivoToggle.setAttribute('aria-checked', String(activo));

  overlay.hidden = false;
  panel.hidden = false;
  requestAnimationFrame(() => {
    overlay.classList.add('ag-show');
    panel.classList.add('ag-show');
  });
}

function closeForm() {
  overlay.classList.remove('ag-show');
  panel.classList.remove('ag-show');
  setTimeout(() => {
    overlay.hidden = true;
    panel.hidden = true;
  }, 300);
}

formActivoToggle.addEventListener('click', () => {
  const activo = formActivoToggle.getAttribute('aria-checked') === 'true';
  formActivoToggle.setAttribute('aria-checked', String(!activo));
});

document.getElementById('newEventoBtn').addEventListener('click', () => openForm());
document.getElementById('formCancelBtn').addEventListener('click', closeForm);
document.getElementById('formCloseBtn').addEventListener('click', closeForm);
overlay.addEventListener('click', closeForm);

eventoForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  formError.hidden = true;

  const id = document.getElementById('formId').value;
  const body = {
    titulo: document.getElementById('formTitulo').value.trim(),
    lugar: document.getElementById('formLugar').value.trim(),
    fecha: document.getElementById('formFecha').value,
    hora: document.getElementById('formHora').value,
  };
  if (id) body.activo = formActivoToggle.getAttribute('aria-checked') === 'true';

  const saveBtn = document.getElementById('formSaveBtn');
  saveBtn.disabled = true;

  const { ok, data } = id
    ? await apiPut(`/api/admin/agenda/${id}`, body)
    : await apiPost('/api/admin/agenda', body);

  saveBtn.disabled = false;

  if (!ok) {
    formError.textContent = data.error ?? 'No se pudo guardar el evento.';
    formError.hidden = false;
    return;
  }

  eventosById.set(data.id, data);
  if (!currentOrder.includes(data.id)) currentOrder.push(data.id);
  renderList();
  closeForm();
  showToast(id ? 'Evento actualizado.' : 'Evento creado.');
});

// ---------------------------------------------------------------------------
// Arranque
// ---------------------------------------------------------------------------
if (session) {
  verifyAdminAndEnter();
} else {
  showLoginGate();
}
