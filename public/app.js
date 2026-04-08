// ============================================================
// app.js — Módulo cliente público
// ============================================================
import { db } from '../firebase.js';
import {
  collection, addDoc, getDocs, query,
  orderBy, serverTimestamp, where
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ── Utilidades ────────────────────────────────────────────── //
const $  = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

// ── Detectar negocioId ────────────────────────────────────── //
function getNegocioId() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get('negocio') || params.get('n');
  if (!id) {
    const host = window.location.hostname;
    const sub  = host.split('.')[0];
    if (sub && sub !== 'www' && sub !== 'localhost') return sub;
  }
  return id || 'demo';
}

const NEGOCIO_ID = getNegocioId();

// ── Estado global ─────────────────────────────────────────── //
const state = {
  productos:   [],
  filtrados:   [],
  negocio:     null,
  categoria:   'all',
  searchQuery: '',
  carrito:     [],   // lista de {nombre, precio} seleccionados
};

// ── Toast ──────────────────────────────────────────────────── //
function showToast(msg, type = 'info', duration = 3500) {
  const container = $('#toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  const icons = { success: '✅', error: '❌', info: 'ℹ️' };
  toast.innerHTML = `<span>${icons[type] || ''}</span><span>${msg}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('removing');
    toast.addEventListener('animationend', () => toast.remove());
  }, duration);
}

// ── Loader ─────────────────────────────────────────────────── //
function hideLoader() {
  const loader = $('#global-loader');
  loader.classList.add('fade-out');
  setTimeout(() => loader.remove(), 500);
}

// ── Cargar datos del negocio ──────────────────────────────── //
async function loadNegocio() {
  try {
    const { doc, getDoc } = await import(
      "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js"
    );
    const snap = await getDoc(doc(db, 'negocios', NEGOCIO_ID));
    if (!snap.exists()) {
      showToast('Negocio no encontrado. Verificá el parámetro ?negocio=', 'error', 8000);
      return;
    }
    state.negocio = snap.data();
    renderNegocioInfo();
  } catch (e) {
    console.error('Error cargando negocio:', e);
  }
}

function renderNegocioInfo() {
  const n = state.negocio;
  if (!n) return;
  document.title = `${n.nombre} — Pedidos Online`;
  $('#header-name').textContent = n.nombre;
  if (n.telefono) $('#info-tel').innerHTML = `📞 ${n.telefono}`;
  if (n.direccion) $('#info-dir').innerHTML = `📍 ${n.direccion}`;
}

// ── Cargar promociones ────────────────────────────────────── //
async function loadPromociones() {
  try {
    const promoCol = collection(db, 'negocios', NEGOCIO_ID, 'promociones');
    const snap = await getDocs(promoCol);
    const activas = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(p => p.activo);

    if (!activas.length) return;

    const promo = activas[0];
    const banner = $('#promo-banner');
    $('#promo-title').textContent   = promo.titulo    || '¡Oferta especial!';
    $('#promo-subdesc').textContent = promo.descripcion || '';
    banner.classList.remove('hidden');

    const dismissed = sessionStorage.getItem(`promo_dismissed_${NEGOCIO_ID}`);
    if (!dismissed) {
      setTimeout(() => showPromoModal(promo), 1200);
    }

    $('#promo-close').addEventListener('click', () => {
      banner.classList.add('hidden');
    });
  } catch (e) {
    console.error('Error cargando promociones:', e);
  }
}

function showPromoModal(promo) {
  const modal = $('#promo-modal');
  $('#modal-title').textContent = promo.titulo     || '¡Promoción!';
  $('#modal-desc').textContent  = promo.descripcion || '';
  modal.classList.remove('hidden');

  const close = () => {
    modal.classList.add('hidden');
    sessionStorage.setItem(`promo_dismissed_${NEGOCIO_ID}`, '1');
  };
  $('#modal-close').onclick = close;
  $('#modal-cta').onclick   = close;
  modal.addEventListener('click', e => { if (e.target === modal) close(); });
}

// ── Cargar productos ──────────────────────────────────────── //
async function loadProductos() {
  try {
    const prodCol = collection(db, 'negocios', NEGOCIO_ID, 'productos');
    const q       = query(prodCol, orderBy('nombre'));
    const snap    = await getDocs(q);
    state.productos = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    applyFilters();
  } catch (e) {
    console.error('Error cargando productos:', e);
    showToast('Error al cargar los productos.', 'error');
  }
}

// ── Filtros ────────────────────────────────────────────────── //
function applyFilters() {
  let lista = [...state.productos];

  if (state.categoria !== 'all') {
    lista = lista.filter(p =>
      (p.categoria || '').toLowerCase() === state.categoria.toLowerCase()
    );
  }

  if (state.searchQuery.trim()) {
    const q = state.searchQuery.toLowerCase();
    lista = lista.filter(p =>
      (p.nombre || '').toLowerCase().includes(q) ||
      (p.descripcion || '').toLowerCase().includes(q)
    );
  }

  state.filtrados = lista;
  renderProductos();
}

// ── Render productos ───────────────────────────────────────── //
function renderProductos() {
  const grid = $('#products-grid');
  grid.innerHTML = '';

  if (!state.filtrados.length) {
    grid.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1">
        <div class="emoji">🥐</div>
        <h3>No encontramos productos</h3>
        <p>Probá con otra búsqueda o categoría.</p>
      </div>`;
    return;
  }

  state.filtrados.forEach(p => {
    const card = document.createElement('article');
    card.className = `product-card${p.disponible === false ? ' out-of-stock' : ''}`;
    card.dataset.id = p.id;

    // Marcar como selected si está en el carrito
    const enCarrito = state.carrito.some(c => c.id === p.id);
    if (enCarrito) card.classList.add('selected');

    const precio = typeof p.precio === 'number'
      ? `$${p.precio.toLocaleString('es-AR')}`
      : p.precio || '';

    const badgeClass = p.disponible !== false ? 'available' : 'unavailable';
    const badgeText  = p.disponible !== false ? '✅ Disponible' : '❌ Sin stock';

    const btnText = enCarrito ? 'Agregado ✓' : 'Pedir';

    card.innerHTML = `
      <div class="product-img-wrap">
        <img
          src="${p.imagen || 'https://via.placeholder.com/400x300/F5ECD8/6B4226?text=🍞'}"
          alt="${p.nombre}"
          loading="lazy"
        />
        <span class="stock-badge ${badgeClass}">${badgeText}</span>
      </div>
      <div class="product-info">
        <span class="product-category">${p.categoria || 'Panadería'}</span>
        <h3 class="product-name">${p.nombre}</h3>
        <p class="product-desc">${p.descripcion || ''}</p>
        <div class="product-footer">
          <span class="product-price">${precio}</span>
          <button
            class="btn-pedido"
            data-nombre="${p.nombre}"
            data-precio="${precio}"
            ${p.disponible === false ? 'disabled aria-disabled="true"' : ''}
          >
            ${p.disponible !== false ? btnText : 'Sin stock'}
          </button>
        </div>
      </div>`;

    card.querySelector('.btn-pedido')?.addEventListener('click', () => {
      prefillOrder(p);
    });

    grid.appendChild(card);
  });
}

// ── Carrito / Selección de productos ──────────────────────── //
function addToCarrito(producto) {
  const yaEsta = state.carrito.some(c => c.id === producto.id);
  if (yaEsta) return; // no duplicar

  const precio = typeof producto.precio === 'number'
    ? `$${producto.precio.toLocaleString('es-AR')}`
    : producto.precio || '';

  state.carrito.push({ id: producto.id, nombre: producto.nombre, precio });
  renderCarritoSummary();
}

function removeFromCarrito(id) {
  state.carrito = state.carrito.filter(c => c.id !== id);
  renderCarritoSummary();
  renderProductos(); // actualizar estado visual de las cards
}

function clearCarrito() {
  state.carrito = [];
  renderCarritoSummary();
  renderProductos();
  // Ocultar formulario y mostrar CTA
  toggleOrderSection(false);
  $('#f-pedido').value = '';
}

function renderCarritoSummary() {
  const summary  = $('#cart-summary');
  const listEl   = $('#cart-items-list');
  const orderSec = $('#order-section');
  const orderCta = $('#order-cta');

  if (!state.carrito.length) {
    summary.classList.add('hidden');
    toggleOrderSection(false);
    orderCta.classList.remove('hidden');
    return;
  }

  // Mostrar resumen
  summary.classList.remove('hidden');
  orderCta.classList.add('hidden');
  toggleOrderSection(true);

  listEl.innerHTML = state.carrito
    .map(c => `<span>${c.nombre} <small style="opacity:.65">${c.precio}</small></span>`)
    .join(' &nbsp;·&nbsp; ');

  // Sincronizar textarea del pedido
  syncPedidoTextarea();
}

function syncPedidoTextarea() {
  const ta = $('#f-pedido');
  // Construir líneas solo de los items del carrito
  const lineas = state.carrito.map(c => `${c.nombre} (${c.precio})`);
  // Preservar texto extra que el usuario haya escrito manualmente
  const existingLines = ta.value.split('\n').filter(l => l.trim());
  // Detectar líneas manuales (las que NO corresponden a ningún item del carrito)
  const carritoNombres = state.carrito.map(c => c.nombre);
  const manuales = existingLines.filter(l => {
    return !state.carrito.some(c => l.startsWith(c.nombre));
  });
  ta.value = [...lineas, ...manuales].join('\n');
}

function toggleOrderSection(visible) {
  const sec = $('#order-section');
  if (visible) {
    sec.classList.add('visible');
  } else {
    sec.classList.remove('visible');
  }
}

// ── Prellenar pedido desde producto ───────────────────────── //
function prefillOrder(producto) {
  addToCarrito(producto);

  // Marcar la card como selected
  const card = $(`[data-id="${producto.id}"]`);
  if (card) {
    card.classList.add('selected');
    const btn = card.querySelector('.btn-pedido');
    if (btn && producto.disponible !== false) btn.textContent = 'Agregado ✓';
  }

  // Scroll al formulario con un pequeño delay para la animación
  setTimeout(() => {
    document.getElementById('order-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 100);
}

// ── Repetir último pedido ──────────────────────────────────── //
function loadLastOrder() {
  const last = localStorage.getItem(`last_order_${NEGOCIO_ID}`);
  if (!last) { showToast('No hay ningún pedido guardado aún.', 'info'); return; }
  try {
    const data = JSON.parse(last);
    $('#f-nombre').value = data.nombre   || '';
    $('#f-tel').value    = data.telefono || '';
    $('#f-dir').value    = data.direccion || '';
    $('#f-pedido').value = data.pedido   || '';
    // Si el form estaba oculto, mostrarlo
    if (!$('#order-section').classList.contains('visible')) {
      toggleOrderSection(true);
      $('#order-cta').classList.add('hidden');
    }
    showToast('Último pedido cargado 🔁', 'success');
    document.getElementById('order-section').scrollIntoView({ behavior: 'smooth' });
  } catch {
    showToast('No se pudo cargar el pedido anterior.', 'error');
  }
}

// ── Validación del formulario ──────────────────────────────── //
const TEL_REGEX = /^[+]?[\d\s\-()]{7,20}$/;

function validateField(id, groupId, testFn) {
  const input = $(id);
  const group = $(groupId);
  const valid = testFn(input.value.trim());
  group.classList.toggle('has-error', !valid);
  return valid;
}

function validateForm() {
  const v1 = validateField('#f-nombre', '#fg-nombre', v => v.length >= 3);
  const v2 = validateField('#f-tel',    '#fg-tel',    v => TEL_REGEX.test(v));
  const v3 = validateField('#f-dir',    '#fg-dir',    v => v.length >= 5);
  const v4 = validateField('#f-pedido', '#fg-pedido', v => v.length >= 5);
  return v1 && v2 && v3 && v4;
}

// ── Enviar pedido ──────────────────────────────────────────── //
async function submitOrder(e) {
  e.preventDefault();
  if (!validateForm()) {
    showToast('Completá todos los campos correctamente.', 'error');
    return;
  }

  const nombre    = $('#f-nombre').value.trim();
  const telefono  = $('#f-tel').value.trim();
  const direccion = $('#f-dir').value.trim();
  const pedido    = $('#f-pedido').value.trim();

  const btnText    = $('#btn-text');
  const btnLoading = $('#btn-loading');
  const btnEnviar  = $('#btn-enviar');
  btnText.classList.add('hidden');
  btnLoading.classList.remove('hidden');
  btnEnviar.disabled = true;

  try {
    await addDoc(collection(db, 'negocios', NEGOCIO_ID, 'pedidos'), {
      nombre, telefono, direccion, pedido,
      estado: 'pendiente',
      createdAt: serverTimestamp(),
    });

    localStorage.setItem(`last_order_${NEGOCIO_ID}`, JSON.stringify(
      { nombre, telefono, direccion, pedido }
    ));

    const waMsg = encodeURIComponent(
      `🍞 *Nuevo pedido*\n\n` +
      `👤 *Nombre:* ${nombre}\n` +
      `📋 *Pedido:* ${pedido}\n` +
      `📍 *Dirección:* ${direccion}\n` +
      `📞 *Teléfono:* ${telefono}`
    );

    const waNum = (state.negocio?.telefono || '').replace(/\D/g, '');
    const waUrl = waNum
      ? `https://wa.me/${waNum}?text=${waMsg}`
      : `https://wa.me/?text=${waMsg}`;

    showToast('¡Pedido enviado! Redirigiendo a WhatsApp...', 'success');

    // Limpiar form y carrito
    $('#order-form').reset();
    state.carrito = [];
    renderCarritoSummary();
    renderProductos();

    setTimeout(() => { window.open(waUrl, '_blank'); }, 1000);

  } catch (err) {
    console.error('Error guardando pedido:', err);
    showToast('Hubo un error al guardar el pedido. Intentá de nuevo.', 'error');
  } finally {
    btnText.classList.remove('hidden');
    btnLoading.classList.add('hidden');
    btnEnviar.disabled = false;
  }
}

// ── Debounce ───────────────────────────────────────────────── //
function debounce(fn, delay = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

// ── Event Listeners ────────────────────────────────────────── //
function setupListeners() {
  // Búsqueda con debounce
  $('#search-input').addEventListener('input', debounce(e => {
    state.searchQuery = e.target.value;
    applyFilters();
  }, 280));

  // Filtros de categoría
  $$('.cat-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('.cat-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.categoria = btn.dataset.cat;
      applyFilters();
    });
  });

  // Formulario de pedido
  $('#order-form').addEventListener('submit', submitOrder);

  // Repetir último pedido
  $('#btn-repetir').addEventListener('click', loadLastOrder);

  // Limpiar carrito
  $('#btn-clear-cart').addEventListener('click', clearCarrito);

  // Año footer
  $('#year').textContent = new Date().getFullYear();
}

// ── Bootstrap ──────────────────────────────────────────────── //
async function init() {
  setupListeners();
  try {
    await Promise.all([
      loadNegocio(),
      loadProductos(),
      loadPromociones(),
    ]);
  } catch (e) {
    console.error('Error en inicialización:', e);
  } finally {
    hideLoader();
  }
}

init();
