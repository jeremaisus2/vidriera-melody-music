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

// "Negrita simple" (Etapa D): misma convención mínima que consume la
// vidriera pública, ver public/js/vidriera.js.
function renderNegritaHtml(contenido) {
  return escapeHtml(contenido).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

// Etiquetas legibles para el catálogo fijo de textos editables (Etapa D) —
// las claves en sí (vidriera_titulo, etc.) coinciden con
// src/repos/textos.repo.js, no se listan de nuevo acá, solo se les pone
// nombre para mostrar.
const TEXTO_LABELS = {
  destacado_label:    'Etiqueta del destacado de la semana',
  vidriera_titulo:    'Título de la vidriera',
  vidriera_subtitulo: 'Subtítulo de la vidriera',
  calendario_titulo:  'Título del calendario',
  momentos_titulo:    'Título de "Momentos que ya vivimos"',
  galeria_titulo:     'Título de la galería',
  testimonios_titulo: 'Título de testimonios',
};

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
  loadTextos();
  loadFamilias();
}

// ---------------------------------------------------------------------------
// Navegación (barra lateral) — reemplaza a las tabs horizontales.
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
document.getElementById('navTextosBtn').addEventListener('click', () => {
  setActiveSection('textos');
  loadTextos(); // sin estado de sesión que proteger acá, se puede refrescar tranquilo
});
document.getElementById('navFamiliasBtn').addEventListener('click', () => {
  setActiveSection('familias');
  loadFamilias();
});

function setActiveSection(section) {
  document.getElementById('navQueueBtn').classList.toggle('active', section === 'queue');
  document.getElementById('navStatsBtn').classList.toggle('active', section === 'stats');
  document.getElementById('navOrdenBtn').classList.toggle('active', section === 'orden');
  document.getElementById('navTextosBtn').classList.toggle('active', section === 'textos');
  document.getElementById('navFamiliasBtn').classList.toggle('active', section === 'familias');
  document.getElementById('tabQueue').hidden = section !== 'queue';
  document.getElementById('tabStats').hidden = section !== 'stats';
  document.getElementById('tabOrden').hidden = section !== 'orden';
  document.getElementById('tabTextos').hidden = section !== 'textos';
  document.getElementById('tabFamilias').hidden = section !== 'familias';
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
    pane.innerHTML = `
      <div class="mm-empty-rich">
        <div class="mm-empty-icon">✨</div>
        <h4>Todo al día</h4>
        <p>No hay publicaciones esperando revisión. En cuanto una familia envíe su emprendimiento, va a aparecer acá.</p>
      </div>`;
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
    wrap.innerHTML = `
      <div class="mm-empty-rich">
        <div class="mm-empty-icon">📈</div>
        <h4>Sin estadísticas todavía</h4>
        <p>En cuanto una publicación aprobada reciba su primera visita en la vidriera pública, va a aparecer acá con su conteo.</p>
      </div>`;
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
    wrap.innerHTML = `
      <div class="mm-empty-rich">
        <div class="mm-empty-icon">🗂️</div>
        <h4>Nada para ordenar todavía</h4>
        <p>Apenas apruebes la primera publicación desde la Cola de aprobación, va a aparecer acá para que la arrastres a su lugar.</p>
      </div>`;
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
// Textos de la página (Etapa D)
//
// "Negrita simple": el textarea de edición guarda **así** (markdown mínimo,
// no HTML) — togglear negrita envuelve/desenvuelve la selección con ** desde
// el botón de la barra de herramientas. Sin editor de texto enriquecido.
// A diferencia de "Orden de la vidriera", esta sección SÍ se refresca en
// cada visita (no hay historial de sesión que proteger acá).
// ---------------------------------------------------------------------------
let textos = [];

async function loadTextos() {
  const { ok, data } = await apiGet('/api/admin/textos');
  if (!ok) {
    document.getElementById('textosList').innerHTML = '<p class="mm-empty">No pudimos cargar los textos.</p>';
    return;
  }
  textos = data;
  renderTextosList();
}

function renderTextosList() {
  document.getElementById('textosList').innerHTML = textos.map((t) => textoRowHtml(t)).join('');
}

function textoRowHtml(t) {
  return `
    <div class="mm-texto-row" data-clave="${t.clave}">
      <div class="mm-texto-row-body">
        <div class="mm-texto-row-label">${escapeHtml(TEXTO_LABELS[t.clave] ?? t.clave)}</div>
        <div class="mm-texto-row-preview">${renderNegritaHtml(t.contenido)}</div>
      </div>
      <button type="button" class="mm-btn-outline mm-texto-edit-btn" data-clave="${t.clave}">Editar</button>
    </div>`;
}

function textoEditHtml(t) {
  return `
    <div class="mm-texto-row editing" data-clave="${t.clave}">
      <div class="mm-texto-row-label">${escapeHtml(TEXTO_LABELS[t.clave] ?? t.clave)}</div>
      <div class="mm-texto-edit-toolbar">
        <button type="button" class="mm-bold-btn" data-clave="${t.clave}" title="Negrita a la selección"><strong>N</strong></button>
      </div>
      <textarea class="mm-texto-textarea" data-clave="${t.clave}" rows="2">${escapeHtml(t.contenido)}</textarea>
      <div class="mm-texto-preview-label">Vista previa</div>
      <div class="mm-texto-preview" data-clave="${t.clave}">${renderNegritaHtml(t.contenido)}</div>
      <div class="mm-texto-edit-actions">
        <button type="button" class="mm-btn-outline mm-texto-cancel-btn" data-clave="${t.clave}">Cancelar</button>
        <button type="button" class="mm-btn-fill mm-texto-save-btn" data-clave="${t.clave}">Guardar</button>
      </div>
    </div>`;
}

function enterEditMode(clave) {
  const t = textos.find((x) => x.clave === clave);
  const row = document.querySelector(`.mm-texto-row[data-clave="${clave}"]`);
  row.outerHTML = textoEditHtml(t);
  document.querySelector(`.mm-texto-textarea[data-clave="${clave}"]`).focus();
}

function exitEditMode(clave) {
  const t = textos.find((x) => x.clave === clave);
  const row = document.querySelector(`.mm-texto-row[data-clave="${clave}"]`);
  row.outerHTML = textoRowHtml(t);
}

function toggleBoldSelection(textarea) {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  if (start === end) {
    showToast('Seleccioná el texto al que querés aplicar o quitar negrita.');
    return;
  }

  const value = textarea.value;
  const selected = value.slice(start, end);
  const yaEnNegrita = selected.startsWith('**') && selected.endsWith('**') && selected.length >= 4;

  let nuevoValue, nuevoStart, nuevoEnd;
  if (yaEnNegrita) {
    const sinMarcas = selected.slice(2, -2);
    nuevoValue = value.slice(0, start) + sinMarcas + value.slice(end);
    nuevoStart = start;
    nuevoEnd = start + sinMarcas.length;
  } else {
    nuevoValue = value.slice(0, start) + '**' + selected + '**' + value.slice(end);
    nuevoStart = start;
    nuevoEnd = end + 4;
  }

  textarea.value = nuevoValue;
  textarea.focus();
  textarea.setSelectionRange(nuevoStart, nuevoEnd);
  actualizarPreview(textarea);
}

function actualizarPreview(textarea) {
  const preview = document.querySelector(`.mm-texto-preview[data-clave="${textarea.dataset.clave}"]`);
  if (preview) preview.innerHTML = renderNegritaHtml(textarea.value);
}

async function saveTexto(clave) {
  const textarea = document.querySelector(`.mm-texto-textarea[data-clave="${clave}"]`);
  const nuevoContenido = textarea.value;
  if (!nuevoContenido.trim()) {
    showToast('El texto no puede quedar vacío.');
    return;
  }

  const saveBtn = document.querySelector(`.mm-texto-save-btn[data-clave="${clave}"]`);
  saveBtn.disabled = true;
  const { ok, data } = await apiPut(`/api/admin/textos/${encodeURIComponent(clave)}`, { contenido: nuevoContenido });
  if (saveBtn) saveBtn.disabled = false;

  if (!ok) {
    showToast(data.error ?? 'No se pudo guardar el texto.');
    return;
  }

  const idx = textos.findIndex((t) => t.clave === clave);
  textos[idx] = { ...textos[idx], contenido: data.contenido, negrita: data.negrita, personalizado: true, updated_at: data.updated_at };
  exitEditMode(clave);
  showToast('Texto guardado — ya se ve así en la vidriera pública.');
}

// Delegación de eventos en el contenedor: las filas se reemplazan con
// outerHTML al entrar/salir de edición, así que atar listeners fila por fila
// llevaría a listeners duplicados en las filas que no cambiaron. Con
// delegación alcanza con atar esto una sola vez.
document.getElementById('textosList').addEventListener('click', (e) => {
  const editBtn = e.target.closest('.mm-texto-edit-btn');
  if (editBtn) return enterEditMode(editBtn.dataset.clave);

  const cancelBtn = e.target.closest('.mm-texto-cancel-btn');
  if (cancelBtn) return exitEditMode(cancelBtn.dataset.clave);

  const saveBtn = e.target.closest('.mm-texto-save-btn');
  if (saveBtn) return saveTexto(saveBtn.dataset.clave);

  const boldBtn = e.target.closest('.mm-bold-btn');
  if (boldBtn) {
    const textarea = document.querySelector(`.mm-texto-textarea[data-clave="${boldBtn.dataset.clave}"]`);
    return toggleBoldSelection(textarea);
  }
});

document.getElementById('textosList').addEventListener('input', (e) => {
  if (e.target.classList.contains('mm-texto-textarea')) actualizarPreview(e.target);
});

// ---------------------------------------------------------------------------
// Familias — códigos de acceso
//
// Sistema de acceso simplificado: el admin le da a cada familia un nombre
// identificador + un código (ej. "gomezmelody"); por detrás, el backend crea
// una cuenta real de Supabase Auth con un email técnico invisible. La
// familia nunca ve ese email — solo usa el código en el frontend público.
// El código se muestra siempre en esta lista (no solo al crearlo) porque el
// admin necesita poder repetírselo a la familia si lo perdió.
// ---------------------------------------------------------------------------
let familias = [];
let familiaEnEdicion = null; // id de la familia en edición, o null si es alta

async function loadFamilias() {
  const { ok, data } = await apiGet('/api/admin/familias');
  const wrap = document.getElementById('familiasList');
  if (!ok) {
    wrap.innerHTML = '<p class="mm-empty">No se pudo cargar el listado de familias.</p>';
    return;
  }
  familias = data;
  renderFamilias();
}

function renderFamilias() {
  const wrap = document.getElementById('familiasList');
  if (familias.length === 0) {
    wrap.innerHTML = `
      <div class="mm-empty-rich">
        <div class="mm-empty-icon">👪</div>
        <h4>Ninguna familia dada de alta</h4>
        <p>Sumá la primera para que pueda enviar su emprendimiento y reaccionar a los eventos con un simple código, sin login tradicional.</p>
      </div>`;
    return;
  }

  wrap.innerHTML = familias.map((f) => `
    <div class="mm-familia-row" data-id="${f.id}">
      <div class="mm-familia-row-info">
        <div class="mm-familia-nombre">${escapeHtml(f.nombre_familia)}</div>
        <div class="mm-familia-codigo">Código: <code>${escapeHtml(f.codigo)}</code></div>
        <span class="mm-status-pill ${f.activo ? 'activo' : 'pausado'}">${f.activo ? 'Activo' : 'Dado de baja'}</span>
      </div>
      <div class="mm-familia-row-actions">
        <button type="button" class="mm-btn-outline mm-familia-edit-btn" data-id="${f.id}">Cambiar código</button>
        <button type="button" class="mm-btn-outline mm-familia-toggle-btn" data-id="${f.id}" data-activo="${f.activo}">${f.activo ? 'Dar de baja' : 'Reactivar'}</button>
      </div>
    </div>`).join('');

  wrap.querySelectorAll('.mm-familia-edit-btn').forEach((btn) => {
    btn.addEventListener('click', () => abrirFormularioFamilia(btn.dataset.id));
  });
  wrap.querySelectorAll('.mm-familia-toggle-btn').forEach((btn) => {
    btn.addEventListener('click', () => toggleEstadoFamilia(btn.dataset.id, btn.dataset.activo === 'true'));
  });
}

async function toggleEstadoFamilia(id, activoActual) {
  const nuevoValor = !activoActual;
  const { ok, data } = await apiPost(`/api/admin/familias/${id}/estado`, { activo: nuevoValor });
  if (!ok) {
    showToast(data.error ?? 'No se pudo actualizar el acceso de la familia.');
    return;
  }
  showToast(data.mensaje ?? 'Familia actualizada.');
  await loadFamilias();
}

// --- Formulario de alta/edición (mismo panel lateral para ambos casos) ---
const familiaOverlay = document.getElementById('familiaOverlay');
const familiaPanel = document.getElementById('familiaPanel');
const familiaFormError = document.getElementById('familiaFormError');

function abrirPanelFamilia() {
  familiaOverlay.hidden = false;
  familiaPanel.hidden = false;
  requestAnimationFrame(() => {
    familiaOverlay.classList.add('mm-show');
    familiaPanel.classList.add('mm-show');
  });
}

function abrirFormularioNuevaFamilia() {
  familiaEnEdicion = null;
  document.getElementById('familiaFormTitle').textContent = 'Nueva familia';
  document.getElementById('familiaFormIdOriginal').value = '';
  document.getElementById('familiaFormNombre').value = '';
  document.getElementById('familiaFormNombre').disabled = false;
  document.getElementById('familiaFormCodigo').value = '';
  familiaFormError.hidden = true;
  abrirPanelFamilia();
  document.getElementById('familiaFormNombre').focus();
}

function abrirFormularioFamilia(id) {
  const f = familias.find((x) => x.id === id);
  if (!f) return;
  familiaEnEdicion = id;
  document.getElementById('familiaFormTitle').textContent = 'Cambiar código';
  document.getElementById('familiaFormIdOriginal').value = id;
  document.getElementById('familiaFormNombre').value = f.nombre_familia;
  document.getElementById('familiaFormNombre').disabled = true; // esta pantalla solo permite cambiar el código
  document.getElementById('familiaFormCodigo').value = '';
  familiaFormError.hidden = true;
  abrirPanelFamilia();
  document.getElementById('familiaFormCodigo').focus();
}

function cerrarFormularioFamilia() {
  familiaOverlay.classList.remove('mm-show');
  familiaPanel.classList.remove('mm-show');
  setTimeout(() => {
    familiaOverlay.hidden = true;
    familiaPanel.hidden = true;
  }, 300);
  familiaEnEdicion = null;
}

document.getElementById('newFamiliaBtn').addEventListener('click', abrirFormularioNuevaFamilia);
document.getElementById('familiaFormCancelBtn').addEventListener('click', cerrarFormularioFamilia);
document.getElementById('familiaFormCloseBtn').addEventListener('click', cerrarFormularioFamilia);
familiaOverlay.addEventListener('click', cerrarFormularioFamilia);

document.getElementById('familiaFormSaveBtn').addEventListener('click', async () => {
  const codigo = document.getElementById('familiaFormCodigo').value.trim();
  const saveBtn = document.getElementById('familiaFormSaveBtn');

  familiaFormError.hidden = true;
  saveBtn.disabled = true;

  let ok, data;
  if (familiaEnEdicion) {
    ({ ok, data } = await apiPut(`/api/admin/familias/${familiaEnEdicion}`, { codigo }));
  } else {
    const nombre_familia = document.getElementById('familiaFormNombre').value.trim();
    ({ ok, data } = await apiPost('/api/admin/familias', { nombre_familia, codigo }));
  }

  saveBtn.disabled = false;

  if (!ok) {
    familiaFormError.textContent = data.error ?? 'No se pudo guardar la familia.';
    familiaFormError.hidden = false;
    return;
  }

  showToast(familiaEnEdicion ? 'Código actualizado.' : 'Familia creada — ya puede usar su código para ingresar.');
  cerrarFormularioFamilia();
  await loadFamilias();
});

// ---------------------------------------------------------------------------
// Crear publicación directa (Etapa G) — mismo formulario completo que el
// envío de una familia, pero se publica de inmediato (estado approved),
// sin pasar por la cola. A diferencia del formulario público, acá "familia"
// SÍ es un campo manual: no hay ninguna sesión de familia detrás de un alta
// hecha por el admin, así que no hay de dónde tomarlo automáticamente.
// ---------------------------------------------------------------------------
const crearPubOverlay = document.getElementById('crearPubOverlay');
const crearPubPanel = document.getElementById('crearPubPanel');
const crearPubForm = document.getElementById('crearPubForm');
const crearPubError = document.getElementById('crearPubError');
let crearPubLogoUrl = null;
let crearPubImagenUrl = null;

document.getElementById('crearPubCategoria').innerHTML =
  CATEGORIAS.map((c) => `<option value="${c.clave}">${escapeHtml(c.nombre)}</option>`).join('');

// Panel lateral deslizante (antes modal centrado): mismo patrón que
// public/js/agenda-admin.js — se saca [hidden] y recién en el frame
// siguiente se agrega la clase que dispara la transición CSS.
function abrirCrearPubModal() {
  crearPubForm.reset();
  crearPubError.hidden = true;
  crearPubLogoUrl = null;
  crearPubImagenUrl = null;
  document.getElementById('crearPubLogoPreview').hidden = true;
  document.getElementById('crearPubPortadaPreview').hidden = true;
  crearPubOverlay.hidden = false;
  crearPubPanel.hidden = false;
  requestAnimationFrame(() => {
    crearPubOverlay.classList.add('mm-show');
    crearPubPanel.classList.add('mm-show');
  });
}

function cerrarCrearPubModal() {
  crearPubOverlay.classList.remove('mm-show');
  crearPubPanel.classList.remove('mm-show');
  setTimeout(() => {
    crearPubOverlay.hidden = true;
    crearPubPanel.hidden = true;
  }, 300);
}

document.getElementById('crearPublicacionBtn').addEventListener('click', abrirCrearPubModal);
document.getElementById('crearPubCancelBtn').addEventListener('click', cerrarCrearPubModal);
document.getElementById('crearPubCloseBtn').addEventListener('click', cerrarCrearPubModal);
crearPubOverlay.addEventListener('click', cerrarCrearPubModal);

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

document.getElementById('crearPubLogoInput').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    crearPubLogoUrl = await subirArchivo(file, 'logo');
    const preview = document.getElementById('crearPubLogoPreview');
    preview.style.backgroundImage = `url('${crearPubLogoUrl}')`;
    preview.hidden = false;
  } catch (err) {
    crearPubError.textContent = err.message;
    crearPubError.hidden = false;
    e.target.value = '';
  }
});

document.getElementById('crearPubPortadaInput').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    crearPubImagenUrl = await subirArchivo(file, 'portada');
    const preview = document.getElementById('crearPubPortadaPreview');
    preview.style.backgroundImage = `url('${crearPubImagenUrl}')`;
    preview.hidden = false;
  } catch (err) {
    crearPubError.textContent = err.message;
    crearPubError.hidden = false;
    e.target.value = '';
  }
});

crearPubForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  crearPubError.hidden = true;

  if (!crearPubLogoUrl) {
    crearPubError.textContent = 'El logo es obligatorio.';
    crearPubError.hidden = false;
    return;
  }

  const formData = new FormData(crearPubForm);
  const saveBtn = document.getElementById('crearPubSaveBtn');
  saveBtn.disabled = true;

  const { ok, data } = await apiPost('/api/admin/publicaciones', {
    nombre: formData.get('nombre'),
    familia: formData.get('familia'),
    categoria: formData.get('categoria'),
    descripcion: formData.get('descripcion'),
    whatsapp: formData.get('whatsapp'),
    logo_url: crearPubLogoUrl,
    imagen_url: crearPubImagenUrl,
    sitio_web: formData.get('sitio_web'),
    instagram: formData.get('instagram'),
    direccion: formData.get('direccion'),
  });

  saveBtn.disabled = false;

  if (!ok) {
    crearPubError.textContent = data.error ?? 'No se pudo crear la publicación.';
    crearPubError.hidden = false;
    return;
  }

  cerrarCrearPubModal();
  showToast('Publicación creada y publicada de inmediato.');
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
