function updatePurchaseGrandTotal() {
  if (!el.purchaseItemsContainer) return;
  let total = 0;
  el.purchaseItemsContainer.querySelectorAll('.purchase-item-row').forEach((row) => {
    total += Number(row.dataset.lineTotal || 0);
  });
  const totalEl = document.getElementById('purchase-grand-total');
  if (totalEl) totalEl.textContent = formatCurrency(total);
}

function updatePurchaseLineTotal(row) {
  if (!row) return;
  const qty = Number(row.querySelector('.purchase-qty')?.value || 0);
  const unit = Number(row.querySelector('.purchase-unit')?.value || 0);
  const total = qty * unit;
  row.dataset.lineTotal = String(total || 0);
  const totalInput = row.querySelector('.purchase-line-total');
  if (totalInput) totalInput.value = formatCurrency(total);
  updatePurchaseGrandTotal();
}

function getProductById(id) {
  return state.products.find((p) => String(p.id) === String(id));
}

function _selectBrandByName(selectEl, brandName) {
  if (!selectEl || !brandName) return;
  const name = brandName.trim().toLowerCase();
  const option = [...selectEl.options].find((opt) => opt.textContent.trim().toLowerCase() === name);
  if (option) selectEl.value = option.value;
}

function applyProductToRow(row, product) {
  if (!row || !product) return;
  const data = product.data_json || {};
  const skuInput = row.querySelector('.purchase-sku');
  const brandSelect = row.querySelector('.purchase-brand-select');
  if (skuInput && !skuInput.value) skuInput.value = data.sku || '';
  if (brandSelect && !brandSelect.value) {
    if (data.brand_id) {
      brandSelect.value = String(data.brand_id);
    } else if (data.brand_name) {
      _selectBrandByName(brandSelect, data.brand_name);
    }
  }
}

function refreshPurchaseBrandSelects() {
  if (!el.purchaseItemsContainer) return;
  el.purchaseItemsContainer.querySelectorAll('.purchase-item-row').forEach((row) => {
    const brandSelect = row.querySelector('.purchase-brand-select');
    if (!brandSelect) return;
    const current = brandSelect.value;
    populateBrandSelectFor(brandSelect);
    if (current) brandSelect.value = current;
  });
}

function addPurchaseItemRow(data = {}) {
  if (!el.purchaseItemsContainer) return;
  const row = document.createElement('div');
  row.className = 'purchase-item-row';
  row.innerHTML = `
    <label class="field">
      <span class="field-label">Producto</span>
      <div class="product-combobox" data-product-combobox>
        <input type="text" class="product-combobox-input" placeholder="Buscar producto">
        <div class="product-combobox-list" hidden></div>
        <select name="product_id" class="purchase-product product-select-hidden"></select>
      </div>
    </label>
    <label class="field">
      <span class="field-label">Marca</span>
      <select name="brand_id" class="purchase-brand-select"></select>
    </label>
    <label class="field">
      <span class="field-label">SKU</span>
      <input type="text" class="purchase-sku" placeholder="SKU">
    </label>
    <label class="field">
      <span class="field-label">Cantidad</span>
      <input type="number" class="purchase-qty" min="0" step="1" value="${data.quantity || ''}">
    </label>
    <label class="field">
      <span class="field-label">Precio Unitario</span>
      <input type="number" class="purchase-unit" min="0" step="0.01" value="${data.unit_price || ''}">
    </label>
    <label class="field">
      <span class="field-label">Precio total</span>
      <input type="text" class="purchase-line-total" readonly>
    </label>
    <button type="button" class="btn ghost small remove-item">Quitar</button>
  `;

  const productSelect = row.querySelector('select[name="product_id"]');
  populateProductSelect(productSelect);
  initProductCombobox(row, productSelect);
  const brandSelect = row.querySelector('select[name="brand_id"]');
  populateBrandSelectFor(brandSelect);

  if (data.product_id) {
    productSelect.value = data.product_id;
    const product = getProductById(data.product_id);
    if (product) applyProductToRow(row, product);
  }

  if (data.sku) row.querySelector('.purchase-sku').value = data.sku;
  if (data.brand_name && !brandSelect.value) {
    _selectBrandByName(brandSelect, data.brand_name);
  }

  productSelect.addEventListener('change', () => {
    const product = getProductById(productSelect.value);
    if (product) {
      row.querySelector('.purchase-sku').value = '';
      if (brandSelect) brandSelect.value = '';
      applyProductToRow(row, product);
    }
  });

  row.querySelector('.purchase-qty').addEventListener('input', () => updatePurchaseLineTotal(row));
  row.querySelector('.purchase-unit').addEventListener('input', () => updatePurchaseLineTotal(row));
  row.querySelector('.remove-item').addEventListener('click', () => {
    const rows = el.purchaseItemsContainer.querySelectorAll('.purchase-item-row');
    if (rows.length > 1) {
      row.remove();
    } else {
      row.querySelector('.purchase-qty').value = '';
      row.querySelector('.purchase-unit').value = '';
      row.querySelector('.purchase-sku').value = '';
      row.querySelector('.purchase-brand-select').value = '';
      if (productSelect) productSelect.value = '';
      if (productSelect) productSelect.dispatchEvent(new Event('change'));
    }
    updatePurchaseLineTotal(row);
  });

  el.purchaseItemsContainer.appendChild(row);
  updatePurchaseLineTotal(row);
}

function clearPurchaseForm() {
  if (!el.purchaseForm) return;
  el.purchaseForm.reset();
  if (el.purchaseItemsContainer) {
    el.purchaseItemsContainer.innerHTML = '';
  }
  addPurchaseItemRow();
}

function getPurchaseItemsFromForm() {
  if (!el.purchaseItemsContainer) return [];
  const rows = [...el.purchaseItemsContainer.querySelectorAll('.purchase-item-row')];
  const items = [];
  rows.forEach((row) => {
    const selectEl = row.querySelector('select[name="product_id"]');
    const productId = selectEl ? selectEl.value : '';
    const sku = row.querySelector('.purchase-sku')?.value.trim() || '';
    const brandSelect = row.querySelector('.purchase-brand-select');
    const brandName = brandSelect && brandSelect.selectedIndex > 0
      ? brandSelect.options[brandSelect.selectedIndex].textContent
      : '';
    const quantity = Number(row.querySelector('.purchase-qty')?.value || 0);
    const unitPrice = Number(row.querySelector('.purchase-unit')?.value || 0);

    let productName = '';
    if (productId) {
      const product = getProductById(productId);
      if (product) {
        const pdata = product.data_json || {};
        productName = pdata.label || pdata.description || pdata.name || pdata.sku || '';
      }
    }

    if (!productId && !productName && !sku && !brandName) {
      return;
    }
    items.push({
      product_id: productId || null,
      product_name: productName || null,
      sku: sku || null,
      brand_name: brandName || null,
      quantity,
      unit_price: unitPrice,
    });
  });
  return items;
}

async function handleCreatePurchase(evt) {
  evt.preventDefault();
  const formData = new FormData(el.purchaseForm);
  const payload = Object.fromEntries(formData.entries());
  const purchaseId = payload.id;
  delete payload.id;

  const items = getPurchaseItemsFromForm();
  if (!items.length) {
    alert('Agrega al menos un producto a la compra.');
    return;
  }
  payload.items = items;

  try {
    if (purchaseId) {
      await apiFetch(`/purchases/${purchaseId}`, { method: 'PUT', body: JSON.stringify(payload) });
    } else {
      await apiFetch('/purchases', { method: 'POST', body: JSON.stringify(payload) });
    }
    clearPurchaseForm();
    closeModal(el.purchaseModal);
    await loadPurchases();
    setActiveModule('purchases');
  } catch (error) {
    alert(error.message);
  }
}

async function handlePurchaseUpload(evt) {
  evt.preventDefault();
  const formData = new FormData(el.purchaseUploadForm);
  try {
    const response = await apiFetch('/purchases/upload', { method: 'POST', body: formData });
    const result = await response.json().catch(() => ({}));
    const created = Number(result && result.created);
    if (Number.isFinite(created)) {
      alert(`Carga masiva de compras completada. Registros creados: ${created}.`);
    } else {
      alert('Carga masiva de compras completada correctamente.');
    }
    el.purchaseUploadForm.reset();
    await loadPurchases();
    setActiveModule('purchases');
  } catch (error) {
    alert(`Error en la carga masiva de compras: ${error.message}`);
  }
}

function openEditPurchaseModal(purchase) {
  const data = purchase.data_json || {};
  if (el.purchaseForm) {
    el.purchaseForm.reset();
    el.purchaseForm.querySelector('[name="id"]').value = purchase.id;
    el.purchaseForm.querySelector('[name="order"]').value = data.order || '';
    el.purchaseForm.querySelector('[name="date"]').value = data.date || '';
    el.purchaseForm.querySelector('[name="observations"]').value = data.observations || '';
    if (el.purchaseProviderSelect) {
      populateProviderSelect(el.purchaseProviderSelect);
      el.purchaseProviderSelect.value = data.provider_id || '';
    }
  }
  if (el.purchaseItemsContainer) {
    el.purchaseItemsContainer.innerHTML = '';
    const items = Array.isArray(data.items) ? data.items : [];
    if (items.length) {
      items.forEach((item) => addPurchaseItemRow(item));
    } else {
      addPurchaseItemRow();
    }
  }
  if (el.purchaseModalTitle) {
    el.purchaseModalTitle.textContent = `Editar compra #${purchase.id}`;
  }
  openModal(el.purchaseModal);
}

function renderPurchases(purchases) {
  if (!el.purchasesTable) return;
  el.purchasesTable.innerHTML = '';
  const isAdmin = state.role === 'ADMIN';

  purchases.forEach((purchase) => {
    const data = purchase.data_json || {};
    const items = Array.isArray(data.items) ? data.items : [];
    const productNames = items.map((item) => item.product_name).filter(Boolean);
    const itemCount = items.length;
    const tr = document.createElement('tr');
    tr.className = 'purchase-main-row';

    const editBtn = isAdmin ? `<button class="btn outline small" data-edit-id="${purchase.id}">Editar</button>` : '';
    tr.innerHTML = `
      <td class="catalog-select-col"><input type="checkbox" class="catalog-select" value="${purchase.id}"></td>
      <td>${purchase.id}</td>
      <td>${data.provider_name || '-'}</td>
      <td>${data.order || '-'}</td>
      <td>${data.date || '-'}</td>
      <td>${formatCurrency(data.total)}</td>
      <td class="purchase-observations">${data.observations || '-'}</td>
      <td>
        <button type="button" class="btn ghost small expand-orders-btn" aria-expanded="false">
          <span class="expand-icon">&gt;</span> ${itemCount} producto${itemCount !== 1 ? 's' : ''}
        </button>
        <span style="display:none">${productNames.join(' ')}</span>
      </td>
      <td>${editBtn}</td>
    `;

    const detailsTr = document.createElement('tr');
    detailsTr.className = 'order-details-row';
    detailsTr.dataset.paginationSkip = 'true';
    detailsTr.style.display = 'none';

    const itemsBodyHtml = items.length
      ? items.map((item) => `
          <tr>
            <td>${item.product_name || '-'}</td>
            <td>${item.brand_name || '-'}</td>
            <td>${item.sku || '-'}</td>
            <td class="order-detail-amount">${item.quantity || 0}</td>
            <td class="order-detail-amount">${formatCurrency(item.unit_price || 0)}</td>
            <td class="order-detail-amount">${formatCurrency(item.total || 0)}</td>
          </tr>
        `).join('')
      : '<tr><td colspan="6" class="order-detail-empty">Sin productos registrados</td></tr>';

    detailsTr.innerHTML = `
      <td colspan="9" class="order-details-cell">
        <div class="order-details-inner">
          <table class="order-details-table">
            <thead>
              <tr>
                <th>Producto</th>
                <th>Marca</th>
                <th>SKU</th>
                <th>Cantidad</th>
                <th>Precio Unitario</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>${itemsBodyHtml}</tbody>
          </table>
        </div>
      </td>
    `;

    el.purchasesTable.appendChild(tr);
    el.purchasesTable.appendChild(detailsTr);

    tr.querySelector('.expand-orders-btn').addEventListener('click', () => {
      const btn = tr.querySelector('.expand-orders-btn');
      const expanded = btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', String(!expanded));
      btn.querySelector('.expand-icon').textContent = expanded ? '>' : 'v';
      detailsTr.style.display = expanded ? 'none' : '';
    });
  });

  if (typeof bindCatalogSelection === 'function') {
    bindCatalogSelection(el.purchasesTable, el.purchasesSelectAll, el.purchasesBulkDelete);
  }

  if (isAdmin) {
    el.purchasesTable.querySelectorAll('[data-edit-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.editId;
        const purchase = purchases.find((p) => String(p.id) === String(id));
        if (purchase) openEditPurchaseModal(purchase);
      });
    });
  }

  if (el.purchasesSearch) {
    applyTableSearch('purchases-table', el.purchasesSearch.value);
  } else {
    applyPagination('purchases-table');
  }
}

async function loadPurchases() {
  const response = await apiFetch('/purchases');
  const purchases = await response.json();
  state.purchases = purchases;
  renderPurchases(purchases);
}

// ==================== PURCHASES SUMMARY ====================

let _psumData = null;

function _psumFmt(n) {
  return formatCurrency(n || 0);
}

function _psumPct(part, total) {
  if (!total) return 0;
  return Math.min(100, Math.round((part / total) * 100));
}

function renderPurchasesSummaryKPIs(kpis) {
  const container = document.getElementById('psum-kpis');
  if (!container) return;
  const items = [
    { label: 'Total invertido', value: _psumFmt(kpis.total_invested), sub: 'en compras' },
    { label: 'Ordenes de compra', value: String(kpis.total_ocs), sub: 'registradas' },
    { label: 'Proveedores', value: String(kpis.unique_providers), sub: 'distintos' },
    { label: 'Marcas', value: String(kpis.unique_brands), sub: 'distintas' },
    { label: 'Productos', value: String(kpis.unique_products), sub: 'distintos' },
    { label: 'Promedio por OC', value: _psumFmt(kpis.avg_per_oc), sub: 'por orden' },
  ];
  container.innerHTML = items.map((it) => `
    <div class="psum-kpi-card">
      <span class="psum-kpi-label">${it.label}</span>
      <strong class="psum-kpi-value">${it.value}</strong>
      <span class="psum-kpi-sub">${it.sub}</span>
    </div>
  `).join('');
}

function renderPurchasesSummaryTrend(trend) {
  const container = document.getElementById('psum-trend-chart');
  if (!container) return;
  if (!trend || !trend.length) {
    container.innerHTML = '<p class="psum-empty-msg">Sin datos de tendencia.</p>';
    return;
  }
  const maxVal = Math.max(...trend.map((t) => t.total), 1);
  container.innerHTML = trend.map((row) => {
    const pct = _psumPct(row.total, maxVal);
    const label = row.month === 'Sin fecha' ? 'Sin fecha' : row.month;
    return `
      <div class="psum-bar-row">
        <span class="psum-bar-label">${label}</span>
        <div class="psum-bar-track">
          <div class="psum-bar-fill" style="width:${pct}%"></div>
        </div>
        <span class="psum-bar-amount">${_psumFmt(row.total)}</span>
      </div>
    `;
  }).join('');
}

function renderPurchasesSummaryRankList(containerId, items, colorClass) {
  const container = document.getElementById(containerId);
  if (!container) return;
  if (!items || !items.length) {
    container.innerHTML = '<p class="psum-empty-msg">Sin datos.</p>';
    return;
  }
  const top = items.slice(0, 10);
  const maxVal = Math.max(...top.map((i) => i.total), 1);
  container.innerHTML = top.map((item, idx) => {
    const pct = _psumPct(item.total, maxVal);
    return `
      <div class="psum-rank-item">
        <span class="psum-rank-num">${idx + 1}</span>
        <div class="psum-rank-bar-wrap">
          <span class="psum-rank-name" title="${item.name}">${item.name}</span>
          <div class="psum-rank-track">
            <div class="psum-rank-fill ${colorClass}" style="width:${pct}%"></div>
          </div>
        </div>
        <span class="psum-rank-amount">${_psumFmt(item.total)}</span>
      </div>
    `;
  }).join('');
}

function renderPurchasesSummaryComboTable(tableId, rows, col1Key, col2Key, col1Label, col2Label) {
  const table = document.getElementById(tableId);
  if (!table) return;
  const tbody = table.querySelector('tbody');
  if (!rows || !rows.length) {
    tbody.innerHTML = `<tr><td colspan="4" class="psum-empty-msg">Sin datos.</td></tr>`;
    return;
  }
  tbody.innerHTML = rows.slice(0, 20).map((row, idx) => `
    <tr>
      <td>${idx + 1}</td>
      <td title="${row[col1Key] || ''}">${row[col1Key] || '-'}</td>
      <td title="${row[col2Key] || ''}">${row[col2Key] || '-'}</td>
      <td>${_psumFmt(row.total)}</td>
    </tr>
  `).join('');
}

function renderPurchasesSummaryProviderDetail(providers) {
  const container = document.getElementById('psum-provider-detail');
  if (!container) return;
  if (!providers || !providers.length) {
    container.innerHTML = '<p class="psum-empty-msg">Sin proveedores con compras registradas.</p>';
    return;
  }
  container.innerHTML = '';
  providers.slice(0, 20).forEach((prov, idx) => {
    const payTotal = prov.payments_total || 0;
    const payPaid = prov.payments_paid || 0;
    const payPending = prov.payments_pending || 0;
    const paidPct = _psumPct(payPaid, payTotal);
    const hasPayments = payTotal > 0;

    const card = document.createElement('div');
    card.className = 'psum-provider-card';

    const tagsHtml = (list, cls) => (list || []).slice(0, 12).map((t) =>
      `<span class="psum-tag ${cls}" title="${t}">${t}</span>`
    ).join('') + (list && list.length > 12 ? `<span class="psum-tag">+${list.length - 12} mas</span>` : '');

    const paySection = hasPayments ? `
      <div class="psum-rel-section">
        <div class="psum-rel-title">Estado de pagos (cruce con modulo Pagos)</div>
        <div class="psum-payment-bar">
          <span>Pagado ${_psumFmt(payPaid)}</span>
          <div class="psum-payment-track">
            <div class="psum-payment-paid-bar" style="width:${paidPct}%"></div>
          </div>
          <span>Pendiente ${_psumFmt(payPending)}</span>
        </div>
      </div>
    ` : '';

    card.innerHTML = `
      <div class="psum-provider-card-header">
        <div class="psum-provider-title">
          <span class="psum-provider-rank">#${idx + 1}</span>
          <span class="psum-provider-name" title="${prov.name}">${prov.name}</span>
        </div>
        <div class="psum-provider-meta">
          <span class="psum-meta-chip total">${_psumFmt(prov.total)}</span>
          <span class="psum-meta-chip">${prov.oc_count} OC${prov.oc_count !== 1 ? 's' : ''}</span>
          <span class="psum-meta-chip">${prov.brand_count} marca${prov.brand_count !== 1 ? 's' : ''}</span>
          <span class="psum-meta-chip">${prov.product_count} producto${prov.product_count !== 1 ? 's' : ''}</span>
          ${hasPayments ? `<span class="psum-meta-chip pay-ok">${_psumFmt(payPaid)} pagado</span>` : ''}
          ${hasPayments && payPending > 0 ? `<span class="psum-meta-chip pay-pending">${_psumFmt(payPending)} pendiente</span>` : ''}
        </div>
        <span class="psum-expand-icon">&#9660;</span>
      </div>
      <div class="psum-provider-card-body">
        <div class="psum-rel-section">
          <div class="psum-rel-title">Marcas compradas (${prov.brand_count})</div>
          <div class="psum-tag-list">${tagsHtml(prov.brands, 'brand-tag')}</div>
        </div>
        <div class="psum-rel-section">
          <div class="psum-rel-title">Productos comprados (${prov.product_count})</div>
          <div class="psum-tag-list">${tagsHtml(prov.products, 'product-tag')}</div>
        </div>
        ${paySection}
      </div>
    `;

    const header = card.querySelector('.psum-provider-card-header');
    const body = card.querySelector('.psum-provider-card-body');
    const icon = card.querySelector('.psum-expand-icon');
    header.addEventListener('click', () => {
      const open = body.classList.toggle('open');
      icon.textContent = open ? '\u25B2' : '\u25BC';
    });

    container.appendChild(card);
  });
}

function renderPurchasesSummaryBrandDetail(brands) {
  const container = document.getElementById('psum-brand-detail');
  if (!container) return;
  if (!brands || !brands.length) {
    container.innerHTML = '<p class="psum-empty-msg">Sin marcas con compras registradas.</p>';
    return;
  }
  container.innerHTML = '';
  brands.slice(0, 15).forEach((brand, idx) => {
    const card = document.createElement('div');
    card.className = 'psum-provider-card';

    const tagsHtml = (list, cls) => (list || []).slice(0, 12).map((t) =>
      `<span class="psum-tag ${cls}" title="${t}">${t}</span>`
    ).join('') + (list && list.length > 12 ? `<span class="psum-tag">+${list.length - 12} mas</span>` : '');

    card.innerHTML = `
      <div class="psum-provider-card-header">
        <div class="psum-provider-title">
          <span class="psum-provider-rank">#${idx + 1}</span>
          <span class="psum-provider-name" title="${brand.name}">${brand.name}</span>
        </div>
        <div class="psum-provider-meta">
          <span class="psum-meta-chip total">${_psumFmt(brand.total)}</span>
          <span class="psum-meta-chip">${brand.provider_count} proveedor${brand.provider_count !== 1 ? 'es' : ''}</span>
          <span class="psum-meta-chip">${brand.product_count} producto${brand.product_count !== 1 ? 's' : ''}</span>
        </div>
        <span class="psum-expand-icon">&#9660;</span>
      </div>
      <div class="psum-provider-card-body">
        <div class="psum-rel-section">
          <div class="psum-rel-title">Proveedores que la suministran (${brand.provider_count})</div>
          <div class="psum-tag-list">${tagsHtml(brand.providers, '')}</div>
        </div>
        <div class="psum-rel-section">
          <div class="psum-rel-title">Productos de esta marca (${brand.product_count})</div>
          <div class="psum-tag-list">${tagsHtml(brand.products, 'product-tag')}</div>
        </div>
      </div>
    `;

    const header = card.querySelector('.psum-provider-card-header');
    const body = card.querySelector('.psum-provider-card-body');
    const icon = card.querySelector('.psum-expand-icon');
    header.addEventListener('click', () => {
      const open = body.classList.toggle('open');
      icon.textContent = open ? '\u25B2' : '\u25BC';
    });

    container.appendChild(card);
  });
}

function renderPurchasesSummary(data) {
  _psumData = data;
  renderPurchasesSummaryKPIs(data.kpis || {});
  renderPurchasesSummaryTrend(data.monthly_trend || []);
  renderPurchasesSummaryRankList('psum-top-providers', data.providers, '');
  renderPurchasesSummaryRankList('psum-top-brands', data.brands, 'brand');
  renderPurchasesSummaryRankList('psum-top-products', data.products, 'product');
  renderPurchasesSummaryComboTable('psum-prov-brand-table', data.top_provider_brand, 'provider', 'brand', 'Proveedor', 'Marca');
  renderPurchasesSummaryComboTable('psum-prov-product-table', data.top_provider_product, 'provider', 'product', 'Proveedor', 'Producto');
  renderPurchasesSummaryComboTable('psum-brand-product-table', data.top_brand_product, 'brand', 'product', 'Marca', 'Producto');
  renderPurchasesSummaryProviderDetail(data.providers || []);
  renderPurchasesSummaryBrandDetail(data.brands || []);
}

async function loadPurchasesSummary() {
  const loadingEl = document.getElementById('psum-loading');
  if (loadingEl) loadingEl.style.display = '';
  try {
    const response = await apiFetch('/purchases/summary');
    const data = await response.json();
    renderPurchasesSummary(data);
  } catch (err) {
    console.error('Error cargando resumen de compras:', err);
  } finally {
    if (loadingEl) loadingEl.style.display = 'none';
  }
}

function initPurchasesTabs() {
  const tabBtns = document.querySelectorAll('.purchases-tab-btn');
  const listView = document.getElementById('purchases-list-view');
  const summaryView = document.getElementById('purchases-summary-view');
  if (!tabBtns.length || !listView || !summaryView) return;

  let summaryLoaded = false;

  tabBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      tabBtns.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.dataset.tab;
      listView.style.display = tab === 'list' ? '' : 'none';
      summaryView.style.display = tab === 'summary' ? '' : 'none';
      if (tab === 'summary' && !summaryLoaded) {
        summaryLoaded = true;
        loadPurchasesSummary();
      }
    });
  });

  const refreshBtn = document.getElementById('purchases-summary-refresh');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', loadPurchasesSummary);
  }
}
