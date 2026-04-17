// ============================================================
// admin/admin.js — Panel de administración
// Maneja: auth, CRUD productos, pedidos, promociones
// ============================================================
// 🔥 ImgBB API KEY (GLOBAL)

import { db, auth } from '../firebase.js';
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  collection, doc, addDoc, setDoc, updateDoc, deleteDoc,
  getDocs, getDoc, query, orderBy, where,
  serverTimestamp, Timestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
// 🔥 ImgBB API KEY (GLOBAL)
const IMGBB_API_KEY = '9ed686117bdb0d5263132a2e5ec5b094';
console.log(IMGBB_API_KEY);


// ── Utilidades ────────────────────────────────────────────── //
const $  = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];
const IS_LOGIN    = document.body.classList.contains('auth-body');
const IS_DASH     = document.body.classList.contains('dash-body');
const PAGE_IS_LOGIN = window.location.pathname.includes('login');
const PAGE_IS_DASH  = window.location.pathname.includes('dashboard');

// ── Toast ──────────────────────────────────────────────────── //
function showToast(msg, type = 'info', duration = 3500) {
  const container = $('#toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  const icons = { success:'✅', error:'❌', info:'ℹ️' };
  toast.textContent = `${icons[type] || ''} ${msg}`;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), duration + 350);
}

// ── Estado admin ──────────────────────────────────────────── //
const admin = {
  uid:       null,
  negocioId: null,
  productos: [],
  pedidos:   [],
  promos:    [],
};

// ── Obtener negocioId del usuario ─────────────────────────── //
async function fetchNegocioId(uid) {
  // Buscamos en Firestore el negocio cuyo ownerId == uid
  const negociosRef = collection(db, 'negocios');
  const snap = await getDocs(negociosRef);
  for (const d of snap.docs) {
    if (d.data().ownerId === uid) return d.id;
  }
  return null;
}

// ════════════════════════════════════════════════════════════ //
//                     PÁGINA LOGIN                            //
// ════════════════════════════════════════════════════════════ //
if (PAGE_IS_LOGIN) {

  // Si ya está autenticado, redirigir
  onAuthStateChanged(auth, user => {
    if (user) window.location.href = 'dashboard.html';
  });

  const form    = $('#login-form');
  const errDiv  = $('#login-error');
  const btnText = $('#login-text');
  const btnLoad = $('#login-loading');
  const btnBtn  = $('#btn-login');

  // Toggle contraseña
  $('#toggle-pw')?.addEventListener('click', () => {
    const pw = $('#password');
    pw.type = pw.type === 'password' ? 'text' : 'password';
  });

  form?.addEventListener('submit', async e => {
    e.preventDefault();
    const email    = $('#email').value.trim();
    const password = $('#password').value.trim();
    if (!email || !password) return;

    errDiv.classList.add('hidden');
    btnText.classList.add('hidden');
    btnLoad.classList.remove('hidden');
    btnBtn.disabled = true;

    try {
      await signInWithEmailAndPassword(auth, email, password);
      window.location.href = 'dashboard.html';
    } catch (err) {
      console.error('Login error:', err);
      errDiv.classList.remove('hidden');
      btnText.classList.remove('hidden');
      btnLoad.classList.add('hidden');
      btnBtn.disabled = false;
    }
  });
}

// ════════════════════════════════════════════════════════════ //
//                   PÁGINA DASHBOARD                          //
// ════════════════════════════════════════════════════════════ //
if (PAGE_IS_DASH) {

  const loader = $('#global-loader');
  function hideLoader() {
    loader?.classList.add('fade-out');
    setTimeout(() => loader?.remove(), 450);
  }

  // ── Auth guard ──────────────────────────────────────────── //
  onAuthStateChanged(auth, async user => {
    if (!user) {
      window.location.href = 'login.html';
      return;
    }
    admin.uid = user.uid;
    $('#topbar-user').textContent = user.email || '';

    // Obtener negocioId
    admin.negocioId = await fetchNegocioId(user.uid);
    if (!admin.negocioId) {
      hideLoader();
      showToast('No se encontró un negocio asociado a tu cuenta.', 'error', 8000);
      return;
    }

    // Cargar nombre del negocio en sidebar
    try {
  const negSnap = await getDoc(doc(db, 'negocios', admin.negocioId));
  if (negSnap.exists()) {
    admin.negocio = negSnap.data();
    const n = admin.negocio.nombre || 'Mi Panadería';
    $('#sidebar-negocio-name').textContent = n;
    document.title = `Admin — ${n}`;
  }
} catch (_) {}

    await initDashboard();
    hideLoader();
  });

  // ── Navegación ─────────────────────────────────────────── //
  const SECTIONS = ['dashboard', 'productos', 'pedidos', 'promociones'];

  function showSection(id) {
    SECTIONS.forEach(s => {
      $(`#section-${s}`)?.classList.toggle('hidden', s !== id);
    });
    $$('.nav-link').forEach(l => {
      l.classList.toggle('active', l.dataset.section === id);
    });
    $('#topbar-title').textContent =
      { dashboard:'Dashboard', productos:'Productos', pedidos:'Pedidos', promociones:'Promociones' }[id] || id;
    // Cerrar sidebar en mobile
    $('#sidebar').classList.remove('open');
  }

  $$('.nav-link').forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      showSection(link.dataset.section);
    });
  });

  // Mobile menu toggle
  $('#menu-toggle')?.addEventListener('click', () => {
    $('#sidebar').classList.toggle('open');
  });

  // Logout
  $('#btn-logout')?.addEventListener('click', async () => {
    await signOut(auth);
    window.location.href = 'login.html';
  });

  // ── Inicializar dashboard ──────────────────────────────── //
  async function initDashboard() {
    await Promise.all([
      loadProductos(),
      loadPedidos(),
      loadPromos(),
    ]);
    renderDashboardStats();
    renderRecentPedidos();
    setupProductoModal();
    setupPromoModal();
    setupFiltroEstado();
    setupShareModal();
  }

  // ── STATS ──────────────────────────────────────────────── //
  function renderDashboardStats() {
    // Pedidos de hoy
    const hoy   = new Date(); hoy.setHours(0,0,0,0);
    const hoyTs = Timestamp.fromDate(hoy);
    const pedHoy = admin.pedidos.filter(p =>
      p.createdAt && p.createdAt.toMillis() >= hoyTs.toMillis()
    ).length;
    $('#stat-pedidos-hoy').textContent   = pedHoy;
    $('#stat-productos').textContent     = admin.productos.filter(p => p.disponible !== false).length;
    $('#stat-pendientes').textContent    = admin.pedidos.filter(p => p.estado === 'pendiente').length;
    $('#stat-promos').textContent        = admin.promos.filter(p => p.activo).length;
  }

  function renderRecentPedidos() {
    const container = $('#recent-pedidos');
    const ultimos   = admin.pedidos.slice(0, 5);
    if (!ultimos.length) {
      container.innerHTML = '<p class="loading-msg">Sin pedidos aún.</p>';
      return;
    }
    container.innerHTML = buildPedidosTable(ultimos);
    bindEstadoBtns(container);
  }

  // ── PRODUCTOS ──────────────────────────────────────────── //
  async function loadProductos() {
    try {
      const snap = await getDocs(
        query(collection(db, 'negocios', admin.negocioId, 'productos'), orderBy('nombre'))
      );
      admin.productos = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderProductosGrid();
    } catch (e) {
      console.error('Error productos:', e);
    }
  }

  function renderProductosGrid() {
    const grid = $('#productos-lista');
    if (!admin.productos.length) {
      grid.innerHTML = '<p class="loading-msg">No hay productos. ¡Creá el primero!</p>';
      return;
    }
    grid.innerHTML = admin.productos.map(p => {
      const precio = typeof p.precio === 'number'
        ? `$${p.precio.toLocaleString('es-AR')}`
        : p.precio || '';
      const dispoText = p.disponible !== false ? '✅ Disponible' : '❌ Sin stock';
      return `
        <div class="prod-admin-card" data-id="${p.id}">
          <img src="${p.imagen || 'https://via.placeholder.com/400x300/F5ECD8/6B4226?text=🍞'}"
               alt="${p.nombre}" loading="lazy" />
          <div class="card-body">
            <span class="card-cat">${p.categoria || ''}</span>
            <div class="card-name">${p.nombre}</div>
            <div class="card-price">${precio}</div>
            <div class="card-available" style="color:${p.disponible!==false?'var(--green-ok)':'var(--red-no)'}">${dispoText}</div>
          </div>
          <div class="card-actions">
            <button class="btn-edit" data-id="${p.id}">✏️ Editar</button>
            <button class="btn-toggle" data-id="${p.id}" data-disp="${p.disponible!==false}"
              style="color:${p.disponible!==false?'var(--red-no)':'var(--green-ok)'};border:1.5px solid ${p.disponible!==false?'rgba(192,57,43,.25)':'rgba(61,122,92,.3)'};border-radius:7px;padding:.4rem .55rem;font-size:.73rem;font-weight:600">
              ${p.disponible !== false ? '🔴 Quitar' : '🟢 Activar'}
            </button>
            <button class="btn-delete" data-id="${p.id}">🗑</button>
          </div>
        </div>`;
    }).join('');

    
async function subirImagenImgBB(file) {
  const status = document.getElementById('img-upload-status');
  status.innerText = '⏳ Subiendo imagen...';

  const formData = new FormData();
  formData.append('image', file);

  try {
    const res = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, {
      method: 'POST',
      body: formData
    });

    const data = await res.json();

    if (data.success) {
      status.innerText = '✅ Imagen subida correctamente';
      return data.data.url;
    } else {
      throw new Error('Error ImgBB');
    }

  } catch (err) {
    console.error(err);
    status.innerText = '❌ Error al subir imagen';
    return null;
  }
}

    // Bind
    $$('.btn-edit', grid).forEach(btn => {
      btn.addEventListener('click', () => openProductoModal(btn.dataset.id));
    });
    $$('.btn-delete', grid).forEach(btn => {
      btn.addEventListener('click', () => deleteProducto(btn.dataset.id));
    });
    $$('.btn-toggle', grid).forEach(btn => {
      btn.addEventListener('click', () => toggleDisponible(btn.dataset.id, btn.dataset.disp === 'true'));
    });
  }

  // Editar disponibilidad
  async function toggleDisponible(id, actual) {
    try {
      await updateDoc(doc(db, 'negocios', admin.negocioId, 'productos', id), {
        disponible: !actual
      });
      showToast(`Producto ${!actual ? 'activado' : 'desactivado'}.`, 'success');
      await loadProductos();
    } catch (e) {
      showToast('Error al cambiar disponibilidad.', 'error');
    }
  }

  // Eliminar producto
  async function deleteProducto(id) {
    if (!confirm('¿Seguro que querés eliminar este producto?')) return;
    try {
      await deleteDoc(doc(db, 'negocios', admin.negocioId, 'productos', id));
      showToast('Producto eliminado.', 'success');
      await loadProductos();
    } catch (e) {
      showToast('Error al eliminar.', 'error');
    }
  }

  // ── Modal Producto ─────────────────────────────────────── //
  let editingProdId = null;

  function setupProductoModal() {
    $('#btn-nuevo-producto').addEventListener('click', () => openProductoModal(null));
    $('#btn-cancel-prod').addEventListener('click', closeProductoModal);
    $('#overlay-producto').addEventListener('click', closeProductoModal);
    $('#form-producto').addEventListener('submit', saveProducto);
  }

  function openProductoModal(id) {
    editingProdId = id;
    const modal = $('#modal-producto');
    modal.classList.remove('hidden');

    if (id) {
      const p = admin.productos.find(x => x.id === id);
      if (!p) return;
      $('#modal-prod-title').textContent = 'Editar producto';
      $('#prod-nombre').value      = p.nombre      || '';
      $('#prod-precio').value      = p.precio      || '';
      $('#prod-descripcion').value = p.descripcion || '';
      $('#prod-imagen').value      = p.imagen      || '';
      $('#prod-categoria').value   = p.categoria   || 'panes';
      $('#prod-disponible').checked = p.disponible !== false;
    } else {
      $('#modal-prod-title').textContent = 'Nuevo producto';
      $('#form-producto').reset();
      $('#prod-disponible').checked = true;
    }
  }

  function closeProductoModal() {
    $('#modal-producto').classList.add('hidden');
    editingProdId = null;
  }

  async function saveProducto(e) {
  e.preventDefault();

  const nombre = $('#prod-nombre').value.trim();
  const precio = parseFloat($('#prod-precio').value);

  if (!nombre || isNaN(precio)) {
    showToast('Nombre y precio son requeridos.', 'error');
    return;
  }

  const btn = $('#btn-save-prod');
  const status = document.getElementById('img-upload-status');

  btn.disabled = true;
  btn.textContent = 'Procesando...';

  let imagenURL = '';

  try {
    // 🔥 NUEVO: subir imagen si hay archivo
    const fileInput = document.getElementById('prod-imagen-file');

    if (fileInput && fileInput.files.length > 0) {
      status.innerText = '⏳ Subiendo imagen...';

      const formData = new FormData();
      formData.append('image', fileInput.files[0]);



      const res = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, {
        method: 'POST',
        body: formData
      });

      const imgData = await res.json();

      if (!imgData.success) throw new Error('Error ImgBB');

      imagenURL = imgData.data.url;
      status.innerText = '✅ Imagen lista';
    } else {
      // fallback por si editás y no subís nueva imagen
      imagenURL = $('#prod-imagen')?.value?.trim() || '';
    }

    // 📦 DATA FINAL
    const data = {
      nombre,
      precio,
      descripcion: $('#prod-descripcion').value.trim(),
      imagen: imagenURL,
      categoria: $('#prod-categoria').value,
      disponible: $('#prod-disponible').checked,
    };

    const col = collection(db, 'negocios', admin.negocioId, 'productos');

    if (editingProdId) {
      await updateDoc(
        doc(db, 'negocios', admin.negocioId, 'productos', editingProdId),
        data
      );
      showToast('Producto actualizado ✅', 'success');
    } else {
      await addDoc(col, {
        ...data,
        createdAt: serverTimestamp()
      });
      showToast('Producto creado ✅', 'success');
    }

    closeProductoModal();
    await loadProductos();

  } catch (err) {
    console.error(err);
    showToast('Error al guardar el producto.', 'error');
    if (status) status.innerText = '❌ Error al subir imagen';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Guardar';
  }
}
  // ── PEDIDOS ────────────────────────────────────────────── //
  async function loadPedidos() {
    try {
      const snap = await getDocs(
        query(
          collection(db, 'negocios', admin.negocioId, 'pedidos'),
          orderBy('createdAt', 'desc')
        )
      );
      admin.pedidos = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderPedidos();
    } catch (e) {
      console.error('Error pedidos:', e);
    }
  }

  function buildPedidosTable(lista) {
    if (!lista.length) return '<p class="loading-msg">No hay pedidos.</p>';
    return `<table>
      <thead>
        <tr>
          <th>Cliente</th><th>Teléfono</th><th>Pedido</th><th>Dirección</th>
          <th>Estado</th><th>Fecha</th><th>Acciones</th>
        </tr>
      </thead>
      <tbody>
        ${lista.map(p => {
          const fecha = p.createdAt?.toDate
            ? p.createdAt.toDate().toLocaleDateString('es-AR', { day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit' })
            : '—';
          const estadoCls = `estado-${(p.estado||'pendiente').replace(' ','-')}`;
          return `<tr data-id="${p.id}">
            <td><strong>${p.nombre || '—'}</strong></td>
            <td>${p.telefono || '—'}</td>
            <td style="max-width:200px;white-space:pre-wrap;font-size:.8rem">${p.pedido || '—'}</td>
            <td style="font-size:.8rem">${p.direccion || '—'}</td>
            <td><span class="estado-badge ${estadoCls}">${p.estado || 'pendiente'}</span></td>
            <td style="font-size:.78rem;white-space:nowrap">${fecha}</td>
            <td style="white-space:nowrap">
              ${['pendiente','confirmado','entregado','sin stock'].map(s =>
                `<button class="btn-estado${p.estado===s?' active':''}" data-id="${p.id}" data-estado="${s}">${s}</button>`
              ).join('')}
            </td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>`;
  }

  function renderPedidos(filtroEstado = 'all') {
    const container = $('#pedidos-lista');
    let lista = admin.pedidos;
    if (filtroEstado !== 'all') lista = lista.filter(p => p.estado === filtroEstado);
    container.innerHTML = buildPedidosTable(lista);
    bindEstadoBtns(container);
  }

  function bindEstadoBtns(ctx) {
    $$('.btn-estado', ctx).forEach(btn => {
      btn.addEventListener('click', () => cambiarEstado(btn.dataset.id, btn.dataset.estado));
    });
  }

  async function cambiarEstado(id, nuevoEstado) {
    try {
      await updateDoc(doc(db, 'negocios', admin.negocioId, 'pedidos', id), {
        estado: nuevoEstado
      });
      showToast(`Estado actualizado: ${nuevoEstado}`, 'success');
      await loadPedidos();
      renderDashboardStats();
    } catch (e) {
      showToast('Error al actualizar estado.', 'error');
    }
  }

  function setupFiltroEstado() {
    $('#filtro-estado')?.addEventListener('change', e => {
      renderPedidos(e.target.value);
    });
  }

  // ── PROMOCIONES ────────────────────────────────────────── //
  async function loadPromos() {
    try {
      const snap = await getDocs(collection(db, 'negocios', admin.negocioId, 'promociones'));
      admin.promos = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderPromos();
    } catch (e) {
      console.error('Error promos:', e);
    }
  }

  function renderPromos() {
    const container = $('#promos-lista');
    if (!admin.promos.length) {
      container.innerHTML = '<p class="loading-msg">No hay promociones. ¡Creá la primera!</p>';
      return;
    }
    container.innerHTML = admin.promos.map(p => `
      <div class="promo-admin-card">
        <div class="promo-head">
          <div>
            <h3>${p.titulo}</h3>
            <p>${p.descripcion || 'Sin descripción'}</p>
          </div>
          <span class="estado-badge ${p.activo ? 'estado-confirmado' : 'estado-sin-stock'}">
            ${p.activo ? '✅ Activa' : '❌ Inactiva'}
          </span>
        </div>
        <div class="promo-actions">
          <button class="btn-edit" data-id="${p.id}">✏️ Editar</button>
          <button class="btn-toggle-promo btn-estado" data-id="${p.id}" data-activo="${p.activo}">
            ${p.activo ? '🔴 Desactivar' : '🟢 Activar'}
          </button>
          <button class="btn-delete-promo btn-estado" data-id="${p.id}">🗑 Eliminar</button>
        </div>
      </div>`).join('');

    $$('.btn-edit', container).forEach(btn => openPromoModal(btn.dataset.id));
    $$('.btn-edit', container).forEach(btn => {
      btn.addEventListener('click', () => openPromoModal(btn.dataset.id));
    });
    $$('.btn-toggle-promo', container).forEach(btn => {
      btn.addEventListener('click', () => togglePromo(btn.dataset.id, btn.dataset.activo === 'true'));
    });
    $$('.btn-delete-promo', container).forEach(btn => {
      btn.addEventListener('click', () => deletePromo(btn.dataset.id));
    });
  }

  async function togglePromo(id, actual) {
    try {
      await updateDoc(doc(db, 'negocios', admin.negocioId, 'promociones', id), { activo: !actual });
      showToast(`Promoción ${!actual ? 'activada' : 'desactivada'}.`, 'success');
      await loadPromos(); renderDashboardStats();
    } catch (e) { showToast('Error.', 'error'); }
  }

  async function deletePromo(id) {
    if (!confirm('¿Eliminar esta promoción?')) return;
    try {
      await deleteDoc(doc(db, 'negocios', admin.negocioId, 'promociones', id));
      showToast('Promoción eliminada.', 'success');
      await loadPromos(); renderDashboardStats();
    } catch (e) { showToast('Error.', 'error'); }
  }

  // Modal promoción
  let editingPromoId = null;

  function setupPromoModal() {
    $('#btn-nueva-promo').addEventListener('click', () => openPromoModal(null));
    $('#btn-cancel-promo').addEventListener('click', closePromoModal);
    $('#overlay-promo').addEventListener('click', closePromoModal);
    $('#form-promo').addEventListener('submit', savePromo);
  }

  function openPromoModal(id) {
    editingPromoId = id;
    const modal = $('#modal-promo');
    modal.classList.remove('hidden');

    if (id) {
      const p = admin.promos.find(x => x.id === id);
      if (!p) return;
      $('#modal-promo-title').textContent = 'Editar promoción';
      $('#promo-titulo').value       = p.titulo       || '';
      $('#promo-descripcion').value  = p.descripcion  || '';
      $('#promo-activo').checked     = p.activo !== false;
    } else {
      $('#modal-promo-title').textContent = 'Nueva promoción';
      $('#form-promo').reset();
      $('#promo-activo').checked = true;
    }
  }

  function closePromoModal() {
    $('#modal-promo').classList.add('hidden');
    editingPromoId = null;
  }

  async function savePromo(e) {
    e.preventDefault();
    const titulo = $('#promo-titulo').value.trim();
    if (!titulo) { showToast('El título es requerido.', 'error'); return; }

    const data = {
      titulo,
      descripcion: $('#promo-descripcion').value.trim(),
      activo:      $('#promo-activo').checked,
    };

    const btn = $('#btn-save-promo');
    btn.disabled = true; btn.textContent = 'Guardando...';

    try {
      if (editingPromoId) {
        await updateDoc(doc(db, 'negocios', admin.negocioId, 'promociones', editingPromoId), data);
        showToast('Promoción actualizada ✅', 'success');
      } else {
        await addDoc(collection(db, 'negocios', admin.negocioId, 'promociones'), { ...data, createdAt: serverTimestamp() });
        showToast('Promoción creada ✅', 'success');
      }
      closePromoModal();
      await loadPromos(); renderDashboardStats();
    } catch (err) {
      showToast('Error al guardar.', 'error');
    } finally {
      btn.disabled = false; btn.textContent = 'Guardar';
    }
  }

  // ── Compartir tienda ───────────────────────────────────── //
function buildStoreURL() {
  // Ajustá la ruta si tu "public/index.html" está en otro lado
  const base = window.location.origin +
    window.location.pathname.replace(/admin\/.*$/, 'public/index.html');
  return `${base}?n=${admin.negocioId}`;
}

function setupShareModal() {
  const modal   = $('#modal-share');
  const input   = $('#share-link');
  const qrBox   = $('#share-qr');

  const open = () => {
    const url = buildStoreURL();
    input.value = url;
    qrBox.innerHTML =
      `<img src="https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(url)}" alt="QR tienda" />`;
    modal.classList.remove('hidden');
  };
  const close = () => modal.classList.add('hidden');

  $('#btn-share-store').addEventListener('click', open);
  $('#overlay-share').addEventListener('click', close);
  $('#btn-close-share').addEventListener('click', close);

  $('#btn-copy-link').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(input.value);
      showToast('Enlace copiado ✅', 'success');
    } catch {
      input.select(); document.execCommand('copy');
      showToast('Enlace copiado', 'success');
    }
  });

  $('#btn-share-open').addEventListener('click', () => {
    window.open(input.value, '_blank');
  });

  $('#btn-share-whatsapp').addEventListener('click', () => {
    const nombre = admin.negocio?.nombre || 'nuestra tienda';
    const msg = `¡Hola! 👋 Hacé tus pedidos en ${nombre} desde acá: ${input.value}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
  });
}

} // end if PAGE_IS_DASH
