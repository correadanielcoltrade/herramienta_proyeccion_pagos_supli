const state = {
  token: localStorage.getItem('pp_token') || '',
  role: localStorage.getItem('pp_role') || '',
  module: localStorage.getItem('pp_module') || 'dashboard',
  brands: [],
  providers: [],
  products: [],
  users: [],
  pagination: {},
};

const el = {
  authPanel: document.getElementById('auth-panel'),
  modulesPanel: document.getElementById('modules-panel'),
  moduleDashboard: document.getElementById('module-dashboard'),
  modulePayments: document.getElementById('module-payments'),
  moduleBrands: document.getElementById('module-brands'),
  moduleVendors: document.getElementById('module-vendors'),
  moduleProducts: document.getElementById('module-products'),
  moduleUsers: document.getElementById('module-users'),
  navButtons: document.querySelectorAll('.nav-btn'),
  navDashboard: document.getElementById('nav-dashboard'),
  navPayments: document.getElementById('nav-payments'),
  navBrands: document.getElementById('nav-brands'),
  navVendors: document.getElementById('nav-vendors'),
  navProducts: document.getElementById('nav-products'),
  navUsers: document.getElementById('nav-users'),
  adminPanel: document.getElementById('admin-panel'),
  sessionUser: document.getElementById('session-user'),
  logoutBtn: document.getElementById('logout-btn'),
  loginForm: document.getElementById('login-form'),
  forgotForm: document.getElementById('forgot-form'),
  resetForm: document.getElementById('reset-form'),
  changePasswordForm: document.getElementById('change-password-form'),
  forgotHint: document.getElementById('forgot-hint'),
  resetHint: document.getElementById('reset-hint'),
  changePasswordHint: document.getElementById('change-password-hint'),
  paymentForm: document.getElementById('payment-form'),
  paymentModal: document.getElementById('payment-modal'),
  paymentModalTitle: document.getElementById('payment-modal-title'),
  paymentOpen: document.getElementById('payment-open'),
  addOrderBtn: document.getElementById('add-order-btn'),
  uploadForm: document.getElementById('upload-form'),
  paymentTemplateBtn: document.getElementById('payment-template'),
  paymentsTable: document.querySelector('#payments-table tbody'),
  paymentsSelectAll: document.getElementById('payments-select-all'),
  paymentsBulkDelete: document.getElementById('payments-bulk-delete'),
  metrics: document.getElementById('metrics'),
  weeksList: document.getElementById('weeks-list'),
  providersList: document.getElementById('providers-list'),
  ganttChart: document.getElementById('gantt-chart'),
  ganttExportWeek: document.getElementById('gantt-export-week'),
  ganttPaymentTypeFilter: document.getElementById('gantt-payment-type-filter'),
  ganttExportBtn: document.getElementById('gantt-export-btn'),
  dashboardPivotBody: document.getElementById('dashboard-pivot-body'),
  filterProvider: document.getElementById('filter-provider'),
  filterWeek: document.getElementById('filter-week'),
  filterStatus: document.getElementById('filter-status'),
  refreshBtn: document.getElementById('refresh-btn'),
  exportWeek: document.getElementById('export-week'),
  exportProvider: document.getElementById('export-provider'),
  providerSelect: document.getElementById('provider-select'),
  brandForm: document.getElementById('brand-form'),
  brandModal: document.getElementById('brand-modal'),
  brandOpen: document.getElementById('brand-open'),
  brandSelectAll: document.getElementById('brand-select-all'),
  brandBulkDelete: document.getElementById('brand-bulk-delete'),
  brandFilterCategory: document.getElementById('brand-filter-category'),
  brandExport: document.getElementById('brand-export'),
  brandTable: document.querySelector('#brands-table tbody'),
  brandUploadForm: document.getElementById('brand-upload-form'),
  brandTemplateBtn: document.getElementById('brand-template'),
  vendorForm: document.getElementById('vendor-form'),
  vendorModal: document.getElementById('vendor-modal'),
  vendorOpen: document.getElementById('vendor-open'),
  vendorSelectAll: document.getElementById('vendor-select-all'),
  vendorBulkDelete: document.getElementById('vendor-bulk-delete'),
  vendorFilterCategory: document.getElementById('vendor-filter-category'),
  vendorExport: document.getElementById('vendor-export'),
  vendorTable: document.querySelector('#vendors-table tbody'),
  vendorUploadForm: document.getElementById('vendor-upload-form'),
  vendorTemplateBtn: document.getElementById('vendor-template'),
  productForm: document.getElementById('product-form'),
  productModal: document.getElementById('product-modal'),
  productOpen: document.getElementById('product-open'),
  productSelectAll: document.getElementById('product-select-all'),
  productBulkDelete: document.getElementById('product-bulk-delete'),
  productFilterCategory: document.getElementById('product-filter-category'),
  productExport: document.getElementById('product-export'),
  productTable: document.querySelector('#products-table tbody'),
  productUploadForm: document.getElementById('product-upload-form'),
  productTemplateBtn: document.getElementById('product-template'),
  brandSelect: document.getElementById('brand-select'),
  userForm: document.getElementById('user-form'),
  usersTable: document.querySelector('#users-table tbody'),
  usersRefresh: document.getElementById('users-refresh'),
  userEditModal: document.getElementById('user-edit-modal'),
  userEditForm: document.getElementById('user-edit-form'),
  userEditHint: document.getElementById('user-edit-hint'),
  brandSearch: document.getElementById('brands-search'),
  vendorSearch: document.getElementById('vendors-search'),
  productSearch: document.getElementById('products-search'),
  userSearch: document.getElementById('users-search'),
  paymentSearch: document.getElementById('payments-search'),
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
  if (el.moduleUsers) {
    el.moduleUsers.style.display = moduleName === 'users' ? 'block' : 'none';
  }
  el.navButtons.forEach((btn) => btn.classList.remove('active'));
  if (moduleName === 'dashboard') el.navDashboard.classList.add('active');
  if (moduleName === 'payments') el.navPayments.classList.add('active');
  if (moduleName === 'brands') el.navBrands.classList.add('active');
  if (moduleName === 'vendors') el.navVendors.classList.add('active');
  if (moduleName === 'products') el.navProducts.classList.add('active');
  if (moduleName === 'users' && el.navUsers) el.navUsers.classList.add('active');
}

function updateUI() {
  const loggedIn = Boolean(state.token);
  const isAdmin = state.role === 'ADMIN';
  el.authPanel.style.display = loggedIn ? 'none' : 'block';
  el.modulesPanel.style.display = loggedIn ? 'block' : 'none';
  document.querySelector('.module-nav').style.display = loggedIn ? 'flex' : 'none';
  if (el.adminPanel) {
    el.adminPanel.style.display = isAdmin ? 'block' : 'none';
  }
  el.sessionUser.textContent = loggedIn ? `Sesión activa (${state.role || 'USER'})` : 'Sin sesión';

  document.querySelectorAll('[data-admin-only="true"]').forEach((element) => {
    element.style.display = isAdmin ? '' : 'none';
  });

  const navAll = [el.navPayments, el.navBrands, el.navVendors, el.navProducts, el.navUsers];
  navAll.forEach((btn) => {
    if (!btn) return;
    if (isAdmin) {
      btn.classList.remove('hidden');
    } else {
      btn.classList.add('hidden');
    }
  });

  if (loggedIn) {
    const adminModules = ['brands', 'vendors', 'products', 'users'];
    if (!isAdmin) {
      state.module = 'dashboard';
    } else if (adminModules.includes(state.module)) {
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
  if (modalEl.contains(document.activeElement)) {
    document.activeElement.blur();
  }
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
  const response = await fetch(path, { ...options, headers, cache: 'no-store' });
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

function getPaginationState(tableId) {
  if (!state.pagination[tableId]) {
    state.pagination[tableId] = { page: 1, size: 10 };
  }
  return state.pagination[tableId];
}

function ensurePagination(tableId) {
  const footer = document.querySelector(`.table-footer[data-table="${tableId}"]`);
  if (!footer) return;
  if (footer.dataset.bound) return;

  footer.innerHTML = `
    <div class="pagination">
      <div class="pagination-info" data-role="info"></div>
      <div class="pagination-controls">
        <span>Filas</span>
        <select data-role="size">
          <option value="10">10</option>
          <option value="25">25</option>
          <option value="50">50</option>
          <option value="100">100</option>
        </select>
        <button type="button" class="btn ghost small" data-role="prev">Anterior</button>
        <span data-role="page"></span>
        <button type="button" class="btn ghost small" data-role="next">Siguiente</button>
      </div>
    </div>
  `;

  const sizeSelect = footer.querySelector('[data-role="size"]');
  const prevBtn = footer.querySelector('[data-role="prev"]');
  const nextBtn = footer.querySelector('[data-role="next"]');

  sizeSelect.addEventListener('change', () => {
    const pagination = getPaginationState(tableId);
    pagination.size = Number(sizeSelect.value || 10);
    pagination.page = 1;
    applyPagination(tableId);
  });

  prevBtn.addEventListener('click', () => {
    const pagination = getPaginationState(tableId);
    if (pagination.page > 1) {
      pagination.page -= 1;
      applyPagination(tableId);
    }
  });

  nextBtn.addEventListener('click', () => {
    const pagination = getPaginationState(tableId);
    pagination.page += 1;
    applyPagination(tableId);
  });

  footer.dataset.bound = 'true';
}

function applyPagination(tableId) {
  const table = document.getElementById(tableId);
  if (!table) return;
  const tbody = table.querySelector('tbody');
  if (!tbody) return;

  ensurePagination(tableId);
  const footer = document.querySelector(`.table-footer[data-table="${tableId}"]`);
  if (!footer) return;

  const pagination = getPaginationState(tableId);
  // :scope > tr — only direct children of tbody, avoids counting <tr> inside nested sub-tables
  const rows = [...tbody.querySelectorAll(':scope > tr')].filter((r) => !r.dataset.paginationSkip);
  const visibleRows = rows.filter((row) => row.dataset.filtered !== 'true');
  const total = visibleRows.length;
  const size = pagination.size || 10;
  const totalPages = Math.max(1, Math.ceil(total / size));
  if (pagination.page > totalPages) pagination.page = totalPages;
  if (pagination.page < 1) pagination.page = 1;

  const start = (pagination.page - 1) * size;
  const end = start + size;

  rows.forEach((row) => {
    if (row.dataset.filtered === 'true') {
      row.style.display = 'none';
      const next = row.nextElementSibling;
      if (next && next.dataset.paginationSkip) next.style.display = 'none';
    }
  });
  visibleRows.forEach((row, index) => {
    const show = index >= start && index < end;
    row.style.display = show ? '' : 'none';
    const next = row.nextElementSibling;
    if (next && next.dataset.paginationSkip && !show) {
      next.style.display = 'none';
    }
  });

  const info = footer.querySelector('[data-role="info"]');
  const pageLabel = footer.querySelector('[data-role="page"]');
  const sizeSelect = footer.querySelector('[data-role="size"]');
  const prevBtn = footer.querySelector('[data-role="prev"]');
  const nextBtn = footer.querySelector('[data-role="next"]');

  if (sizeSelect) sizeSelect.value = String(size);

  const from = total === 0 ? 0 : start + 1;
  const to = Math.min(end, total);
  if (info) info.textContent = `Mostrando ${from}-${to} de ${total}`;
  if (pageLabel) pageLabel.textContent = `Pagina ${pagination.page} / ${totalPages}`;

  if (prevBtn) prevBtn.disabled = pagination.page <= 1;
  if (nextBtn) nextBtn.disabled = pagination.page >= totalPages;
}

function applyTableSearch(tableId, query) {
  const table = document.getElementById(tableId);
  if (!table) return;
  const tbody = table.querySelector('tbody');
  if (!tbody) return;
  const term = String(query || '').trim().toLowerCase();
  // :scope > tr — only direct children, avoids nested sub-table rows
  const rows = [...tbody.querySelectorAll(':scope > tr')].filter((r) => !r.dataset.paginationSkip);

  rows.forEach((row) => {
    if (!term) {
      delete row.dataset.filtered;
      return;
    }
    const haystack = row.textContent.toLowerCase();
    if (haystack.includes(term)) {
      delete row.dataset.filtered;
    } else {
      row.dataset.filtered = 'true';
    }
  });

  const pagination = getPaginationState(tableId);
  pagination.page = 1;
  applyPagination(tableId);
}

function bindTableSearch(inputEl, tableId) {
  if (!inputEl) return;
  if (inputEl.dataset.bound) return;
  inputEl.addEventListener('input', () => {
    applyTableSearch(tableId, inputEl.value);
  });
  inputEl.dataset.bound = 'true';
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

function initProductCombobox(row, selectEl) {
  if (!row || !selectEl) return;
  const wrapper = row.querySelector('[data-product-combobox]');
  if (!wrapper || wrapper.dataset.bound) return;
  const input = wrapper.querySelector('.product-combobox-input');
  const list = wrapper.querySelector('.product-combobox-list');
  if (!input || !list) return;

  const buildList = () => {
    list.innerHTML = '';
    const options = [...selectEl.options].slice(1);
    options.forEach((option) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'product-combobox-option';
      btn.dataset.value = option.value;
      btn.textContent = option.textContent;
      list.appendChild(btn);
    });
  };

  const syncInput = () => {
    const selected = selectEl.selectedIndex > 0 ? selectEl.options[selectEl.selectedIndex].textContent : '';
    input.value = selected || '';
  };

  const filterList = () => {
    const term = input.value.trim().toLowerCase();
    let visible = 0;
    list.querySelectorAll('.product-combobox-option').forEach((btn) => {
      const show = !term || btn.textContent.toLowerCase().includes(term);
      btn.hidden = !show;
      if (show) visible += 1;
    });
    return { visible, term };
  };

  const openList = () => {
    wrapper.classList.add('open');
    list.hidden = false;
  };

  const closeList = () => {
    wrapper.classList.remove('open');
    list.hidden = true;
  };

  buildList();
  syncInput();
  closeList();

  input.addEventListener('input', () => {
    const result = filterList();
    if (!result.term) {
      closeList();
      return;
    }
    if (result.visible > 0) {
      openList();
    } else {
      closeList();
    }
  });

  list.addEventListener('click', (event) => {
    const btn = event.target.closest('.product-combobox-option');
    if (!btn) return;
    selectEl.value = btn.dataset.value;
    syncInput();
    closeList();
  });

  document.addEventListener('click', (event) => {
    if (!wrapper.contains(event.target)) closeList();
  });

  selectEl.addEventListener('change', syncInput);

  wrapper.dataset.bound = 'true';
}


function showToast(message, type = 'success') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ'}</span>
    <span class="toast-message">${message}</span>
  `;
  container.appendChild(toast);
  // Trigger animation
  requestAnimationFrame(() => toast.classList.add('toast-visible'));
  setTimeout(() => {
    toast.classList.remove('toast-visible');
    toast.addEventListener('transitionend', () => toast.remove(), { once: true });
  }, 4000);
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
