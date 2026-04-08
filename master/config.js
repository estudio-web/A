import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, collection, getDocs, updateDoc, doc, getDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getAuth, signInWithEmailAndPassword,
  onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const app = initializeApp({
  apiKey: "AIzaSyDcJ9mpGXRgD0g5txV3xKKqPqSSgSB9B2Q",
  authDomain: "pana-84c2a.firebaseapp.com",
  projectId: "pana-84c2a",
});

const db  = getFirestore(app);
const auth = getAuth(app);

const grid       = document.getElementById('grid');
const modal      = document.getElementById('loginModal');
const userEmail  = document.getElementById('userEmail');
const loginError = document.getElementById('loginError');

let allNegocios = [];
let currentFilter = 'todos';

// ── LOGIN ──
window.login = async () => {
  const email = document.getElementById('email').value.trim();
  const pass  = document.getElementById('pass').value;
  loginError.style.display = 'none';
  try {
    await signInWithEmailAndPassword(auth, email, pass);
  } catch {
    loginError.style.display = 'block';
  }
};

// ── LOGOUT ──
window.logout = async () => {
  await signOut(auth);
};

// ── FILTRO ──
window.setFilter = (filter, el) => {
  currentFilter = filter;
  document.querySelectorAll('.filter-tab').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  renderGrid();
};

// ── VERIFICAR ADMIN ──
async function esAdmin(uid) {
  const snap = await getDoc(doc(db, 'admins', uid));
  return snap.exists();
}

// ── SESIÓN ──
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    modal.style.display = 'flex';
    grid.innerHTML = '';
    userEmail.textContent = '';
    return;
  }
  const admin = await esAdmin(user.uid);
  if (!admin) {
    alert("No tenés acceso de administrador.");
    await signOut(auth);
    return;
  }
  modal.style.display = 'none';
  userEmail.textContent = user.email;
  loadNegocios();
});

// ── AVATAR INITIALS ──
function initials(nombre) {
  if (!nombre) return '?';
  const parts = nombre.trim().split(' ');
  return parts.length >= 2
    ? (parts[0][0] + parts[1][0]).toUpperCase()
    : nombre.slice(0, 2).toUpperCase();
}

// ── FORMAT DATE ──
function fmtDate(d) {
  if (!d) return '—';
  return d.toLocaleDateString('es-AR', { day:'2-digit', month:'short', year:'numeric' });
}

// ── CARGAR ──
async function loadNegocios() {
  grid.innerHTML = `<div class="empty">Cargando...</div>`;
  const snap = await getDocs(collection(db, 'negocios'));
  allNegocios = [];
  snap.forEach(d => allNegocios.push({ id: d.id, ...d.data() }));
  updateStats();
  renderGrid();
}

// ── STATS ──
function updateStats() {
  const now = new Date();
  let active = 0, soon = 0, expired = 0;
  allNegocios.forEach(n => {
    if (n.activo === false) return;
    const exp = n.expiresAt?.toDate();
    if (!exp) { active++; return; }
    const dias = Math.floor((exp - now) / 864e5);
    if (dias <= 0)       expired++;
    else if (dias <= 5)  soon++;
    else                 active++;
  });
  document.getElementById('statTotal').textContent  = allNegocios.length;
  document.getElementById('statActive').textContent = active;
  document.getElementById('statSoon').textContent   = soon;
  document.getElementById('statExp').textContent    = expired;
}

// ── RENDER ──
function renderGrid() {
  const now = new Date();

  const filtered = allNegocios.filter(n => {
    const exp  = n.expiresAt?.toDate();
    const dias = exp ? Math.floor((exp - now) / 864e5) : 999;
    if (currentFilter === 'activos')  return n.activo !== false && dias > 0;
    if (currentFilter === 'vencidos') return dias <= 0;
    return true;
  });

  document.getElementById('gridCount').textContent =
    `${filtered.length} de ${allNegocios.length}`;

  if (!filtered.length) {
    grid.innerHTML = `<div class="empty">Sin resultados para este filtro.</div>`;
    return;
  }

  grid.innerHTML = '';

  filtered.forEach(n => {
    const created = n.createdAt?.toDate() || new Date();
    const exp     = n.expiresAt?.toDate();

    let porcentaje = 0, dias = null;
    let estado = 'Activo', badgeClass = 'badge-green', stripColor = 'var(--green)';
    let barColor = '#22c55e';

    if (exp) {
      const total  = 30;
      const usado  = (now - created) / 864e5;
      porcentaje   = Math.min((usado / total) * 100, 100);
      dias         = Math.floor((exp - now) / 864e5);

      if (dias <= 0) {
        estado = 'Vencido'; badgeClass = 'badge-red';
        stripColor = 'var(--red)'; barColor = '#ef4444';
      } else if (dias <= 5) {
        estado = 'Por vencer'; badgeClass = 'badge-amber';
        stripColor = 'var(--amber)'; barColor = '#f59e0b';
      }
    }

    if (n.activo === false) {
      estado = 'Inactivo'; badgeClass = 'badge-gray';
      stripColor = 'var(--text3)'; barColor = '#4a5a75';
    }

    const diasLabel = dias !== null
      ? (dias <= 0 ? 'Vencido' : `${dias}d restantes`)
      : 'Sin vencimiento';

    const div = document.createElement('div');
    div.className = 'card';

    div.innerHTML = `
      <div class="card-status-strip" style="background:${stripColor}"></div>

      <div class="card-top">
        <div class="card-avatar">${initials(n.nombre)}</div>
        <div class="card-info">
          <div class="card-name">${n.nombre || 'Sin nombre'}</div>
          <div class="card-email">${n.email || 'Sin email'}</div>
        </div>
        <span class="status-badge ${badgeClass}">${estado}</span>
      </div>

      <div class="card-meta">
        <div class="meta-item">
          <div class="meta-key">Creado</div>
          <div class="meta-val">${fmtDate(created)}</div>
        </div>
        <div class="meta-item">
          <div class="meta-key">Vence</div>
          <div class="meta-val">${exp ? fmtDate(exp) : '—'}</div>
        </div>
        <div class="meta-item">
          <div class="meta-key">Plan</div>
          <div class="meta-val">${n.plan || 'Estándar'}</div>
        </div>
        <div class="meta-item">
          <div class="meta-key">Tiempo</div>
          <div class="meta-val">${diasLabel}</div>
        </div>
      </div>

      <div class="progress-section">
        <div class="progress-meta">
          <span class="progress-label">Vida del plan</span>
          <span class="progress-value">${Math.floor(porcentaje)}%</span>
        </div>
        <div class="bar">
          <div class="bar-fill" style="width:${porcentaje}%; background:${barColor}"></div>
        </div>
      </div>

      <div class="card-actions">
        <button class="btn btn-renew" onclick="renovar('${n.id}')">+ 30 días</button>
        <button class="btn ${n.activo !== false ? 'btn-disable' : 'btn-enable'}"
          onclick="toggleAdmin('${n.id}', ${n.activo !== false})">
          ${n.activo !== false ? 'Desactivar' : 'Activar'}
        </button>
      </div>
    `;

    grid.appendChild(div);
  });
}

// ── ACCIONES ──
window.renovar = async (id) => {
  const now = new Date();
  const exp = new Date();
  exp.setDate(now.getDate() + 30);
  await updateDoc(doc(db, 'negocios', id), { createdAt: now, expiresAt: exp });
  loadNegocios();
};

window.toggleAdmin = async (id, activo) => {
  await updateDoc(doc(db, 'negocios', id), { activo: !activo });
  loadNegocios();
};
