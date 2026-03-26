const state = {
  token: localStorage.getItem('pp_token') || '',
  role: localStorage.getItem('pp_role') || '',
  module: localStorage.getItem('pp_module') || 'dashboard',
  brands: [],
  providers: [],
  products: [],
};

const el = {
  authPanel: document.getElementById('auth-panel'),
  modulesPanel: document.getElementById('modules-panel'),
  moduleDashboard: document.getElementById('module-dashboard'),
  modulePayments: document.getElementById('module-payments'),
  moduleBrands: document.getElementById('module-brands'),
  moduleVendors: document.getElementById('module-vendors'),
  moduleProducts: document.getElementById('module-products'),
  navButtons: document.querySelectorAll('.nav-btn'),
  navDashboard: document.getElementById('nav-dashboard'),
  navPayments: document.getElementById('nav-payments'),
  navBrands: document.getElementById('nav-brands'),
  navVendors: document.getElementById('nav-vendors'),
  navProducts: document.getElementById('nav-products'),
  adminPanel: document.getElementById('admin-panel'),
  sessionUser: document.getElementById('session-user'),
  logoutBtn: document.getElementById('logout-btn'),
  loginForm: document.getElementById('login-form'),
  registerForm: document.getElementById('register-form'),
  paymentForm: document.getElementById('payment-form'),
  uploadForm: document.getElementById('upload-form'),
  paymentTemplateBtn: document.getElementById('payment-template'),
  paymentsTable: document.querySelector('#payments-table tbody'),
  metrics: document.getElementById('metrics'),
  weeksList: document.getElementById('weeks-list'),
  providersList: document.getElementById('providers-list'),
  filterProvider: document.getElementById('filter-provider'),
  filterWeek: document.getElementById('filter-week'),
  filterStatus: document.getElementById('filter-status'),
  refreshBtn: document.getElementById('refresh-btn'),
  exportWeek: document.getElementById('export-week'),
  exportProvider: document.getElementById('export-provider'),
  itemsContainer: document.getElementById('items-container'),
  addItemBtn: document.getElementById('add-item-btn'),
  itemTemplate: document.getElementById('item-template'),
  providerSelect: document.getElementById('provider-select'),
  brandForm: document.getElementById('brand-form'),
  brandModal: document.getElementById('brand-modal'),
  brandOpen: document.getElementById('brand-open'),
  brandTable: document.querySelector('#brands-table tbody'),
  brandUploadForm: document.getElementById('brand-upload-form'),
  brandTemplateBtn: document.getElementById('brand-template'),
  vendorForm: document.getElementById('vendor-form'),
  vendorModal: document.getElementById('vendor-modal'),
  vendorOpen: document.getElementById('vendor-open'),
  vendorTable: document.querySelector('#vendors-table tbody'),
  vendorUploadForm: document.getElementById('vendor-upload-form'),
  vendorTemplateBtn: document.getElementById('vendor-template'),
  productForm: document.getElementById('product-form'),
  productModal: document.getElementById('product-modal'),
  productOpen: document.getElementById('product-open'),
  productTable: document.querySelector('#products-table tbody'),
  productUploadForm: document.getElementById('product-upload-form'),
  productTemplateBtn: document.getElementById('product-template'),
  brandSelect: document.getElementById('brand-select'),
};

const currencyFormatter = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP' });

function setSession(token, role) {
  state.token = token;
  state.role = role;
  if (token) {
    localStorage.setItem('pp_token', token);
    localStorage.setItem('pp_role', role || 'USER');
  } else {
    localStorage.removeItem('pp_token');
    localStorage.removeItem('pp_role');
  }
  updateUI();
}

function setActiveModule(moduleName) {
  state.module = moduleName;
  localStorage.setItem('pp_module', moduleName);
  el.moduleDashboard.style.display = moduleName === 'dashboard' ? 'block' : 'none';
  el.modulePayments.style.display = moduleName === 'payments' ? 'block' : 'none';
  el.moduleBrands.style.display = moduleName === 'brands' ? 'block' : 'none';
  el.moduleVendors.style.display = moduleName === 'vendors' ? 'block' : 'none';
  el.moduleProducts.style.display = moduleName === 'products' ? 'block' : 'none';
  el.navButtons.forEach((btn) => btn.classList.remove('active'));
  if (moduleName === 'dashboard') el.navDashboard.classList.add('active');
  if (moduleName === 'payments') el.navPayments.classList.add('active');
  if (moduleName === 'brands') el.navBrands.classList.add('active');
  if (moduleName === 'vendors') el.navVendors.classList.add('active');
  if (moduleName === 'products') el.navProducts.classList.add('active');
}

function updateUI() {
  const loggedIn = Boolean(state.token);
  const isAdmin = state.role === 'ADMIN';
  el.authPanel.style.display = loggedIn ? 'none' : 'block';
  el.modulesPanel.style.display = loggedIn ? 'block' : 'none';
  document.querySelector('.module-nav').style.display = loggedIn ? 'flex' : 'none';
  el.adminPanel.style.display = isAdmin ? 'block' : 'none';
  el.sessionUser.textContent = loggedIn ? `Sesión activa (${state.role || 'USER'})` : 'Sin sesión';

  [el.navBrands, el.navVendors, el.navProducts].forEach((btn) => {
    if (!btn) return;
    if (isAdmin) {
      btn.classList.remove('hidden');
    } else {
      btn.classList.add('hidden');
    }
  });

  if (loggedIn) {
    const adminModules = ['brands', 'vendors', 'products'];
    if (!isAdmin && adminModules.includes(state.module)) {
      state.module = 'dashboard';
    }
    setActiveModule(state.module);
  }
}

function openModal(modalEl) {
  if (!modalEl) return;
  modalEl.classList.add('open');
  modalEl.setAttribute('aria-hidden', 'false');
}

function closeModal(modalEl) {
  if (!modalEl) return;
  modalEl.classList.remove('open');
  modalEl.setAttribute('aria-hidden', 'true');
}

function bindModalDismiss(modalEl) {
  if (!modalEl) return;
  modalEl.addEventListener('click', (evt) => {
    if (evt.target === modalEl) {
      closeModal(modalEl);
    }
  });
}

async function apiFetch(path, options = {}) {
  const headers = options.headers || {};
  if (state.token) {
    headers['Authorization'] = `Bearer ${state.token}`;
  }
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  const response = await fetch(path, { ...options, headers });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    const message = data.error || 'Error en la solicitud';
    throw new Error(message);
  }
  return response;
}

function formatCurrency(value) {
  return currencyFormatter.format(Number(value || 0));
}

function uniqueList(values) {
  return [...new Set(values.filter(Boolean))];
}

function formatCompactList(values, limit = 3) {
  const items = uniqueList(values);
  if (!items.length) return '-';
  const slice = items.slice(0, limit);
  const text = slice.join(', ');
  return items.length > limit ? `${text} (+${items.length - limit})` : text;
}

function populateProviderSelect(selectEl) {
  if (!selectEl) return;
  const current = selectEl.value;
  selectEl.innerHTML = '<option value="">Selecciona proveedor</option>';
  state.providers.forEach((provider) => {
    const option = document.createElement('option');
    option.value = provider.id;
    option.textContent = provider.data_json.name;
    selectEl.appendChild(option);
  });
  if (current) selectEl.value = current;
}

function populateBrandSelect() {
  if (!el.brandSelect) return;
  const current = el.brandSelect.value;
  el.brandSelect.innerHTML = '<option value="">Sin marca</option>';
  state.brands.forEach((brand) => {
    const option = document.createElement('option');
    option.value = brand.id;
    option.textContent = brand.data_json.name;
    el.brandSelect.appendChild(option);
  });
  if (current) el.brandSelect.value = current;
}

function populateProductSelect(selectEl) {
  if (!selectEl) return;
  const current = selectEl.value;
  selectEl.innerHTML = '<option value="">Selecciona producto</option>';
  state.products.forEach((product) => {
    const option = document.createElement('option');
    option.value = product.id;
    option.textContent = product.data_json.label || product.data_json.description || product.data_json.sku || 'Producto';
    selectEl.appendChild(option);
  });
  if (current) selectEl.value = current;
}

function addItemRow(data = {}) {
  if (!el.itemTemplate) return;
  const row = el.itemTemplate.content.firstElementChild.cloneNode(true);
  const invoice = row.querySelector('[name="invoice"]');
  const productSelect = row.querySelector('[name="product_id"]');
  const amount = row.querySelector('[name="amount"]');

  populateProductSelect(productSelect);

  if (data.invoice) invoice.value = data.invoice;
  if (data.product_id) productSelect.value = data.product_id;
  if (data.amount) amount.value = data.amount;

  row.querySelector('.remove-item').addEventListener('click', () => {
    const rows = el.itemsContainer.querySelectorAll('.item-row');
    if (rows.length <= 1) {
      invoice.value = '';
      productSelect.value = '';
      amount.value = '';
      return;
    }
    row.remove();
  });

  el.itemsContainer.appendChild(row);
}

function getItemsFromForm() {
  const rows = [...el.itemsContainer.querySelectorAll('.item-row')];
  const items = rows.map((row) => {
    const invoice = row.querySelector('[name="invoice"]').value.trim();
    const productId = row.querySelector('[name="product_id"]').value;
    const amountValue = row.querySelector('[name="amount"]').value;
    return {
      invoice: invoice || null,
      product_id: productId || null,
      amount: Number(amountValue || 0),
    };
  }).filter((item) => item.product_id || item.amount);

  return items;
}

async function handleLogin(evt) {
  evt.preventDefault();
  const formData = new FormData(el.loginForm);
  const payload = Object.fromEntries(formData.entries());
  try {
    const response = await apiFetch('/login', { method: 'POST', body: JSON.stringify(payload) });
    const data = await response.json();
    setSession(data.token, data.role);
    await loadAll();
  } catch (error) {
    alert(error.message);
  }
}

async function handleRegister(evt) {
  evt.preventDefault();
  const formData = new FormData(el.registerForm);
  const payload = Object.fromEntries(formData.entries());
  try {
    const response = await apiFetch('/register', { method: 'POST', body: JSON.stringify(payload) });
    const data = await response.json();
    setSession(data.token, data.role);
    await loadAll();
  } catch (error) {
    alert(error.message);
  }
}

async function handleCreatePayment(evt) {
  evt.preventDefault();
  const formData = new FormData(el.paymentForm);
  const payload = Object.fromEntries(formData.entries());
  payload.items = getItemsFromForm();
  try {
    await apiFetch('/payments', { method: 'POST', body: JSON.stringify(payload) });
    el.paymentForm.reset();
    el.itemsContainer.innerHTML = '';
    addItemRow();
    await loadDashboard();
    setActiveModule('payments');
  } catch (error) {
    alert(error.message);
  }
}

async function handleUpload(evt) {
  evt.preventDefault();
  const formData = new FormData(el.uploadForm);
  try {
    await apiFetch('/payments/upload', { method: 'POST', body: formData });
    el.uploadForm.reset();
    await loadDashboard();
    setActiveModule('payments');
  } catch (error) {
    alert(error.message);
  }
}

async function handleBrandSubmit(evt) {
  evt.preventDefault();
  const formData = new FormData(el.brandForm);
  const payload = Object.fromEntries(formData.entries());
  const id = payload.id;
  delete payload.id;
  try {
    if (id) {
      await apiFetch(`/brands/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
    } else {
      await apiFetch('/brands', { method: 'POST', body: JSON.stringify(payload) });
    }
    clearBrandForm();
    await loadBrands();
    closeModal(el.brandModal);
  } catch (error) {
    alert(error.message);
  }
}

async function handleVendorSubmit(evt) {
  evt.preventDefault();
  const formData = new FormData(el.vendorForm);
  const payload = Object.fromEntries(formData.entries());
  const id = payload.id;
  delete payload.id;
  try {
    if (id) {
      await apiFetch(`/providers/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
    } else {
      await apiFetch('/providers', { method: 'POST', body: JSON.stringify(payload) });
    }
    clearVendorForm();
    await loadProviders();
    closeModal(el.vendorModal);
  } catch (error) {
    alert(error.message);
  }
}

async function handleProductSubmit(evt) {
  evt.preventDefault();
  const formData = new FormData(el.productForm);
  const payload = Object.fromEntries(formData.entries());
  const id = payload.id;
  delete payload.id;
  try {
    if (id) {
      await apiFetch(`/products/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
    } else {
      await apiFetch('/products', { method: 'POST', body: JSON.stringify(payload) });
    }
    clearProductForm();
    await loadProducts();
    closeModal(el.productModal);
  } catch (error) {
    alert(error.message);
  }
}

async function handleCatalogUpload(form, endpoint) {
  const formData = new FormData(form);
  await apiFetch(endpoint, { method: 'POST', body: formData });
  form.reset();
}

function clearBrandForm() {
  el.brandForm.reset();
  el.brandForm.querySelector('[name="id"]').value = '';
}

function clearVendorForm() {
  el.vendorForm.reset();
  el.vendorForm.querySelector('[name="id"]').value = '';
}

function clearProductForm() {
  el.productForm.reset();
  el.productForm.querySelector('[name="id"]').value = '';
}

async function loadAll() {
  await Promise.all([
    loadBrands(),
    loadProviders(),
    loadProducts(),
    loadDashboard(),
  ]);
}

async function loadBrands() {
  const response = await apiFetch('/brands');
  const brands = await response.json();
  state.brands = brands;
  populateBrandSelect();
  renderBrands(brands);
}

async function loadProviders() {
  const response = await apiFetch('/providers');
  const providers = await response.json();
  state.providers = providers;
  populateProviderSelect(el.filterProvider);
  populateProviderSelect(el.providerSelect);
  renderProvidersCatalog(providers);
}

async function loadProducts() {
  const response = await apiFetch('/products');
  const products = await response.json();
  state.products = products;
  const selects = el.itemsContainer.querySelectorAll('select[name="product_id"]');
  selects.forEach((selectEl) => populateProductSelect(selectEl));
  renderProductsCatalog(products);
}

async function loadWeeks() {
  const response = await apiFetch('/dashboard/weeks');
  const weeks = await response.json();
  el.filterWeek.innerHTML = '<option value="">Semana</option>';
  weeks.forEach((w) => {
    const option = document.createElement('option');
    option.value = w.week;
    option.textContent = `Semana ${w.week}`;
    el.filterWeek.appendChild(option);
  });
  renderWeeks(weeks);
}

async function loadSummary() {
  const response = await apiFetch('/dashboard/summary');
  const summary = await response.json();
  renderMetrics(summary);
  renderProviders(summary.total_by_provider || []);
}

async function loadPayments() {
  const params = new URLSearchParams();
  if (el.filterProvider.value) params.append('provider_id', el.filterProvider.value);
  if (el.filterWeek.value) params.append('week', el.filterWeek.value);
  if (el.filterStatus.value) params.append('status', el.filterStatus.value);
  const response = await apiFetch(`/payments?${params.toString()}`);
  const payments = await response.json();
  renderPayments(payments);
}

async function loadDashboard() {
  if (!state.token) return;
  updateUI();
  await Promise.all([
    loadWeeks(),
    loadSummary(),
    loadPayments(),
  ]);
}

function renderMetrics(summary) {
  el.metrics.innerHTML = '';
  const items = [
    { label: 'Total general', value: formatCurrency(summary.total_general) },
    { label: 'Semanas activas', value: summary.total_by_week.length },
    { label: 'Proveedores activos', value: summary.total_by_provider.length },
  ];
  items.forEach((item) => {
    const card = document.createElement('div');
    card.className = 'metric';
    card.innerHTML = `<span>${item.label}</span><strong>${item.value}</strong>`;
    el.metrics.appendChild(card);
  });
}

function renderWeeks(weeks) {
  el.weeksList.innerHTML = '';
  weeks.forEach((w) => {
    const li = document.createElement('li');
    li.innerHTML = `<span>Semana ${w.week}</span><span>${formatCurrency(w.total)}</span>`;
    el.weeksList.appendChild(li);
  });
}

function renderProviders(providers) {
  el.providersList.innerHTML = '';
  providers.forEach((p) => {
    const li = document.createElement('li');
    li.innerHTML = `<span>${p.provider_name || 'Sin proveedor'}</span><span>${formatCurrency(p.total)}</span>`;
    el.providersList.appendChild(li);
  });
}

function renderPayments(payments) {
  el.paymentsTable.innerHTML = '';
  payments.forEach((p) => {
    const data = p.data_json;
    const items = data.items || [];
    const invoices = items.length ? items.map((item) => item.invoice) : (data.invoices || []);
    let products = items.length ? items.map((item) => item.product_name) : (data.product_names || []);
    if (!products.length && data.product_name) products = [data.product_name];
    const tr = document.createElement('tr');
    const badgeClass = data.priority === 'Alta' ? 'high' : data.priority === 'Media' ? 'medium' : 'low';
    tr.innerHTML = `
      <td>${p.id}</td>
      <td>${data.provider_name || '-'}</td>
      <td>${formatCompactList(invoices)}</td>
      <td>${formatCompactList(products)}</td>
      <td>${data.date || '-'}</td>
      <td>${data.week || '-'}</td>
      <td>${formatCurrency(data.amount)}</td>
      <td><span class="badge ${badgeClass}">${data.priority}</span></td>
      <td>${data.status}</td>
      <td><button class="btn ghost" data-id="${p.id}" data-status="${data.status}">Cambiar</button></td>
    `;
    el.paymentsTable.appendChild(tr);
  });

  el.paymentsTable.querySelectorAll('button').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      const newStatus = btn.dataset.status === 'Pagado' ? 'Pendiente' : 'Pagado';
      try {
        await apiFetch(`/payments/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status: newStatus }) });
        await loadDashboard();
        setActiveModule('payments');
      } catch (error) {
        alert(error.message);
      }
    });
  });
}

function renderBrands(brands) {
  if (!el.brandTable) return;
  el.brandTable.innerHTML = '';
  brands.forEach((brand) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${brand.data_json.name}</td>
      <td>${brand.data_json.category || 'Normal'}</td>
      <td><button class="btn ghost small" data-id="${brand.id}">Editar</button></td>
    `;
    tr.querySelector('button').addEventListener('click', () => {
      el.brandForm.querySelector('[name="id"]').value = brand.id;
      el.brandForm.querySelector('[name="name"]').value = brand.data_json.name;
      el.brandForm.querySelector('[name="category"]').value = brand.data_json.category || 'Normal';
      openModal(el.brandModal);
    });
    el.brandTable.appendChild(tr);
  });
}

function renderProvidersCatalog(providers) {
  if (!el.vendorTable) return;
  el.vendorTable.innerHTML = '';
  providers.forEach((provider) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${provider.data_json.name}</td>
      <td>${provider.data_json.category || 'Normal'}</td>
      <td>${provider.data_json.status || 'Nacional'}</td>
      <td>${provider.data_json.type || 'Comercial'}</td>
      <td><button class="btn ghost small" data-id="${provider.id}">Editar</button></td>
    `;
    tr.querySelector('button').addEventListener('click', () => {
      el.vendorForm.querySelector('[name="id"]').value = provider.id;
      el.vendorForm.querySelector('[name="name"]').value = provider.data_json.name;
      el.vendorForm.querySelector('[name="category"]').value = provider.data_json.category || 'Normal';
      el.vendorForm.querySelector('[name="status"]').value = provider.data_json.status || 'Nacional';
      el.vendorForm.querySelector('[name="type"]').value = provider.data_json.type || 'Comercial';
      openModal(el.vendorModal);
    });
    el.vendorTable.appendChild(tr);
  });
}

function renderProductsCatalog(products) {
  if (!el.productTable) return;
  el.productTable.innerHTML = '';
  products.forEach((product) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${product.data_json.sku || '-'}</td>
      <td>${product.data_json.description || product.data_json.label || '-'}</td>
      <td>${product.data_json.brand_name || '-'}</td>
      <td>${product.data_json.category || 'Normal'}</td>
      <td><button class="btn ghost small" data-id="${product.id}">Editar</button></td>
    `;
    tr.querySelector('button').addEventListener('click', () => {
      el.productForm.querySelector('[name="id"]').value = product.id;
      el.productForm.querySelector('[name="sku"]').value = product.data_json.sku || '';
      el.productForm.querySelector('[name="upc"]').value = product.data_json.upc || '';
      el.productForm.querySelector('[name="brand_id"]').value = product.data_json.brand_id || '';
      el.productForm.querySelector('[name="description"]').value = product.data_json.description || '';
      el.productForm.querySelector('[name="product_type"]').value = product.data_json.product_type || 'PUSH';
      el.productForm.querySelector('[name="channel"]').value = product.data_json.channel || 'Omnicanal';
      el.productForm.querySelector('[name="category"]').value = product.data_json.category || 'Normal';
      openModal(el.productModal);
    });
    el.productTable.appendChild(tr);
  });
}

async function downloadFile(url, filename) {
  try {
    const response = await apiFetch(url, { method: 'GET' });
    const blob = await response.blob();
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
  } catch (error) {
    alert(error.message);
  }
}

el.loginForm.addEventListener('submit', handleLogin);
el.registerForm.addEventListener('submit', handleRegister);
if (el.paymentForm) {
  el.paymentForm.addEventListener('submit', handleCreatePayment);
}
if (el.uploadForm) {
  el.uploadForm.addEventListener('submit', handleUpload);
}
if (el.paymentTemplateBtn) {
  el.paymentTemplateBtn.addEventListener('click', () => downloadFile('/templates/payments', 'template_pagos.xlsx'));
}

if (el.brandForm) {
  el.brandForm.addEventListener('submit', handleBrandSubmit);
  if (el.brandOpen) {
    el.brandOpen.addEventListener('click', () => {
      clearBrandForm();
      openModal(el.brandModal);
    });
  }
  el.brandUploadForm.addEventListener('submit', async (evt) => {
    evt.preventDefault();
    try {
      await handleCatalogUpload(el.brandUploadForm, '/brands/upload');
      await loadBrands();
    } catch (error) {
      alert(error.message);
    }
  });
  el.brandTemplateBtn.addEventListener('click', () => downloadFile('/templates/brands', 'template_marcas.xlsx'));
}

if (el.vendorForm) {
  el.vendorForm.addEventListener('submit', handleVendorSubmit);
  if (el.vendorOpen) {
    el.vendorOpen.addEventListener('click', () => {
      clearVendorForm();
      openModal(el.vendorModal);
    });
  }
  el.vendorUploadForm.addEventListener('submit', async (evt) => {
    evt.preventDefault();
    try {
      await handleCatalogUpload(el.vendorUploadForm, '/providers/upload');
      await loadProviders();
    } catch (error) {
      alert(error.message);
    }
  });
  el.vendorTemplateBtn.addEventListener('click', () => downloadFile('/templates/providers', 'template_proveedores.xlsx'));
}

if (el.productForm) {
  el.productForm.addEventListener('submit', handleProductSubmit);
  if (el.productOpen) {
    el.productOpen.addEventListener('click', () => {
      clearProductForm();
      openModal(el.productModal);
    });
  }
  el.productUploadForm.addEventListener('submit', async (evt) => {
    evt.preventDefault();
    try {
      await handleCatalogUpload(el.productUploadForm, '/products/upload');
      await loadProducts();
    } catch (error) {
      alert(error.message);
    }
  });
  el.productTemplateBtn.addEventListener('click', () => downloadFile('/templates/products', 'template_productos.xlsx'));
}

el.refreshBtn.addEventListener('click', loadDashboard);
el.filterProvider.addEventListener('change', loadPayments);
el.filterWeek.addEventListener('change', loadPayments);
el.filterStatus.addEventListener('change', loadPayments);

el.exportWeek.addEventListener('click', () => downloadFile('/exports/weeks', 'reporte_semanas.csv'));
el.exportProvider.addEventListener('click', () => downloadFile('/exports/providers', 'reporte_proveedores.csv'));

el.logoutBtn.addEventListener('click', () => {
  setSession('', '');
});

el.navDashboard.addEventListener('click', () => setActiveModule('dashboard'));
el.navPayments.addEventListener('click', () => setActiveModule('payments'));
el.navBrands.addEventListener('click', () => setActiveModule('brands'));
el.navVendors.addEventListener('click', () => setActiveModule('vendors'));
el.navProducts.addEventListener('click', () => setActiveModule('products'));

document.querySelectorAll('.modal-close, .modal-cancel').forEach((btn) => {
  btn.addEventListener('click', () => {
    const modalId = btn.getAttribute('data-modal');
    if (!modalId) return;
    closeModal(document.getElementById(modalId));
  });
});

bindModalDismiss(el.brandModal);
bindModalDismiss(el.vendorModal);
bindModalDismiss(el.productModal);

if (el.addItemBtn) {
  el.addItemBtn.addEventListener('click', () => addItemRow());
}

updateUI();
addItemRow();
if (state.token) {
  loadAll().catch(() => {
    setSession('', '');
  });
}
