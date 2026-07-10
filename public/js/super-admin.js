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

async function apiPost(path, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (session) headers.Authorization = `Bearer ${session.access_token}`;
  const res = await fetch(path, { method: 'POST', headers, body: JSON.stringify(body ?? {}) });
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

// ---------------------------------------------------------------------------
// Navegación (barra lateral) — mismo patrón que admin.html (Etapa B).
// ---------------------------------------------------------------------------
document.getElementById('navClientesBtn').addEventListener('click', () => {
  setActiveSection('clientes');
  // El catálogo de módulos puede haber cambiado en "Configuración de la
  // plataforma" (alta/edición/baja) mientras se estaba en esa sección; sin
  // este refetch, el panel de detalle quedaría mostrando el catálogo viejo
  // hasta recargar la página.
  loadClientDetail();
});
document.getElementById('navConfigBtn').addEventListener('click', () => {
  setActiveSection('config');
  loadModulosCatalogo();
  loadConfigPlataforma();
});

function setActiveSection(section) {
  document.getElementById('navClientesBtn').classList.toggle('active', section === 'clientes');
  document.getElementById('navConfigBtn').classList.toggle('active', section === 'config');
  document.getElementById('tabClientes').hidden = section !== 'clientes';
  document.getElementById('tabConfig').hidden = section !== 'config';
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
  document.getElementById('userEmailLabel').textContent = email;

  // El total de módulos del catálogo (M) es constante entre clientes: se pide
  // una vez y se usa para el resumen "N de M módulos activos" de cada fila,
  // sin tener que pedir el detalle de cada academia solo para contar. Solo
  // cuenta los módulos vigentes (no los dados de baja, Etapa E).
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
// Configuración de la plataforma (Etapa E) — catálogo de módulos
//
// A diferencia de la lista de clientes (solo lectura de módulos ya
// existentes), acá se gestiona el catálogo en sí: alta, edición y baja
// (soft delete — nunca se borra la fila para no romper la FK de clientes
// que ya tengan el módulo activado). Se pide con `incluir_inactivos=true`
// para poder ver y reactivar los dados de baja, algo que el resto de la
// app (conteo "N de M" de la lista de clientes) no necesita.
// ---------------------------------------------------------------------------
let modulosCatalogo = [];
let moduloEnEdicion = null; // clave del módulo que se está editando, o null si es alta

async function loadModulosCatalogo() {
  const { ok, data } = await apiGet('/api/super-admin/modulos?incluir_inactivos=true');
  const wrap = document.getElementById('modulosCatalogoList');
  if (!ok) {
    wrap.innerHTML = '<p class="mm-empty">No se pudo cargar el catálogo de módulos.</p>';
    return;
  }
  modulosCatalogo = data;
  renderModulosCatalogo();
}

function renderModulosCatalogo() {
  const wrap = document.getElementById('modulosCatalogoList');
  if (modulosCatalogo.length === 0) {
    wrap.innerHTML = '<p class="mm-empty">Todavía no hay módulos en el catálogo.</p>';
    return;
  }

  wrap.innerHTML = modulosCatalogo.map((m) => `
    <div class="mm-modulo-row" data-clave="${escapeHtml(m.clave)}">
      <div class="mm-modulo-row-info">
        <div class="mm-module-name">${escapeHtml(m.nombre)} <span class="mm-modulo-clave">(${escapeHtml(m.clave)})</span></div>
        <div class="mm-modulo-badges">
          <span class="mm-plan-badge ${m.incluido ? 'base' : 'addon'}">${m.incluido ? 'Incluido en el plan base' : 'Adicional pago'}</span>
          <span class="mm-status-pill ${m.activo ? 'activo' : 'pausado'}">${m.activo ? 'Activo' : 'Dado de baja'}</span>
        </div>
        ${m.descripcion ? `<div class="mm-modulo-desc">${escapeHtml(m.descripcion)}</div>` : ''}
      </div>
      <div class="mm-modulo-row-actions">
        <button type="button" class="mm-btn-outline mm-modulo-edit-btn" data-clave="${escapeHtml(m.clave)}">Editar</button>
        <button type="button" class="mm-btn-outline mm-modulo-toggle-btn" data-clave="${escapeHtml(m.clave)}" data-activo="${m.activo}">${m.activo ? 'Dar de baja' : 'Reactivar'}</button>
      </div>
    </div>`).join('');

  wrap.querySelectorAll('.mm-modulo-edit-btn').forEach((btn) => {
    btn.addEventListener('click', () => abrirFormularioModulo(btn.dataset.clave));
  });
  wrap.querySelectorAll('.mm-modulo-toggle-btn').forEach((btn) => {
    btn.addEventListener('click', () => toggleEstadoModulo(btn.dataset.clave, btn.dataset.activo === 'true'));
  });
}

async function toggleEstadoModulo(clave, activoActual) {
  const nuevoValor = !activoActual;
  const { ok, data } = await apiPost(`/api/super-admin/modulos/${encodeURIComponent(clave)}/estado`, { activo: nuevoValor });
  if (!ok) {
    showToast(data.error ?? 'No se pudo actualizar el estado del módulo.');
    return;
  }
  showToast(data.mensaje ?? 'Módulo actualizado.');
  await loadModulosCatalogo();
}

// --- Formulario de alta/edición (mismo <div> para ambos casos) ---
const moduloForm = document.getElementById('moduloForm');
const moduloFormError = document.getElementById('moduloFormError');

function abrirFormularioNuevoModulo() {
  moduloEnEdicion = null;
  document.getElementById('moduloFormClaveOriginal').value = '';
  document.getElementById('moduloFormClave').value = '';
  document.getElementById('moduloFormClave').disabled = false;
  document.getElementById('moduloFormNombre').value = '';
  document.getElementById('moduloFormDescripcion').value = '';
  document.getElementById('moduloFormIncluido').checked = false;
  moduloFormError.hidden = true;
  moduloForm.hidden = false;
  document.getElementById('moduloFormClave').focus();
}

function abrirFormularioModulo(clave) {
  const m = modulosCatalogo.find((x) => x.clave === clave);
  if (!m) return;
  moduloEnEdicion = clave;
  document.getElementById('moduloFormClaveOriginal').value = clave;
  document.getElementById('moduloFormClave').value = m.clave;
  document.getElementById('moduloFormClave').disabled = true; // la clave no se edita: la referencia academia_modulos depende de ella
  document.getElementById('moduloFormNombre').value = m.nombre;
  document.getElementById('moduloFormDescripcion').value = m.descripcion ?? '';
  document.getElementById('moduloFormIncluido').checked = m.incluido;
  moduloFormError.hidden = true;
  moduloForm.hidden = false;
  document.getElementById('moduloFormNombre').focus();
}

function cerrarFormularioModulo() {
  moduloForm.hidden = true;
  moduloEnEdicion = null;
}

document.getElementById('newModuloBtn').addEventListener('click', abrirFormularioNuevoModulo);
document.getElementById('moduloFormCancelBtn').addEventListener('click', cerrarFormularioModulo);

document.getElementById('moduloFormSaveBtn').addEventListener('click', async () => {
  const nombre = document.getElementById('moduloFormNombre').value.trim();
  const descripcion = document.getElementById('moduloFormDescripcion').value.trim();
  const incluido = document.getElementById('moduloFormIncluido').checked;
  const saveBtn = document.getElementById('moduloFormSaveBtn');

  moduloFormError.hidden = true;
  saveBtn.disabled = true;

  let ok, data;
  if (moduloEnEdicion) {
    ({ ok, data } = await apiPut(`/api/super-admin/modulos/${encodeURIComponent(moduloEnEdicion)}`, { nombre, descripcion, incluido }));
  } else {
    const clave = document.getElementById('moduloFormClave').value.trim();
    ({ ok, data } = await apiPost('/api/super-admin/modulos', { clave, nombre, descripcion, incluido }));
  }

  saveBtn.disabled = false;

  if (!ok) {
    moduloFormError.textContent = data.error ?? 'No se pudo guardar el módulo.';
    moduloFormError.hidden = false;
    return;
  }

  showToast(moduloEnEdicion ? 'Módulo actualizado.' : 'Módulo creado — ya está disponible para activar en cada cliente.');
  cerrarFormularioModulo();
  await loadModulosCatalogo();
});

// ---------------------------------------------------------------------------
// Configuración de la plataforma (Etapa E) — ajustes generales
// ---------------------------------------------------------------------------
async function loadConfigPlataforma() {
  const { ok, data } = await apiGet('/api/super-admin/configuracion');
  if (!ok) {
    showToast('No se pudieron cargar los ajustes generales.');
    return;
  }
  document.getElementById('configNombrePlataforma').value = data.nombre_plataforma ?? '';
  document.getElementById('configEmailSoporte').value = data.email_soporte ?? '';
}

const configForm = document.getElementById('configForm');
const configFormError = document.getElementById('configFormError');

configForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  configFormError.hidden = true;
  const formData = new FormData(configForm);
  const saveBtn = document.getElementById('configSaveBtn');
  saveBtn.disabled = true;

  const { ok, data } = await apiPut('/api/super-admin/configuracion', {
    nombre_plataforma: formData.get('nombre_plataforma'),
    email_soporte: formData.get('email_soporte'),
  });

  saveBtn.disabled = false;

  if (!ok) {
    configFormError.textContent = data.error ?? 'No se pudieron guardar los ajustes.';
    configFormError.hidden = false;
    return;
  }

  document.getElementById('configNombrePlataforma').value = data.nombre_plataforma ?? '';
  document.getElementById('configEmailSoporte').value = data.email_soporte ?? '';
  showToast('Ajustes guardados.');
});

// ---------------------------------------------------------------------------
// Contenido de demostración (Etapa H) — acción destructiva e irreversible,
// por eso la confirmación explícita antes de llamar al backend.
// ---------------------------------------------------------------------------
document.getElementById('borrarDemoBtn').addEventListener('click', async () => {
  const confirmado = confirm('¿Confirmás que querés borrar todo el contenido de demostración? Esta acción no se puede deshacer.');
  if (!confirmado) return;

  const btn = document.getElementById('borrarDemoBtn');
  btn.disabled = true;
  const { ok, data } = await apiPost('/api/super-admin/demo/borrar');
  btn.disabled = false;

  if (!ok) {
    showToast(data.error ?? 'No se pudo borrar el contenido de demostración.');
    return;
  }

  showToast(`Borrado: ${data.publicaciones_borradas} publicaciones, ${data.eventos_borrados} eventos, ${data.imagenes_borradas} imágenes, ${data.familias_borradas} familias.`);
});

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
