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
  paymentPivotHeader: document.getElementById('payment-pivot-header'),
  paymentPivotBody: document.getElementById('payment-pivot-body'),
  paymentAddProductBtn: document.getElementById('payment-add-product'),
  paymentAddInvoiceBtn: document.getElementById('payment-add-invoice'),
  paymentResetPivotBtn: document.getElementById('payment-reset-pivot'),
  paymentPivotGrand: document.getElementById('payment-pivot-grand'),
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
  ganttExportBtn: document.getElementById('gantt-export-btn'),
  dashboardPivotBody: document.getElementById('dashboard-pivot-body'),
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
  brandSelectAll: document.getElementById('brand-select-all'),
  brandBulkDelete: document.getElementById('brand-bulk-delete'),
  brandTable: document.querySelector('#brands-table tbody'),
  brandUploadForm: document.getElementById('brand-upload-form'),
  brandTemplateBtn: document.getElementById('brand-template'),
  vendorForm: document.getElementById('vendor-form'),
  vendorModal: document.getElementById('vendor-modal'),
  vendorOpen: document.getElementById('vendor-open'),
  vendorSelectAll: document.getElementById('vendor-select-all'),
  vendorBulkDelete: document.getElementById('vendor-bulk-delete'),
  vendorTable: document.querySelector('#vendors-table tbody'),
  vendorUploadForm: document.getElementById('vendor-upload-form'),
  vendorTemplateBtn: document.getElementById('vendor-template'),
  productForm: document.getElementById('product-form'),
  productModal: document.getElementById('product-modal'),
  productOpen: document.getElementById('product-open'),
  productSelectAll: document.getElementById('product-select-all'),
  productBulkDelete: document.getElementById('product-bulk-delete'),
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
  const rows = [...tbody.querySelectorAll('tr')];
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
    }
  });
  visibleRows.forEach((row, index) => {
    row.style.display = index >= start && index < end ? '' : 'none';
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
  const rows = [...tbody.querySelectorAll('tr')];

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

function hasPaymentPivot() {
  return Boolean(el.paymentPivotHeader && el.paymentPivotBody);
}

function getPaymentPivotProductHeaders() {
  if (!hasPaymentPivot()) return [];
  return [...el.paymentPivotHeader.querySelectorAll('.pivot-product')];
}

function updatePaymentPivotTotals() {
  if (!hasPaymentPivot()) return;
  let grandTotal = 0;
  const rows = [...el.paymentPivotBody.querySelectorAll('tr')];
  rows.forEach((row) => {
    let rowTotal = 0;
    row.querySelectorAll('.pivot-amount-input').forEach((input) => {
      const value = Number(input.value || 0);
      if (!Number.isNaN(value)) {
        rowTotal += value;
      }
    });
    const totalEl = row.querySelector('.pivot-total-value');
    if (totalEl) {
      totalEl.textContent = formatCurrency(rowTotal);
    }
    grandTotal += rowTotal;
  });
  if (el.paymentPivotGrand) {
    el.paymentPivotGrand.textContent = formatCurrency(grandTotal);
  }
}

function addPaymentPivotProduct(data = {}) {
  if (!hasPaymentPivot()) return;
  const totalTh = el.paymentPivotHeader.querySelector('.pivot-total');
  if (!totalTh) return;

  const th = document.createElement('th');
  th.className = 'pivot-product';
  th.innerHTML = `
    <div class="pivot-product-head">
      <select class="pivot-product-select" required>
        <option value="">Producto</option>
      </select>
      <button type="button" class="btn ghost small pivot-remove-col">Quitar</button>
    </div>
  `;

  const select = th.querySelector('.pivot-product-select');
  populateProductSelect(select);
  if (data.product_id) {
    select.value = data.product_id;
  }

  th.querySelector('.pivot-remove-col').addEventListener('click', () => {
    const headers = getPaymentPivotProductHeaders();
    if (headers.length <= 1) {
      select.value = '';
      updatePaymentPivotTotals();
      return;
    }
    const index = headers.indexOf(th);
    if (index < 0) return;
    th.remove();
    const rows = [...el.paymentPivotBody.querySelectorAll('tr')];
    rows.forEach((row) => {
      const cells = row.querySelectorAll('.pivot-product-cell');
      if (cells[index]) {
        cells[index].remove();
      }
    });
    updatePaymentPivotTotals();
  });

  el.paymentPivotHeader.insertBefore(th, totalTh);

  const rows = [...el.paymentPivotBody.querySelectorAll('tr')];
  rows.forEach((row) => {
    const totalCell = row.querySelector('.pivot-total-cell');
    if (!totalCell) return;
    const td = document.createElement('td');
    td.className = 'pivot-product-cell';
    td.innerHTML = '<input type="number" min="0" step="0.01" class="pivot-amount-input">';
    td.querySelector('input').addEventListener('input', updatePaymentPivotTotals);
    row.insertBefore(td, totalCell);
  });
}

function addPaymentPivotInvoice(data = {}) {
  if (!hasPaymentPivot()) return;
  const productHeaders = getPaymentPivotProductHeaders();
  const row = document.createElement('tr');
  row.innerHTML = `
    <td class="pivot-invoice">
      <input type="text" class="pivot-invoice-input" placeholder="Factura">
    </td>
    ${productHeaders.map(() => '<td class="pivot-product-cell"><input type="number" min="0" step="0.01" class="pivot-amount-input"></td>').join('')}
    <td class="pivot-total-cell"><span class="pivot-total-value">0</span></td>
    <td class="pivot-actions-cell"><button type="button" class="btn ghost small pivot-remove-row">Quitar</button></td>
  `;

  if (data.invoice) {
    row.querySelector('.pivot-invoice-input').value = data.invoice;
  }

  row.querySelectorAll('.pivot-amount-input').forEach((input) => {
    input.addEventListener('input', updatePaymentPivotTotals);
  });

  row.querySelector('.pivot-remove-row').addEventListener('click', () => {
    const rows = el.paymentPivotBody.querySelectorAll('tr');
    if (rows.length <= 1) {
      row.querySelector('.pivot-invoice-input').value = '';
      row.querySelectorAll('.pivot-amount-input').forEach((input) => {
        input.value = '';
      });
      updatePaymentPivotTotals();
      return;
    }
    row.remove();
    updatePaymentPivotTotals();
  });

  el.paymentPivotBody.appendChild(row);
  updatePaymentPivotTotals();
}

function resetPaymentPivot() {
  if (!hasPaymentPivot()) return;
  const headers = getPaymentPivotProductHeaders();
  headers.forEach((header) => header.remove());
  el.paymentPivotBody.innerHTML = '';
  addPaymentPivotProduct();
  addPaymentPivotInvoice();
  updatePaymentPivotTotals();
}

function addItemRow(data = {}) {
  if (!el.itemTemplate || !el.itemsContainer) return;
  const row = el.itemTemplate.content.firstElementChild.cloneNode(true);
  const invoice = row.querySelector('[name="invoice"]');
  const productSelect = row.querySelector('[name="product_id"]');
  const quantity = row.querySelector('[name="quantity"]');
  const dueDate = row.querySelector('[name="due_date"]');

  populateProductSelect(productSelect);
  initProductCombobox(row, productSelect);

  if (data.invoice) invoice.value = data.invoice;
  if (data.product_id) {
    productSelect.value = data.product_id;
    productSelect.dispatchEvent(new Event('change'));
  }
  if (data.quantity) quantity.value = data.quantity;
  if (data.due_date) dueDate.value = data.due_date;

  row.querySelector('.remove-item').addEventListener('click', () => {
    const rows = el.itemsContainer.querySelectorAll('.item-row');
    if (rows.length <= 1) {
      invoice.value = '';
      productSelect.value = '';
      quantity.value = '';
      dueDate.value = '';
      return;
    }
    row.remove();
  });

  el.itemsContainer.appendChild(row);
}

function getItemsFromForm() {
  if (hasPaymentPivot()) {
    const headers = getPaymentPivotProductHeaders();
    if (!headers.length) return [];
    const productIds = headers.map((header) => header.querySelector('.pivot-product-select').value);
    const rows = [...el.paymentPivotBody.querySelectorAll('tr')];
    let missingInvoice = false;
    let missingProduct = false;
    const items = [];

    rows.forEach((row) => {
      const invoice = row.querySelector('.pivot-invoice-input').value.trim();
      const amounts = row.querySelectorAll('.pivot-amount-input');
      amounts.forEach((input, index) => {
        const amount = Number(input.value || 0);
        if (!amount) return;
        const productId = productIds[index];
        if (!invoice) missingInvoice = true;
        if (!productId) missingProduct = true;
        items.push({
          invoice: invoice || null,
          product_id: productId || null,
          amount,
        });
      });
    });

    if (missingInvoice) {
      throw new Error('Ingresa la factura para cada fila con montos.');
    }
    if (missingProduct) {
      throw new Error('Selecciona un producto para cada columna con montos.');
    }
    return items;
  }

  if (!el.itemsContainer) return [];
  const rows = [...el.itemsContainer.querySelectorAll('.item-row')];
  let missingInvoice = false;
  let missingProduct = false;
  let missingQuantity = false;
  const items = [];

  rows.forEach((row) => {
    const invoice = row.querySelector('[name="invoice"]').value.trim();
    const productId = row.querySelector('[name="product_id"]').value;
    const quantityValue = row.querySelector('[name="quantity"]').value;
    const dueDate = row.querySelector('[name="due_date"]').value;
    const hasData = invoice || productId || quantityValue || dueDate;
    if (!hasData) return;

    if (!invoice) missingInvoice = true;
    if (!productId) missingProduct = true;
    if (!quantityValue) missingQuantity = true;

    const quantity = Number(quantityValue || 0);
    const safeQuantity = Number.isNaN(quantity) ? 0 : quantity;
    items.push({
      invoice: invoice || null,
      product_id: productId || null,
      quantity: safeQuantity,
      due_date: dueDate || null,
      amount: safeQuantity,
    });
  });

  if (missingInvoice) {
    throw new Error('Ingresa la factura para cada fila usada.');
  }
  if (missingProduct) {
    throw new Error('Selecciona un producto para cada fila usada.');
  }
  if (missingQuantity) {
    throw new Error('Ingresa la cantidad para cada fila usada.');
  }

  return items;
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
