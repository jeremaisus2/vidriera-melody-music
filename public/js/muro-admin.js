// ---------------------------------------------------------------------------
// Muro · Melody Music — panel de gestión
// Reusa la MISMA clave de localStorage que public/js/admin.js
// (mm_admin_auth_session, mismo origen) — ver public/js/agenda-admin.js
// para el mismo criterio ya aplicado ahí.
// ---------------------------------------------------------------------------

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

function textoClaro(hex) {
  // Contraste simple: si el fondo es oscuro, texto claro; si es claro, texto oscuro.
  // Los colores de este catálogo son siempre tintes pastel claros, pero se calcula
  // igual por si algún día se carga un color oscuro desde el panel.
  if (!hex || !/^#[0-9a-fA-F]{6}$/.test(hex)) return '#2B2B24';
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  const luminancia = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminancia > 0.6 ? '#2B2B24' : '#FBF9F3';
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
const apiPost = (path, body) => apiSend('POST', path, body);
const apiPut  = (path, body) => apiSend('PUT', path, body);

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
  document.getElementById('muShell').hidden = true;
}
function showModuloInactivo() {
  document.getElementById('loginGate').hidden = true;
  document.getElementById('moduloInactivoGate').hidden = false;
  document.getElementById('muShell').hidden = true;
}
function showShell() {
  document.getElementById('loginGate').hidden = true;
  document.getElementById('moduloInactivoGate').hidden = true;
  document.getElementById('muShell').hidden = false;
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
  const { ok, status, data } = await apiGet('/api/admin/muro');
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

  // Gate de página: si el módulo "muro" no está activo para esta academia
  // en el catálogo real, no se muestra el panel aunque el login/rol sean
  // válidos. No reemplaza el control por rol de arriba.
  const modulos = await apiGet('/api/admin/modulos');
  const activo = modulos.ok && modulos.data.some((m) => m.clave === 'muro' && m.activo);
  if (!activo) {
    showModuloInactivo();
    return;
  }

  showShell();
  const avatarBtn = document.getElementById('avatarBtn');
  const email = session?.user?.email ?? '';
  avatarBtn.textContent = email.slice(0, 2).toUpperCase() || 'A';
  avatarBtn.title = `Sesión iniciada: ${email} (click para salir)`;

  muroPosts = data;
  categoriasPorClave = new Map((await apiGet('/api/admin/muro/categorias')).data.map((c) => [c.clave, c]));
  renderModeracion();
  await loadCategorias();
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------
document.getElementById('tabModeracionBtn').addEventListener('click', () => setTab('moderacion'));
document.getElementById('tabCategoriasBtn').addEventListener('click', () => setTab('categorias'));

function setTab(tab) {
  document.getElementById('tabModeracionBtn').classList.toggle('active', tab === 'moderacion');
  document.getElementById('tabCategoriasBtn').classList.toggle('active', tab === 'categorias');
  document.getElementById('viewModeracion').hidden = tab !== 'moderacion';
  document.getElementById('viewCategorias').hidden = tab !== 'categorias';
}

// ---------------------------------------------------------------------------
// Moderación
// ---------------------------------------------------------------------------
let muroPosts = [];
let categoriasPorClave = new Map();
let filtroActual = 'pendiente';

document.querySelectorAll('.mu-filtro-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    filtroActual = btn.dataset.filtro;
    document.querySelectorAll('.mu-filtro-btn').forEach((b) => b.classList.toggle('active', b === btn));
    renderModeracion();
  });
});

async function recargarModeracion() {
  const { ok, data } = await apiGet('/api/admin/muro');
  if (ok) { muroPosts = data; renderModeracion(); }
}

function renderModeracion() {
  const wrap = document.getElementById('muroList');
  const visibles = filtroActual === 'todos' ? muroPosts : muroPosts.filter((p) => p.estado === filtroActual);

  if (visibles.length === 0) {
    const copy = {
      pendiente: { icon: '✨', h: 'Nada pendiente', p: 'Todos los mensajes de la comunidad ya fueron revisados.' },
      aprobado: { icon: '💬', h: 'Todavía no hay aprobados', p: 'Los mensajes que apruebes van a aparecer acá.' },
      rechazado: { icon: '🗂️', h: 'Ningún mensaje rechazado', p: 'Los mensajes que rechaces quedan acá para tu referencia.' },
      todos: { icon: '📭', h: 'Todavía no hay mensajes', p: 'Cuando una familia publique en el muro, va a aparecer acá.' },
    }[filtroActual];
    wrap.innerHTML = `
      <div class="mu-empty">
        <div class="mu-empty-icon">${copy.icon}</div>
        <h3>${copy.h}</h3>
        <p>${copy.p}</p>
      </div>`;
    return;
  }

  wrap.innerHTML = visibles.map((p) => {
    const cat = categoriasPorClave.get(p.categoria);
    const color = cat?.color ?? '#EAEEE3';
    const nombreCat = cat?.nombre ?? p.categoria;
    return `
      <div class="mu-post-card" data-id="${p.id}">
        <div class="mu-post-top">
          <span class="mu-post-tag" style="background:${escapeHtml(color)};color:${textoClaro(color)}">${escapeHtml(nombreCat)}</span>
          <span class="mu-post-estado ${p.estado}">${p.estado}</span>
          <span class="mu-post-meta">${escapeHtml(p.nombre_familia ?? 'Familia')} · ${tiempoRelativo(p.created_at)}</span>
        </div>
        <div class="mu-post-contenido">${escapeHtml(p.contenido)}</div>
        ${p.estado === 'pendiente' ? `
        <div class="mu-post-actions">
          <button type="button" class="mu-btn-solid" data-aprobar="${p.id}">Aprobar</button>
          <button type="button" class="mu-btn-outline" data-rechazar="${p.id}">Rechazar</button>
        </div>` : ''}
      </div>`;
  }).join('');

  wrap.querySelectorAll('[data-aprobar]').forEach((btn) => {
    btn.addEventListener('click', () => moderarPost(btn.dataset.aprobar, 'aprobado'));
  });
  wrap.querySelectorAll('[data-rechazar]').forEach((btn) => {
    btn.addEventListener('click', () => moderarPost(btn.dataset.rechazar, 'rechazado'));
  });
}

async function moderarPost(id, estado) {
  const { ok, data } = await apiPut(`/api/admin/muro/${id}/estado`, { estado });
  if (!ok) {
    showToast(data.error ?? 'No se pudo actualizar el mensaje.');
    return;
  }
  showToast(estado === 'aprobado' ? 'Mensaje aprobado.' : 'Mensaje rechazado.');
  await recargarModeracion();
}

// ---------------------------------------------------------------------------
// Categorías — lista + drag&drop (mismo patrón HTML5 nativo que "Orden de
// la vidriera" en public/js/admin.js) + alta/edición en panel lateral.
// ---------------------------------------------------------------------------
let categorias = [];

async function loadCategorias() {
  const { ok, data } = await apiGet('/api/admin/muro/categorias');
  if (!ok) {
    document.getElementById('categoriasList').innerHTML = '<p class="mu-empty">No pudimos cargar las categorías.</p>';
    return;
  }
  categorias = data;
  categoriasPorClave = new Map(categorias.map((c) => [c.clave, c]));
  renderCategorias();
}

function renderCategorias() {
  const wrap = document.getElementById('categoriasList');
  if (categorias.length === 0) {
    wrap.innerHTML = `
      <div class="mu-empty">
        <div class="mu-empty-icon">🏷️</div>
        <h3>Todavía no hay categorías</h3>
        <p>Sumá la primera para que las familias puedan elegirla al publicar en el muro.</p>
      </div>`;
    return;
  }

  wrap.innerHTML = categorias.map((c) => `
    <div class="mu-cat-row ${c.activo ? '' : 'mu-cat-inactiva'}" draggable="true" data-clave="${c.clave}">
      <span class="mu-cat-handle" aria-hidden="true">⠿⠿</span>
      <div class="mu-cat-swatch" style="background:${escapeHtml(c.color ?? '#EAEEE3')}"></div>
      <div class="mu-cat-body">
        <div class="mu-cat-nombre">${escapeHtml(c.nombre)}</div>
        <div class="mu-cat-clave">${escapeHtml(c.clave)}</div>
      </div>
      <div class="mu-cat-actions">
        <button type="button" class="mu-icon-btn" data-edit="${c.clave}" title="Editar">✎</button>
        <button type="button" class="mu-icon-btn" data-toggle="${c.clave}" data-activo="${c.activo}" title="${c.activo ? 'Desactivar' : 'Activar'}">${c.activo ? '👁️' : '🚫'}</button>
      </div>
    </div>`).join('');

  attachDragHandlers();
  wrap.querySelectorAll('[data-edit]').forEach((btn) => {
    btn.addEventListener('click', () => abrirFormCategoria(categoriasPorClave.get(btn.dataset.edit)));
  });
  wrap.querySelectorAll('[data-toggle]').forEach((btn) => {
    btn.addEventListener('click', () => toggleCategoria(btn.dataset.toggle, btn.dataset.activo !== 'true'));
  });
}

function attachDragHandlers() {
  const wrap = document.getElementById('categoriasList');
  wrap.querySelectorAll('.mu-cat-row').forEach((row) => {
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
    row.addEventListener('drop', async (e) => {
      e.preventDefault();
      const nuevoOrden = Array.from(wrap.querySelectorAll('.mu-cat-row')).map((r) => r.dataset.clave);
      const { ok, data } = await apiPut('/api/admin/muro/categorias/reorder', { orden: nuevoOrden });
      if (!ok) {
        showToast(data.error ?? 'No se pudo guardar el nuevo orden.');
        await loadCategorias();
        return;
      }
      categorias.sort((a, b) => nuevoOrden.indexOf(a.clave) - nuevoOrden.indexOf(b.clave));
    });
  });
}

async function toggleCategoria(clave, activo) {
  const { ok, data } = await apiPost(`/api/admin/muro/categorias/${clave}/estado`, { activo });
  if (!ok) {
    showToast(data.error ?? 'No se pudo actualizar la categoría.');
    return;
  }
  showToast(activo ? 'Categoría activada.' : 'Categoría desactivada.');
  await loadCategorias();
}

// ---------------------------------------------------------------------------
// Panel lateral (alta/edición de categoría)
// ---------------------------------------------------------------------------
const overlay = document.getElementById('formOverlay');
const panel = document.getElementById('formPanel');
const categoriaForm = document.getElementById('categoriaForm');
const formError = document.getElementById('formError');
const formClaveField = document.getElementById('formClaveField');
let claveEnEdicion = null;

function abrirFormCategoria(categoria = null) {
  categoriaForm.reset();
  formError.hidden = true;
  claveEnEdicion = categoria?.clave ?? null;
  document.getElementById('formTitle').textContent = categoria ? 'Editar categoría' : 'Nueva categoría';
  document.getElementById('formNombre').value = categoria?.nombre ?? '';
  document.getElementById('formClave').value = categoria?.clave ?? '';
  document.getElementById('formClave').disabled = Boolean(categoria);
  formClaveField.hidden = Boolean(categoria);
  document.getElementById('formColor').value = categoria?.color ?? '#E9D9CB';

  overlay.hidden = false;
  panel.hidden = false;
  requestAnimationFrame(() => {
    overlay.classList.add('mu-show');
    panel.classList.add('mu-show');
  });
}

function cerrarFormCategoria() {
  overlay.classList.remove('mu-show');
  panel.classList.remove('mu-show');
  setTimeout(() => {
    overlay.hidden = true;
    panel.hidden = true;
  }, 300);
}

document.getElementById('newCategoriaBtn').addEventListener('click', () => abrirFormCategoria());
document.getElementById('formCancelBtn').addEventListener('click', cerrarFormCategoria);
document.getElementById('formCloseBtn').addEventListener('click', cerrarFormCategoria);
overlay.addEventListener('click', cerrarFormCategoria);

categoriaForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  formError.hidden = true;

  const nombre = document.getElementById('formNombre').value.trim();
  const color = document.getElementById('formColor').value;
  const saveBtn = document.getElementById('formSaveBtn');
  saveBtn.disabled = true;

  const { ok, data } = claveEnEdicion
    ? await apiPut(`/api/admin/muro/categorias/${claveEnEdicion}`, { nombre, color })
    : await apiPost('/api/admin/muro/categorias', { clave: document.getElementById('formClave').value.trim(), nombre, color });

  saveBtn.disabled = false;

  if (!ok) {
    formError.textContent = data.error ?? 'No se pudo guardar la categoría.';
    formError.hidden = false;
    return;
  }

  cerrarFormCategoria();
  showToast(claveEnEdicion ? 'Categoría actualizada.' : 'Categoría creada.');
  await loadCategorias();
});

// ---------------------------------------------------------------------------
// Arranque
// ---------------------------------------------------------------------------
if (session) {
  verifyAdminAndEnter();
} else {
  showLoginGate();
}
