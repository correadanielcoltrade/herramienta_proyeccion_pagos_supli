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
    if (typeof loadGantt === 'function') {
      await loadGantt();
    }
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
    if (typeof loadGantt === 'function') {
      await loadGantt();
    }
    closeModal(el.productModal);
  } catch (error) {
    alert(error.message);
  }
}

async function handleCatalogUpload(form, endpoint) {
  const formData = new FormData(form);
  const response = await apiFetch(endpoint, { method: 'POST', body: formData });
  form.reset();
  return response.json();
}

function getSelectedIds(bodyEl) {
  if (!bodyEl) return [];
  return [...bodyEl.querySelectorAll('.catalog-select:checked')].map((checkbox) => checkbox.value);
}

function updateCatalogSelection(bodyEl, selectAllEl, bulkBtnEl) {
  if (!bodyEl) return;
  const all = [...bodyEl.querySelectorAll('.catalog-select')];
  const checked = [...bodyEl.querySelectorAll('.catalog-select:checked')];
  if (bulkBtnEl) {
    bulkBtnEl.disabled = checked.length === 0;
  }
  if (selectAllEl) {
    selectAllEl.checked = all.length > 0 && checked.length === all.length;
    selectAllEl.indeterminate = checked.length > 0 && checked.length < all.length;
  }
}

function bindCatalogSelection(bodyEl, selectAllEl, bulkBtnEl) {
  if (!bodyEl) return;
  if (selectAllEl && !selectAllEl.dataset.bound) {
    selectAllEl.addEventListener('change', () => {
      const isChecked = selectAllEl.checked;
      bodyEl.querySelectorAll('.catalog-select').forEach((checkbox) => {
        checkbox.checked = isChecked;
      });
      updateCatalogSelection(bodyEl, selectAllEl, bulkBtnEl);
    });
    selectAllEl.dataset.bound = 'true';
  }

  if (!bodyEl.dataset.bound) {
    bodyEl.addEventListener('change', (evt) => {
      if (evt.target.classList.contains('catalog-select')) {
        updateCatalogSelection(bodyEl, selectAllEl, bulkBtnEl);
      }
    });
    bodyEl.dataset.bound = 'true';
  }

  updateCatalogSelection(bodyEl, selectAllEl, bulkBtnEl);
}

async function handleBulkDelete(endpoint, bodyEl, selectAllEl, _bulkBtnEl, reloadFn) {
  const ids = getSelectedIds(bodyEl);
  if (!ids.length) return;
  const ok = confirm(`Eliminar ${ids.length} registros seleccionados?`);
  if (!ok) return;
  try {
    await apiFetch(endpoint, { method: 'POST', body: JSON.stringify({ ids }) });
    if (selectAllEl) selectAllEl.checked = false;
    await reloadFn();
  } catch (error) {
    alert(error.message);
  }
}

function applyTableFilters(tableId, query, category) {
  const table = document.getElementById(tableId);
  if (!table) return;
  const tbody = table.querySelector('tbody');
  if (!tbody) return;
  const term = String(query || '').trim().toLowerCase();
  const cat = String(category || '').trim().toLowerCase();
  const rows = [...tbody.querySelectorAll(':scope > tr')].filter((r) => !r.dataset.paginationSkip);
  rows.forEach((row) => {
    const matchesSearch = !term || row.textContent.toLowerCase().includes(term);
    const matchesCat = !cat || (row.dataset.category || '').toLowerCase() === cat;
    if (matchesSearch && matchesCat) {
      delete row.dataset.filtered;
    } else {
      row.dataset.filtered = 'true';
    }
  });
  const pagination = getPaginationState(tableId);
  pagination.page = 1;
  applyPagination(tableId);
}

function bindCatalogFilters(searchEl, categoryEl, tableId) {
  if (searchEl && !searchEl.dataset.bound) {
    searchEl.addEventListener('input', () => {
      applyTableFilters(tableId, searchEl.value, categoryEl ? categoryEl.value : '');
    });
    searchEl.dataset.bound = 'true';
  }
  if (categoryEl && !categoryEl.dataset.bound) {
    categoryEl.addEventListener('change', () => {
      applyTableFilters(tableId, searchEl ? searchEl.value : '', categoryEl.value);
    });
    categoryEl.dataset.bound = 'true';
  }
}

function exportCatalogXLSX(headers, rows, filename) {
  const data = [headers, ...rows];
  const ws = XLSX.utils.aoa_to_sheet(data);
  const colWidths = headers.map((h, i) => {
    const max = Math.max(h.length, ...rows.map((r) => String(r[i] == null ? '' : r[i]).length));
    return { wch: Math.min(max + 2, 50) };
  });
  ws['!cols'] = colWidths;
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Datos');
  XLSX.writeFile(wb, filename);
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

function renderBrands(brands) {
  if (!el.brandTable) return;
  el.brandTable.innerHTML = '';
  brands.forEach((brand) => {
    const cat = brand.data_json.category || 'Normal';
    const tr = document.createElement('tr');
    tr.dataset.category = cat;
    tr.innerHTML = `
      <td class="catalog-select-col"><input type="checkbox" class="catalog-select" value="${brand.id}"></td>
      <td>${brand.data_json.name}</td>
      <td><span class="cat-badge ${cat.toLowerCase()}">${cat}</span></td>
      <td><button class="btn ghost small" data-id="${brand.id}">Editar</button></td>
    `;
    tr.querySelector('button').addEventListener('click', () => {
      el.brandForm.querySelector('[name="id"]').value = brand.id;
      el.brandForm.querySelector('[name="name"]').value = brand.data_json.name;
      el.brandForm.querySelector('[name="category"]').value = cat;
      openModal(el.brandModal);
    });
    el.brandTable.appendChild(tr);
  });
  bindCatalogSelection(el.brandTable, el.brandSelectAll, el.brandBulkDelete);
  applyTableFilters(
    'brands-table',
    el.brandSearch ? el.brandSearch.value : '',
    el.brandFilterCategory ? el.brandFilterCategory.value : ''
  );
}

function renderProvidersCatalog(providers) {
  if (!el.vendorTable) return;
  el.vendorTable.innerHTML = '';
  providers.forEach((provider) => {
    const cat = provider.data_json.category || 'Normal';
    const tr = document.createElement('tr');
    tr.dataset.category = cat;
    tr.innerHTML = `
      <td class="catalog-select-col"><input type="checkbox" class="catalog-select" value="${provider.id}"></td>
      <td>${provider.data_json.name}</td>
      <td><span class="cat-badge ${cat.toLowerCase()}">${cat}</span></td>
      <td>${provider.data_json.status || 'Nacional'}</td>
      <td>${provider.data_json.type || 'Comercial'}</td>
      <td><button class="btn ghost small" data-id="${provider.id}">Editar</button></td>
    `;
    tr.querySelector('button').addEventListener('click', () => {
      el.vendorForm.querySelector('[name="id"]').value = provider.id;
      el.vendorForm.querySelector('[name="name"]').value = provider.data_json.name;
      el.vendorForm.querySelector('[name="category"]').value = cat;
      el.vendorForm.querySelector('[name="status"]').value = provider.data_json.status || 'Nacional';
      el.vendorForm.querySelector('[name="type"]').value = provider.data_json.type || 'Comercial';
      openModal(el.vendorModal);
    });
    el.vendorTable.appendChild(tr);
  });
  bindCatalogSelection(el.vendorTable, el.vendorSelectAll, el.vendorBulkDelete);
  applyTableFilters(
    'vendors-table',
    el.vendorSearch ? el.vendorSearch.value : '',
    el.vendorFilterCategory ? el.vendorFilterCategory.value : ''
  );
}

function renderProductsCatalog(products) {
  if (!el.productTable) return;
  el.productTable.innerHTML = '';
  products.forEach((product) => {
    const cat = product.data_json.category || 'Normal';
    const tr = document.createElement('tr');
    tr.dataset.category = cat;
    tr.innerHTML = `
      <td class="catalog-select-col"><input type="checkbox" class="catalog-select" value="${product.id}"></td>
      <td>${product.data_json.sku || '-'}</td>
      <td>${product.data_json.description || product.data_json.label || '-'}</td>
      <td>${product.data_json.brand_name || '-'}</td>
      <td><span class="cat-badge ${cat.toLowerCase()}">${cat}</span></td>
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
      el.productForm.querySelector('[name="category"]').value = cat;
      openModal(el.productModal);
    });
    el.productTable.appendChild(tr);
  });
  bindCatalogSelection(el.productTable, el.productSelectAll, el.productBulkDelete);
  applyTableFilters(
    'products-table',
    el.productSearch ? el.productSearch.value : '',
    el.productFilterCategory ? el.productFilterCategory.value : ''
  );
}
