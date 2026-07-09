const MESES_LARGO = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

function formatMesAnio(fechaISO) {
  const d = new Date(fechaISO);
  return `${MESES_LARGO[d.getMonth()]} de ${d.getFullYear()}`;
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// ---------------------------------------------------------------------------
// Auth — mismo mecanismo liviano que la vidriera/admin, con su propia clave
// de localStorage para no pisar sesiones de otros roles en el mismo navegador.
// ---------------------------------------------------------------------------
const { supabaseUrl, supabaseAnonKey } = window.APP_CONFIG ?? {};
const AUTH_STORAGE_KEY = 'mm_superadmin_auth_session';

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
  document.getElementById('superAdminShell').hidden = true;
}

function showShell() {
  document.getElementById('loginGate').hidden = true;
  document.getElementById('superAdminShell').hidden = false;
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

  await verifySuperAdminAndEnter();
});

async function verifySuperAdminAndEnter() {
  const { ok, status, data } = await apiGet('/api/super-admin/academias');
  if (status === 403) {
    loginError.textContent = data.error ?? 'Esta cuenta no tiene permisos de super-administrador.';
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
  showShell();
  const avatarBtn = document.getElementById('avatarBtn');
  const email = session?.user?.email ?? '';
  avatarBtn.textContent = email.slice(0, 2).toUpperCase() || 'SA';
  avatarBtn.title = `Sesión iniciada: ${email} (click para salir)`;

  // El total de módulos del catálogo (M) es constante entre clientes: se pide
  // una vez y se usa para el resumen "N de M módulos activos" de cada fila,
  // sin tener que pedir el detalle de cada academia solo para contar.
  const { data: catalogo } = await apiGet('/api/super-admin/modulos');
  totalModulos = catalogo.length;

  renderClients(data);
}

// ---------------------------------------------------------------------------
// Lista de clientes
// ---------------------------------------------------------------------------
let clients = [];
let totalModulos = 0;
let selectedClientId = null;

function summaryLine(cl) {
  return `${cl.modulos_activos_count} de ${totalModulos} módulos activos · Cliente desde ${formatMesAnio(cl.created_at)}`;
}

function renderClients(list) {
  clients = list;
  document.getElementById('clientCountLabel').textContent = `${clients.length} clientes en la plataforma`;

  if (!selectedClientId || !clients.some((c) => c.id === selectedClientId)) {
    selectedClientId = clients[0]?.id ?? null;
  }

  const rowsWrap = document.getElementById('clientRows');
  rowsWrap.innerHTML = clients.map((cl) => `
    <button type="button" class="mm-client-row ${cl.id === selectedClientId ? 'selected' : ''}" data-id="${cl.id}">
      <div class="mm-client-row-top">
        <span class="mm-client-name">${escapeHtml(cl.nombre)}</span>
        <span class="mm-status-pill ${cl.estado === 'activa' ? 'activo' : 'pausado'}">${cl.estado === 'activa' ? 'Activo' : 'Pausado'}</span>
      </div>
      <div class="mm-client-summary">${summaryLine(cl)}</div>
    </button>`).join('');

  rowsWrap.querySelectorAll('.mm-client-row').forEach((btn) => {
    btn.addEventListener('click', () => {
      selectedClientId = btn.dataset.id;
      rowsWrap.querySelectorAll('.mm-client-row').forEach((b) => b.classList.toggle('selected', b.dataset.id === selectedClientId));
      loadClientDetail();
    });
  });

  loadClientDetail();
}

// ---------------------------------------------------------------------------
// Detalle del cliente seleccionado + catálogo de módulos
// ---------------------------------------------------------------------------
// Guarda contra respuestas fuera de orden: si el admin cambia de cliente
// rápido (o una request queda lenta), un fetch viejo que resuelve después de
// uno más nuevo no debe pisar el detalle correcto ya renderizado.
let clientDetailRequestId = 0;

async function loadClientDetail() {
  const pane = document.getElementById('clientDetail');
  const cl = clients.find((c) => c.id === selectedClientId);

  if (!cl) {
    pane.innerHTML = '<p class="mm-empty">No hay clientes cargados todavía.</p>';
    return;
  }

  const requestId = ++clientDetailRequestId;
  const { ok, data: modulos } = await apiGet(`/api/super-admin/academias/${cl.id}/modulos`);
  if (requestId !== clientDetailRequestId) return; // ya hay una selección más nueva en curso

  if (!ok) {
    pane.innerHTML = '<p class="mm-empty">No se pudo cargar el catálogo de módulos.</p>';
    return;
  }

  renderClientDetail(cl, modulos);
}

function renderClientDetail(cl, modulos) {
  const pane = document.getElementById('clientDetail');
  pane.innerHTML = `
    <div class="mm-preview-inner">
      <div>
        <div class="mm-client-detail-top">
          <div class="mm-h1 mm-client-detail-name">${escapeHtml(cl.nombre)}</div>
          <span class="mm-status-badge ${cl.estado === 'activa' ? 'activo' : 'pausado'}">${cl.estado === 'activa' ? 'Activo' : 'Pausado'}</span>
        </div>
        <div class="mm-client-detail-summary">${summaryLine(cl)}</div>
      </div>
      <div>
        <div class="mm-eyebrow">Catálogo de módulos</div>
        <div id="moduleRows"></div>
      </div>
    </div>`;

  const rowsWrap = document.getElementById('moduleRows');
  rowsWrap.innerHTML = modulos.map((m) => `
    <div class="mm-module-row">
      <div>
        <div class="mm-module-name">${escapeHtml(m.nombre)}</div>
        <span class="mm-plan-badge ${m.incluido ? 'base' : 'addon'}">${m.incluido ? 'Incluido en el plan base' : 'Adicional pago'}</span>
      </div>
      <button type="button" class="mm-toggle-track ${m.activo ? 'on' : ''}" data-clave="${escapeHtml(m.clave)}" aria-label="Activar/desactivar ${escapeHtml(m.nombre)}">
        <span class="mm-toggle-knob"></span>
      </button>
    </div>`).join('');

  rowsWrap.querySelectorAll('.mm-toggle-track').forEach((btn) => {
    btn.addEventListener('click', () => toggleModulo(cl, btn));
  });
}

async function toggleModulo(cl, btn) {
  const clave = btn.dataset.clave;
  const nuevoValor = !btn.classList.contains('on');

  btn.disabled = true;
  const { ok, data } = await apiPut(`/api/super-admin/academias/${cl.id}/modulos`, { [clave]: nuevoValor });
  btn.disabled = false;

  if (!ok) {
    showToast(data.error ?? 'No se pudo actualizar el módulo.');
    return;
  }

  // Actualiza el conteo "N de M" en la fila de la lista izquierda sin
  // refetchear toda la lista de clientes. Esto vale sin importar qué cliente
  // esté seleccionado ahora: el cambio ya se aplicó en el servidor para `cl`.
  const activos = data.modulos.filter((m) => m.activo).length;
  const clInList = clients.find((c) => c.id === cl.id);
  if (clInList) clInList.modulos_activos_count = activos;
  document.querySelector(`.mm-client-row[data-id="${cl.id}"] .mm-client-summary`).textContent = summaryLine(clInList);

  // El panel de detalle sí depende de cuál esté seleccionado en este momento:
  // si el admin ya cambió a otro cliente mientras el PUT estaba en vuelo, no
  // hay que pisar ese detalle con la respuesta vieja.
  if (cl.id === selectedClientId) renderClientDetail(cl, data.modulos);
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------
if (session) {
  verifySuperAdminAndEnter().catch((err) => {
    console.error(err);
    showLoginGate();
  });
} else {
  showLoginGate();
}
