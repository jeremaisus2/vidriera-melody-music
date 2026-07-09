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

function tiempoRelativo(fechaISO) {
  const diffMs = Date.now() - new Date(fechaISO).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return 'recién';
  if (min < 60) return `hace ${min} minuto${min === 1 ? '' : 's'}`;
  const horas = Math.floor(min / 60);
  if (horas < 24) return `hace ${horas} hora${horas === 1 ? '' : 's'}`;
  const dias = Math.floor(horas / 24);
  return `hace ${dias} día${dias === 1 ? '' : 's'}`;
}

const CAMBIO_LABELS = {
  nombre: 'Nombre', familia: 'Familia', categoria: 'Categoría',
  descripcion: 'Descripción', imagen_url: 'Imagen', whatsapp: 'WhatsApp',
};

function formatCambios(cambios) {
  return Object.entries(cambios)
    .map(([clave, valor]) => {
      const label = CAMBIO_LABELS[clave] ?? clave;
      if (clave === 'categoria') return `${label}: ${categoriaNombre(valor)}`;
      if (clave === 'imagen_url') return `${label} actualizada`;
      return `${label}: ${valor}`;
    })
    .join(' · ');
}

// ---------------------------------------------------------------------------
// Auth — mismo mecanismo liviano que la vidriera (fetch directo a Supabase
// Auth), pero con su propia clave de localStorage para no pisar una sesión
// de familia abierta en otra pestaña del mismo navegador, y exige rol admin.
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

async function apiPost(path, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (session) headers.Authorization = `Bearer ${session.access_token}`;
  const res = await fetch(path, { method: 'POST', headers, body: JSON.stringify(body ?? {}) });
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
  document.getElementById('adminShell').hidden = true;
}

function showAdminShell() {
  document.getElementById('loginGate').hidden = true;
  document.getElementById('adminShell').hidden = false;
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
  const { ok, status, data } = await apiGet('/api/admin/moderacion');
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
  showAdminShell();
  const avatarBtn = document.getElementById('avatarBtn');
  const email = session?.user?.email ?? '';
  avatarBtn.textContent = email.slice(0, 2).toUpperCase() || 'A';
  avatarBtn.title = `Sesión iniciada: ${email} (click para salir)`;
  document.getElementById('userEmailLabel').textContent = email;
  renderQueue(data);
  loadStats();
  loadOrden();
}

// ---------------------------------------------------------------------------
// Navegación (barra lateral) — reemplaza a las tabs horizontales. Preparada
// para sumar más secciones (Textos de la página) sin tocar este patrón:
// agregar un botón más y un case más en setActiveSection.
// ---------------------------------------------------------------------------
document.getElementById('navQueueBtn').addEventListener('click', () => setActiveSection('queue'));
document.getElementById('navStatsBtn').addEventListener('click', () => {
  setActiveSection('stats');
  loadStats(); // re-fetch en cada visita: recién aprobado no debería quedar afuera hasta recargar la página
});
document.getElementById('navOrdenBtn').addEventListener('click', () => {
  setActiveSection('orden');
  // A diferencia de stats, NO se re-fetchea acá: el orden/deshacer-rehacer
  // vive en memoria durante toda la sesión de navegador (pedido explícito),
  // así que re-cargar en cada visita a la sección lo destruiría.
});

function setActiveSection(section) {
  document.getElementById('navQueueBtn').classList.toggle('active', section === 'queue');
  document.getElementById('navStatsBtn').classList.toggle('active', section === 'stats');
  document.getElementById('navOrdenBtn').classList.toggle('active', section === 'orden');
  document.getElementById('tabQueue').hidden = section !== 'queue';
  document.getElementById('tabStats').hidden = section !== 'stats';
  document.getElementById('tabOrden').hidden = section !== 'orden';
}

// ---------------------------------------------------------------------------
// Cola de aprobación
// ---------------------------------------------------------------------------
let queueItems = [];
let selectedId = null;

function buildQueueItems({ publicaciones, ediciones }) {
  const dePublicacion = publicaciones.map((p) => ({
    kind: 'publicacion',
    id: p.id,
    nombre: p.nombre,
    familia: p.familia,
    categoria: p.categoria,
    descripcion: p.descripcion,
    imagen_url: p.imagen_url,
    created_at: p.created_at,
  }));

  const deEdicion = ediciones.map((e) => ({
    kind: 'edicion',
    id: e.id,
    nombre: e.cambios.nombre ?? e.publicacion.nombre,
    familia: e.cambios.familia ?? e.publicacion.familia,
    categoria: e.cambios.categoria ?? e.publicacion.categoria,
    descripcion: e.cambios.descripcion ?? e.publicacion.descripcion,
    imagen_url: e.cambios.imagen_url ?? e.publicacion.imagen_url,
    created_at: e.created_at,
    cambios: e.cambios,
  }));

  return [...dePublicacion, ...deEdicion].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

function renderQueue(coladata) {
  queueItems = buildQueueItems(coladata);
  document.getElementById('pendingCountLabel').textContent =
    `${queueItems.length} esperando revisión`;

  const rowsWrap = document.getElementById('queueRows');
  if (queueItems.length === 0) {
    rowsWrap.innerHTML = '';
    selectedId = null;
    renderPreview();
    return;
  }

  if (!selectedId || !queueItems.some((i) => i.id === selectedId)) {
    selectedId = queueItems[0].id;
  }

  rowsWrap.innerHTML = queueItems.map((item) => `
    <button type="button" class="mm-queue-row ${item.id === selectedId ? 'selected' : ''}" data-id="${item.id}">
      <div class="mm-thumb" ${item.imagen_url ? `style="background-image:url('${escapeHtml(item.imagen_url)}')"` : ''}></div>
      <div class="mm-queue-row-body">
        <div class="mm-queue-row-top">
          <span class="mm-queue-row-name">${escapeHtml(item.nombre)}</span>
          <span class="mm-status-pill ${item.kind === 'edicion' ? 'edicion' : 'nuevo'}">${item.kind === 'edicion' ? 'Edición' : 'Nuevo'}</span>
        </div>
        <div class="mm-queue-row-family">${escapeHtml(item.familia)} · ${tiempoRelativo(item.created_at)}</div>
      </div>
    </button>`).join('');

  rowsWrap.querySelectorAll('.mm-queue-row').forEach((btn) => {
    btn.addEventListener('click', () => {
      selectedId = btn.dataset.id;
      rowsWrap.querySelectorAll('.mm-queue-row').forEach((b) => b.classList.toggle('selected', b.dataset.id === selectedId));
      renderPreview();
    });
  });

  renderPreview();
}

function renderPreview() {
  const pane = document.getElementById('previewPane');
  const item = queueItems.find((i) => i.id === selectedId);

  if (!item) {
    pane.innerHTML = '<p class="mm-empty">No hay publicaciones pendientes de revisión.</p>';
    return;
  }

  const esEdicion = item.kind === 'edicion';

  pane.innerHTML = `
    <div class="mm-preview-inner">
      <div class="mm-preview-top">
        <div>
          <div class="mm-preview-eyebrow">Vista previa de la publicación</div>
          <div class="mm-h1 mm-preview-title">${escapeHtml(item.nombre)}</div>
        </div>
        <span class="mm-preview-badge ${esEdicion ? 'edicion' : 'nuevo'}">${esEdicion ? 'Edición de publicación' : 'Publicación nueva'}</span>
      </div>
      <div class="mm-preview-card">
        ${item.imagen_url
          ? `<div class="mm-biz-img" style="background-image:url('${escapeHtml(item.imagen_url)}')"></div>`
          : `<div class="mm-biz-img"><span class="mm-biz-img-caption">sin imagen</span></div>`}
        <div class="mm-preview-card-body">
          <span class="mm-biz-tag">${escapeHtml(categoriaNombre(item.categoria))}</span>
          <div class="mm-biz-name">${escapeHtml(item.nombre)}</div>
          <div class="mm-biz-desc">${escapeHtml(item.descripcion ?? '')}</div>
        </div>
      </div>
      ${esEdicion ? `<div class="mm-changes-box"><strong>Cambios enviados: </strong>${escapeHtml(formatCambios(item.cambios))}</div>` : ''}
      <div class="mm-meta-line">Enviado por ${escapeHtml(item.familia)} · ${tiempoRelativo(item.created_at)}</div>
      <div class="mm-preview-actions">
        <button type="button" class="mm-approve-btn" id="approveBtn">Aprobar y publicar</button>
        <button type="button" class="mm-reject-btn" id="rejectBtn">Rechazar</button>
      </div>
    </div>`;

  document.getElementById('approveBtn').addEventListener('click', () => moderar(item, 'aprobar'));
  document.getElementById('rejectBtn').addEventListener('click', () => moderar(item, 'rechazar'));
}

async function moderar(item, accion) {
  let motivo;
  if (accion === 'rechazar') {
    motivo = prompt('Motivo del rechazo (se le muestra a la familia):');
    if (motivo === null) return; // canceló el prompt
    if (!motivo.trim()) {
      showToast('El motivo de rechazo es obligatorio.');
      return;
    }
  }

  const base = item.kind === 'edicion' ? 'ediciones' : 'publicaciones';
  const path = `/api/admin/moderacion/${base}/${item.id}/${accion}`;
  const approveBtn = document.getElementById('approveBtn');
  const rejectBtn = document.getElementById('rejectBtn');
  approveBtn.disabled = true;
  rejectBtn.disabled = true;

  const { ok, data } = await apiPost(path, accion === 'rechazar' ? { motivo: motivo.trim() } : undefined);

  if (!ok) {
    showToast(data.error ?? 'No se pudo completar la acción.');
    approveBtn.disabled = false;
    rejectBtn.disabled = false;
    return;
  }

  showToast(accion === 'aprobar' ? 'Publicación aprobada y publicada.' : 'Publicación rechazada.');
  selectedId = null;
  const { data: fresh } = await apiGet('/api/admin/moderacion');
  renderQueue(fresh);
}

// ---------------------------------------------------------------------------
// Estadísticas de vistas
// ---------------------------------------------------------------------------
async function loadStats() {
  const { ok, data } = await apiGet('/api/admin/estadisticas/vistas?estado=approved');
  const wrap = document.getElementById('statsList');
  if (!ok) {
    wrap.innerHTML = '<p class="mm-empty">No se pudieron cargar las estadísticas.</p>';
    return;
  }

  const items = data.por_publicacion;
  if (items.length === 0) {
    wrap.innerHTML = '<p class="mm-empty">Todavía no hay publicaciones aprobadas con vistas.</p>';
    return;
  }

  const maxViews = Math.max(...items.map((i) => i.vistas), 1);
  wrap.innerHTML = items.map((i) => `
    <div class="mm-stats-row">
      <div class="mm-stats-row-top">
        <span class="mm-stats-name">${escapeHtml(i.nombre)}</span>
        <span class="mm-stats-views">${i.vistas} vista${i.vistas === 1 ? '' : 's'}</span>
      </div>
      <div class="mm-stats-track"><div class="mm-stats-fill" style="width:${(i.vistas / maxViews) * 100}%"></div></div>
    </div>`).join('');
}

// ---------------------------------------------------------------------------
// Orden de la vidriera + anulación puntual del destacado (Etapa C)
//
// El deshacer/rehacer es solo de esta sesión de navegador (pedido explícito:
// no hace falta que sobreviva a un F5) — currentOrder/undoStack/redoStack
// viven en memoria, se inicializan una sola vez en loadOrden() y no se
// vuelven a pisar hasta que se recargue la página.
// ---------------------------------------------------------------------------
let currentOrder = [];       // ids en el orden actual
let pinnedId = null;         // id fijado como destacado, o null
let publicacionesById = new Map();
let undoStack = [];          // snapshots de currentOrder anteriores
let redoStack = [];
let ordenGuardando = false;

async function loadOrden() {
  const { ok, data } = await apiGet('/api/admin/publicaciones?estado=approved');
  if (!ok) {
    document.getElementById('ordenList').innerHTML = '<p class="mm-empty">No pudimos cargar las publicaciones.</p>';
    return;
  }
  publicacionesById = new Map(data.publicaciones.map((p) => [p.id, p]));
  currentOrder = data.publicaciones.map((p) => p.id);
  pinnedId = data.destacado_override_id ?? null;
  undoStack = [];
  redoStack = [];
  renderOrdenList();
}

function renderOrdenList() {
  const wrap = document.getElementById('ordenList');

  if (currentOrder.length === 0) {
    wrap.innerHTML = '<p class="mm-empty">Todavía no hay publicaciones aprobadas para ordenar.</p>';
    renderOverrideBanner();
    updateUndoRedoButtons();
    return;
  }

  wrap.innerHTML = currentOrder.map((id) => {
    const p = publicacionesById.get(id);
    if (!p) return '';
    const pinned = id === pinnedId;
    return `
      <div class="mm-orden-row" draggable="true" data-id="${p.id}">
        <span class="mm-orden-handle" aria-hidden="true">⠿⠿</span>
        <div class="mm-thumb" ${p.imagen_url ? `style="background-image:url('${escapeHtml(p.imagen_url)}')"` : ''}></div>
        <div class="mm-orden-row-body">
          <div class="mm-orden-row-name">${escapeHtml(p.nombre)}</div>
          <div class="mm-orden-row-meta">${escapeHtml(categoriaNombre(p.categoria))} · ${escapeHtml(p.familia)}</div>
        </div>
        <button type="button" class="mm-pin-btn ${pinned ? 'active' : ''}" data-id="${p.id}">
          ${pinned ? '★ Destacado fijo' : '☆ Fijar como destacado'}
        </button>
      </div>`;
  }).join('');

  attachDragHandlers();
  wrap.querySelectorAll('.mm-pin-btn').forEach((btn) => {
    btn.addEventListener('click', () => togglePin(btn.dataset.id));
  });

  renderOverrideBanner();
  updateUndoRedoButtons();
}

function renderOverrideBanner() {
  const banner = document.getElementById('destacadoOverrideBanner');
  if (!pinnedId) {
    banner.hidden = true;
    return;
  }
  const p = publicacionesById.get(pinnedId);
  banner.hidden = false;
  document.getElementById('destacadoOverrideName').textContent = p?.nombre ?? '(publicación eliminada)';
}

function updateUndoRedoButtons() {
  document.getElementById('undoBtn').disabled = undoStack.length === 0 || ordenGuardando;
  document.getElementById('redoBtn').disabled = redoStack.length === 0 || ordenGuardando;
}

// --- Drag & drop (HTML5 nativo, sin librería) ---
function attachDragHandlers() {
  const wrap = document.getElementById('ordenList');
  wrap.querySelectorAll('.mm-orden-row').forEach((row) => {
    row.addEventListener('dragstart', () => {
      row.classList.add('dragging');
    });
    row.addEventListener('dragend', () => {
      row.classList.remove('dragging');
    });
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
      const nuevoOrden = Array.from(wrap.querySelectorAll('.mm-orden-row')).map((r) => r.dataset.id);
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
  renderOrdenList();
  saveOrder(currentOrder);
}

async function saveOrder(ids) {
  ordenGuardando = true;
  updateUndoRedoButtons();
  const { ok, data } = await apiPut('/api/admin/publicaciones/orden', { orden: ids });
  ordenGuardando = false;
  updateUndoRedoButtons();
  if (!ok) {
    showToast(data.error ?? 'No se pudo guardar el nuevo orden.');
  }
}

document.getElementById('undoBtn').addEventListener('click', () => {
  if (undoStack.length === 0) return;
  redoStack.push(currentOrder.slice());
  const anterior = undoStack.pop();
  currentOrder = anterior;
  renderOrdenList();
  saveOrder(currentOrder);
});

document.getElementById('redoBtn').addEventListener('click', () => {
  if (redoStack.length === 0) return;
  undoStack.push(currentOrder.slice());
  const siguiente = redoStack.pop();
  currentOrder = siguiente;
  renderOrdenList();
  saveOrder(currentOrder);
});

// --- Destacado fijo (anulación puntual de la rotación automática) ---
async function togglePin(id) {
  const nuevoPinnedId = pinnedId === id ? null : id;
  const { ok, data } = await apiPut('/api/admin/destacado-override', { publicacion_id: nuevoPinnedId });
  if (!ok) {
    showToast(data.error ?? 'No se pudo actualizar el destacado.');
    return;
  }
  pinnedId = nuevoPinnedId;
  renderOrdenList();
}

document.getElementById('clearOverrideBtn').addEventListener('click', async () => {
  const { ok, data } = await apiPut('/api/admin/destacado-override', { publicacion_id: null });
  if (!ok) {
    showToast(data.error ?? 'No se pudo quitar la anulación.');
    return;
  }
  pinnedId = null;
  renderOrdenList();
});

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------
if (session) {
  verifyAdminAndEnter().catch((err) => {
    console.error(err);
    showLoginGate();
  });
} else {
  showLoginGate();
}
