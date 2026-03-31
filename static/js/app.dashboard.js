async function loadAll() {
  const tasks = [
    loadBrands(),
    loadProviders(),
    loadProducts(),
    loadDashboard(),
  ];
  if (state.role === 'ADMIN') {
    tasks.push(loadUsers());
  }
  await Promise.all(tasks);
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
  if (el.itemsContainer) {
    const selects = el.itemsContainer.querySelectorAll('select[name="product_id"]');
    selects.forEach((selectEl) => populateProductSelect(selectEl));
  }
  if (el.paymentPivotHeader) {
    const pivotSelects = el.paymentPivotHeader.querySelectorAll('.pivot-product-select');
    pivotSelects.forEach((selectEl) => populateProductSelect(selectEl));
  }
  renderProductsCatalog(products);
}

async function loadWeeks() {
  const response = await apiFetch('/dashboard/weeks');
  const weeks = await response.json();
  el.filterWeek.innerHTML = '<option value="">Semana</option>';
  if (el.ganttExportWeek) {
    el.ganttExportWeek.innerHTML = '<option value="">Todas las semanas</option>';
  }
  weeks.forEach((w) => {
    const label = w.week_year ? `Sem ${w.week} (${w.week_year})` : `Semana ${w.week}`;
    const option = document.createElement('option');
    option.value = w.week;
    option.textContent = label;
    el.filterWeek.appendChild(option);
    if (el.ganttExportWeek) {
      const ganttOption = option.cloneNode(true);
      el.ganttExportWeek.appendChild(ganttOption);
    }
  });
  renderWeeks(weeks);
}

async function loadSummary() {
  const response = await apiFetch('/dashboard/summary');
  const summary = await response.json();
  renderMetrics(summary);
  renderProviders(summary.total_by_provider || []);
}

async function loadGantt() {
  if (!el.ganttChart) return;
  const response = await apiFetch('/dashboard/gantt');
  ganttData = await response.json();
  _populateGanttYearFilter(ganttData);
  if (!ganttYearFilterBound) {
    const yearSel = document.getElementById('gantt-year-filter');
    if (yearSel) {
      yearSel.addEventListener('change', () => {
        if (ganttData) renderGantt(ganttData, yearSel.value);
        renderDashboardPivot(allPayments, yearSel.value);
      });
      ganttYearFilterBound = true;
    }
  }
  const yearSel = document.getElementById('gantt-year-filter');
  renderGantt(ganttData, yearSel ? yearSel.value : null);
}

async function updateGanttStatus({ providerId, week, weekYear, status }) {
  await apiFetch('/dashboard/gantt/status', {
    method: 'PATCH',
    body: JSON.stringify({ provider_id: providerId, week, week_year: weekYear, status }),
  });
  await loadDashboard();
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
    loadGantt(),
    loadDashboardPivot(),
    loadPayments(),
  ]);
}

let ganttTooltipEl = null;
let ganttData = null;
let allPayments = [];
let ganttYearFilterBound = false;

function getGanttTooltip() {
  if (ganttTooltipEl && document.body.contains(ganttTooltipEl)) return ganttTooltipEl;
  const tooltip = document.createElement('div');
  tooltip.className = 'gantt-tooltip';
  tooltip.setAttribute('role', 'tooltip');
  tooltip.setAttribute('aria-hidden', 'true');
  document.body.appendChild(tooltip);
  ganttTooltipEl = tooltip;
  return tooltip;
}

function setGanttTooltipContent(tooltip, data) {
  tooltip.innerHTML = '';

  const title = document.createElement('div');
  title.className = 'gantt-tooltip-title';
  const name = document.createElement('span');
  name.className = 'gantt-tooltip-name';
  name.textContent = data.vendorName || 'Sin proveedor';
  const chip = document.createElement('span');
  chip.className = 'gantt-tooltip-chip';
  chip.textContent = data.vendorCategory || 'Normal';
  title.appendChild(name);
  title.appendChild(chip);
  tooltip.appendChild(title);

  const meta = document.createElement('div');
  meta.className = 'gantt-tooltip-meta';
  meta.textContent = `Semana ${data.week}${data.year ? ` (${data.year})` : ''} | Total ${formatCurrency(data.total || 0)}`;
  if (data.status) {
    meta.textContent += ` | Estado ${data.status}`;
  }
  tooltip.appendChild(meta);

  const list = document.createElement('div');
  list.className = 'gantt-tooltip-list';
  (data.details || []).forEach((detail) => {
    const row = document.createElement('div');
    row.className = 'gantt-tooltip-row';

    const order = document.createElement('span');
    order.className = 'gantt-tooltip-invoice';
    order.textContent = detail.order ? `OC/Emb: ${detail.order}` : 'OC/Emb: -';

    const payType = document.createElement('span');
    payType.className = 'gantt-tooltip-type';
    payType.textContent = detail.payment_type ? `Tipo: ${detail.payment_type}` : 'Tipo: -';

    const amount = document.createElement('span');
    amount.className = 'gantt-tooltip-amount';
    amount.textContent = formatCurrency(detail.amount || 0);

    row.appendChild(order);
    row.appendChild(payType);
    row.appendChild(amount);
    list.appendChild(row);
  });
  tooltip.appendChild(list);
}

function positionGanttTooltip(tooltip, clientX, clientY) {
  const offset = 14;
  const padding = 12;
  const rect = tooltip.getBoundingClientRect();
  let x = clientX + offset;
  let y = clientY + offset;
  let flipped = false;

  if (x + rect.width + padding > window.innerWidth) {
    x = clientX - rect.width - offset;
    flipped = true;
  }
  if (x < padding) x = padding;
  if (y + rect.height + padding > window.innerHeight) {
    y = clientY - rect.height - offset;
  }
  if (y < padding) y = padding;

  tooltip.classList.toggle('is-flipped', flipped);
  tooltip.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`;
}

function bindGanttTooltip(grid) {
  const tooltip = getGanttTooltip();
  let activeCell = null;

  const hideTooltip = () => {
    activeCell = null;
    tooltip.classList.remove('is-visible', 'is-flipped');
    tooltip.setAttribute('aria-hidden', 'true');
  };

  const showForCell = (cell, event) => {
    if (!cell || !cell.dataset.tooltip) return;
    let data = null;
    try {
      data = JSON.parse(cell.dataset.tooltip);
    } catch (error) {
      data = null;
    }
    if (!data) return;
    activeCell = cell;
    setGanttTooltipContent(tooltip, data);
    tooltip.classList.add('is-visible');
    tooltip.setAttribute('aria-hidden', 'false');
    positionGanttTooltip(tooltip, event.clientX, event.clientY);
  };

  grid.addEventListener('mouseover', (event) => {
    const cell = event.target.closest('.gantt-cell');
    if (!cell || !grid.contains(cell)) return;
    if (!cell.dataset.tooltip) {
      hideTooltip();
      return;
    }
    if (activeCell !== cell) showForCell(cell, event);
  });

  grid.addEventListener('mousemove', (event) => {
    if (!activeCell) return;
    positionGanttTooltip(tooltip, event.clientX, event.clientY);
  });

  grid.addEventListener('mouseleave', hideTooltip);

  const wrapper = grid.closest('.gantt-wrapper');
  if (wrapper) {
    wrapper.addEventListener('scroll', hideTooltip);
  }
}

function renderMetrics(summary) {
  el.metrics.innerHTML = '';
  const items = [
    { label: 'Total Proyeccion de pagos', value: formatCurrency(summary.total_general) },
    { label: 'Cantidad de Pagos pendientes', value: String(summary.pending_count || 0) },
    { label: 'Total $ Pagos Realizados', value: formatCurrency(summary.paid_total) },
    { label: 'Cantidad de Pagos Realizados', value: String(summary.paid_count || 0) },
    { label: 'Saldo de Pagos pendientes por pagar', value: formatCurrency(summary.pending_total) },
  ];
  items.forEach((item) => {
    const card = document.createElement('div');
    card.className = 'metric';
    card.innerHTML = `<span>${item.label}</span><strong>${item.value}</strong>`;
    el.metrics.appendChild(card);
  });
}

function renderWeeks(weeks) {
  if (!el.weeksList) return;
  el.weeksList.innerHTML = '';
  weeks.forEach((w) => {
    const label = w.week_year ? `Sem ${w.week} (${w.week_year})` : `Semana ${w.week}`;
    const li = document.createElement('li');
    li.innerHTML = `<span>${label}</span><span>${formatCurrency(w.total)}</span>`;
    el.weeksList.appendChild(li);
  });
}

function renderProviders(providers) {
  if (!el.providersList) return;
  el.providersList.innerHTML = '';
  providers.forEach((p) => {
    const li = document.createElement('li');
    li.innerHTML = `<span>${p.provider_name || 'Sin proveedor'}</span><span>${formatCurrency(p.total)}</span>`;
    el.providersList.appendChild(li);
  });
}

async function loadDashboardPivot() {
  if (!el.dashboardPivotBody) return;
  const response = await apiFetch('/payments');
  allPayments = await response.json() || [];
  const yearSel = document.getElementById('gantt-year-filter');
  renderDashboardPivot(allPayments, yearSel ? yearSel.value : null);
}

function renderDashboardPivot(payments, yearFilter) {
  if (!el.dashboardPivotBody) return;
  el.dashboardPivotBody.innerHTML = '';

  if (yearFilter) {
    const yearNum = Number(yearFilter);
    payments = payments.filter((p) => Number((p.data_json || {}).week_year) === yearNum);
  }

  if (!payments.length) {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td colspan="6" class="pivot-empty">Sin datos para la tabla.</td>
    `;
    el.dashboardPivotBody.appendChild(row);
    return;
  }

  const weekBuckets = new Map();

  const getWeekBucket = (key, label, sortValue) => {
    if (!weekBuckets.has(key)) {
      weekBuckets.set(key, {
        key,
        label,
        sortValue,
        total: 0,
        paid_total: 0,
        pending_total: 0,
        providers: new Map(),
      });
    }
    return weekBuckets.get(key);
  };

  const getProviderBucket = (weekBucket, key, label) => {
    if (!weekBucket.providers.has(key)) {
      weekBucket.providers.set(key, {
        key,
        label,
        total: 0,
        paid_total: 0,
        pending_total: 0,
        types: new Map(),
      });
    }
    return weekBucket.providers.get(key);
  };

  const getTypeBucket = (providerBucket, key, label) => {
    if (!providerBucket.types.has(key)) {
      providerBucket.types.set(key, {
        key,
        label,
        total: 0,
        paid_total: 0,
        pending_total: 0,
        orders: new Map(),
      });
    }
    return providerBucket.types.get(key);
  };

  const getOrderBucket = (typeBucket, key, label) => {
    if (!typeBucket.orders.has(key)) {
      typeBucket.orders.set(key, {
        key,
        label,
        total: 0,
        paid_total: 0,
        pending_total: 0,
      });
    }
    return typeBucket.orders.get(key);
  };

  payments.forEach((payment) => {
    const data = payment.data_json || {};
    const week = data.week;
    const weekYear = data.week_year;
    const weekLabel = week ? `Semana ${week}${weekYear ? ` (${weekYear})` : ''}` : 'Semana -';
    const weekKey = week ? `${weekYear || '0'}-${week}` : 'none';
    const sortValue = week ? (Number(weekYear || 0) * 100 + Number(week)) : Number.MAX_SAFE_INTEGER;
    const weekBucket = getWeekBucket(weekKey, weekLabel, sortValue);

    const providerName = data.provider_name || 'Sin proveedor';
    const providerKey = data.provider_id ? `id:${data.provider_id}` : `name:${providerName}`;
    const providerBucket = getProviderBucket(weekBucket, providerKey, providerName);
    const isPaid = data.status === 'Pagado';
    const amount = Number(data.amount || 0);
    const paymentType = data.payment_type || data.tipo_pago || data.provider_status || 'Nacional';
    const typeKey = paymentType || 'Sin tipo';
    const typeBucket = getTypeBucket(providerBucket, `type:${typeKey}`, paymentType);

    const orders = Array.isArray(data.orders) && data.orders.length ? data.orders : ['—'];
    orders.forEach((order) => {
      const rawLabel = (order && typeof order === 'object') ? order.order : order;
      const orderLabel = rawLabel && rawLabel !== '—' ? rawLabel : 'Sin OC';
      const orderKey = orderLabel || 'Sin OC';
      const orderBucket = getOrderBucket(typeBucket, `order:${orderKey}`, orderLabel);
      const orderAmount = (order && typeof order === 'object') ? Number(order.amount) : NaN;
      const perOrderAmount = Number.isFinite(orderAmount) ? orderAmount : (amount / orders.length);

      weekBucket.total += perOrderAmount;
      providerBucket.total += perOrderAmount;
      typeBucket.total += perOrderAmount;
      orderBucket.total += perOrderAmount;
      if (isPaid) {
        weekBucket.paid_total += perOrderAmount;
        providerBucket.paid_total += perOrderAmount;
        typeBucket.paid_total += perOrderAmount;
        orderBucket.paid_total += perOrderAmount;
      } else {
        weekBucket.pending_total += perOrderAmount;
        providerBucket.pending_total += perOrderAmount;
        typeBucket.pending_total += perOrderAmount;
        orderBucket.pending_total += perOrderAmount;
      }
    });
  });

  const weeks = [...weekBuckets.values()].sort((a, b) => {
    if (a.sortValue !== b.sortValue) return a.sortValue - b.sortValue;
    return a.label.localeCompare(b.label, 'es');
  });

  const makeCell = (text, className) => {
    const td = document.createElement('td');
    td.className = `pivot-cell ${className || ''}`.trim();
    td.textContent = text || '';
    return td;
  };

  const attachPivotToggle = (cell, row, labelText, collapsedByDefault = false) => {
    cell.classList.add('pivot-toggle-cell');
    const label = document.createElement('span');
    label.className = 'pivot-toggle-label';
    label.textContent = labelText || '';
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'pivot-toggle';
    toggle.setAttribute('aria-expanded', collapsedByDefault ? 'false' : 'true');
    toggle.setAttribute('aria-label', collapsedByDefault ? 'Expandir' : 'Contraer');
    toggle.textContent = collapsedByDefault ? '+' : '-';
    cell.textContent = '';
    cell.appendChild(toggle);
    cell.appendChild(label);
    row.dataset.collapsed = collapsedByDefault ? 'true' : 'false';
  };

  const makeRow = (level, type, weekText, providerText, typeText, orderText, total, statusText, keys, hasChildren) => {
    const tr = document.createElement('tr');
    tr.className = `pivot-row pivot-${type} pivot-level-${level}`;
    tr.dataset.level = String(level);
    tr.dataset.rowType = type;
    if (keys) {
      if (keys.rowKey) tr.dataset.rowKey = keys.rowKey;
      if (keys.parentKey) tr.dataset.parentKey = keys.parentKey;
    }

    const weekCell = makeCell(weekText, 'pivot-week-cell');
    const providerCell = makeCell(providerText, 'pivot-provider-cell');
    const typeCell = makeCell(typeText, 'pivot-type-cell');
    const orderCell = makeCell(orderText, 'pivot-order-cell');

    tr.appendChild(weekCell);
    tr.appendChild(providerCell);
    tr.appendChild(typeCell);
    tr.appendChild(orderCell);
    tr.appendChild(makeCell(formatCurrency(total || 0), 'pivot-total-cell'));
    tr.appendChild(makeCell(statusText || '-', 'pivot-status-cell'));

    if (hasChildren) {
      if (type === 'week') attachPivotToggle(weekCell, tr, weekText, true);
      if (type === 'provider') attachPivotToggle(providerCell, tr, providerText, true);
      if (type === 'type') attachPivotToggle(typeCell, tr, typeText, true);
    }
    return tr;
  };

  const buildRowKey = (level, weekKey, providerKey, typeKey, orderKey) => {
    if (level === 0) return `week:${weekKey}`;
    if (level === 1) return `week:${weekKey}|provider:${providerKey}`;
    if (level === 2) return `week:${weekKey}|provider:${providerKey}|type:${typeKey}`;
    if (level === 3) return `week:${weekKey}|provider:${providerKey}|type:${typeKey}|order:${orderKey}`;
    return '';
  };

  let grandTotal = 0;
  weeks.forEach((weekBucket) => {
    grandTotal += weekBucket.total;
    const weekStatus = weekBucket.pending_total === 0 && weekBucket.total > 0 ? 'Pagado' : 'Pendiente';
    const weekKey = weekBucket.key;
    const hasProviders = weekBucket.providers.size > 0;
    const weekRowKey = buildRowKey(0, weekKey);
    el.dashboardPivotBody.appendChild(
      makeRow(0, 'week', weekBucket.label, '', '', '', weekBucket.total, weekStatus, {
        rowKey: weekRowKey,
      }, hasProviders)
    );

    const providers = [...weekBucket.providers.values()].sort((a, b) => a.label.localeCompare(b.label, 'es'));
    providers.forEach((providerBucket) => {
      const providerKey = providerBucket.key;
      const hasTypes = providerBucket.types.size > 0;
      const providerRowKey = buildRowKey(1, weekKey, providerKey);
      const providerStatus = providerBucket.pending_total === 0 && providerBucket.total > 0 ? 'Pagado' : 'Pendiente';
      el.dashboardPivotBody.appendChild(
        makeRow(1, 'provider', '', providerBucket.label, '', '', providerBucket.total, providerStatus, {
          rowKey: providerRowKey,
          parentKey: weekRowKey,
        }, hasTypes)
      );

      const types = [...providerBucket.types.values()].sort((a, b) => a.label.localeCompare(b.label, 'es'));
      types.forEach((typeBucket) => {
        const typeKey = typeBucket.label || typeBucket.key;
        const hasOrders = typeBucket.orders.size > 0;
        const typeRowKey = buildRowKey(2, weekKey, providerKey, typeKey);
        const typeStatus = typeBucket.pending_total === 0 && typeBucket.total > 0 ? 'Pagado' : 'Pendiente';
        el.dashboardPivotBody.appendChild(
          makeRow(2, 'type', '', '', typeBucket.label, '', typeBucket.total, typeStatus, {
            rowKey: typeRowKey,
            parentKey: providerRowKey,
          }, hasOrders)
        );

        const orders = [...typeBucket.orders.values()].sort((a, b) => a.label.localeCompare(b.label, 'es'));
        orders.forEach((orderBucket) => {
          const orderKey = orderBucket.label || orderBucket.key;
          const orderRowKey = buildRowKey(3, weekKey, providerKey, typeKey, orderKey);
          const orderStatus = orderBucket.pending_total === 0 && orderBucket.total > 0 ? 'Pagado' : 'Pendiente';
          el.dashboardPivotBody.appendChild(
            makeRow(3, 'order', '', '', '', orderBucket.label, orderBucket.total, orderStatus, {
              rowKey: orderRowKey,
              parentKey: typeRowKey,
            }, false)
          );
        });
      });
    });
  });

  const totalRow = document.createElement('tr');
  totalRow.className = 'pivot-row pivot-grand';
  totalRow.innerHTML = `
    <td class="pivot-cell" colspan="4">Total general</td>
    <td class="pivot-cell pivot-total-cell">${formatCurrency(grandTotal)}</td>
    <td class="pivot-cell pivot-status-cell">-</td>
  `;
  el.dashboardPivotBody.appendChild(totalRow);

  bindPivotToggles();
}

function bindPivotToggles() {
  if (!el.dashboardPivotBody) return;
  const rows = [...el.dashboardPivotBody.querySelectorAll('.pivot-row')];
  if (!rows.length) return;

  const rowMap = new Map();
  rows.forEach((row) => {
    if (row.dataset.rowKey) {
      rowMap.set(row.dataset.rowKey, row);
    }
  });

  const applyVisibility = () => {
    rows.forEach((row) => {
      const level = Number(row.dataset.level || 0);
      if (!level) {
        row.classList.remove('is-hidden');
        return;
      }
      let parentKey = row.dataset.parentKey;
      let hidden = false;
      while (parentKey) {
        const parent = rowMap.get(parentKey);
        if (parent && parent.dataset.collapsed === 'true') {
          hidden = true;
          break;
        }
        parentKey = parent ? parent.dataset.parentKey : '';
      }
      row.classList.toggle('is-hidden', hidden);
    });
  };

  el.dashboardPivotBody.querySelectorAll('.pivot-toggle').forEach((btn) => {
    btn.addEventListener('click', () => {
      const row = btn.closest('tr');
      if (!row) return;
      const collapsed = row.dataset.collapsed === 'true';
      row.dataset.collapsed = collapsed ? 'false' : 'true';
      btn.textContent = row.dataset.collapsed === 'true' ? '+' : '-';
      btn.setAttribute('aria-expanded', row.dataset.collapsed === 'true' ? 'false' : 'true');
      btn.setAttribute('aria-label', row.dataset.collapsed === 'true' ? 'Expandir' : 'Contraer');
      applyVisibility();
    });
  });

  applyVisibility();
}

function _populateGanttYearFilter(gantt) {
  const select = document.getElementById('gantt-year-filter');
  if (!select) return;
  const years = [...new Set((gantt.weeks || []).map((w) => w.year).filter(Boolean))].sort((a, b) => a - b);
  const currentVal = select.value;
  select.innerHTML = '<option value="">Todos los años</option>';
  years.forEach((y) => {
    const opt = document.createElement('option');
    opt.value = String(y);
    opt.textContent = String(y);
    select.appendChild(opt);
  });
  const currentYear = new Date().getFullYear();
  if (years.includes(currentYear)) {
    select.value = String(currentYear);
  } else if (currentVal && years.includes(Number(currentVal))) {
    select.value = currentVal;
  } else if (years.length > 0) {
    select.value = String(years[years.length - 1]);
  }
}

function _formatGanttValue(amount) {
  if (!amount || amount === 0) return '-';
  return '$ ' + Math.round(amount).toLocaleString('es-CO');
}

function renderGantt(gantt, yearFilter) {
  if (!el.ganttChart) return;
  let weeks = (gantt && gantt.weeks) || [];
  const vendors = (gantt && gantt.vendors) || [];

  if (yearFilter) {
    const yearNum = Number(yearFilter);
    weeks = weeks.filter((w) => w.year === yearNum);
  }

  const weeklyTotals = {};

  if (!weeks.length || !vendors.length) {
    el.ganttChart.innerHTML = '<p class="form-help">Sin datos para el diagrama.</p>';
    return;
  }

  const grid = document.createElement('div');
  grid.className = 'gantt-grid';
  grid.style.gridTemplateColumns = `220px repeat(${weeks.length}, minmax(150px, 1fr))`;

  const headVendor = document.createElement('div');
  headVendor.className = 'gantt-head gantt-sticky';
  headVendor.textContent = 'Proveedor';
  grid.appendChild(headVendor);

  weeks.forEach((weekObj) => {
    const cell = document.createElement('div');
    cell.className = 'gantt-head gantt-head-week';
    const weekNum = document.createElement('span');
    weekNum.className = 'gantt-head-weeknum';
    weekNum.textContent = `Sem ${weekObj.week}`;
    cell.appendChild(weekNum);
    if (weekObj.year) {
      const weekYear = document.createElement('span');
      weekYear.className = 'gantt-head-weekyear';
      weekYear.textContent = `(${weekObj.year})`;
      cell.appendChild(weekYear);
    }
    grid.appendChild(cell);
    weeklyTotals[weekObj.key] = 0;
  });

  vendors.forEach((vendor) => {
    const nameCell = document.createElement('div');
    nameCell.className = 'gantt-vendor gantt-sticky';
    const vendorName = vendor.vendor_name || 'Sin proveedor';
    const vendorCategory = vendor.vendor_category || 'Normal';
    nameCell.textContent = `${vendorName} (${vendorCategory})`;
    grid.appendChild(nameCell);

    weeks.forEach((weekObj) => {
      const key = weekObj.key;
      const entry = (vendor.weeks && vendor.weeks[key]) || null;
      const cell = document.createElement('div');
      cell.className = 'gantt-cell';
      if (entry) {
        weeklyTotals[key] += entry.total || 0;
        const priority = entry.priority || 'Baja';
        if (priority === 'Alta') cell.classList.add('gantt-high');
        if (priority === 'Media') cell.classList.add('gantt-medium');
        if (priority === 'Baja') cell.classList.add('gantt-low');
        cell.innerHTML = `<span class="gantt-value">${_formatGanttValue(entry.total)}</span>`;
        const status = entry.status || 'Pendiente';
        if (status === 'Pagado') cell.classList.add('gantt-paid');
        cell.dataset.week = weekObj.week;
        cell.dataset.weekYear = weekObj.year || '';
        if (vendor.vendor_id !== null && vendor.vendor_id !== undefined) {
          cell.dataset.providerId = vendor.vendor_id;
          cell.classList.add('gantt-has-toggle');
          const toggleBtn = document.createElement('button');
          toggleBtn.type = 'button';
          toggleBtn.className = 'gantt-status-toggle';
          toggleBtn.textContent = status === 'Pagado' ? '✓' : '○';
          toggleBtn.setAttribute('aria-label', status === 'Pagado' ? 'Marcar como pendiente' : 'Marcar como pagado');
          toggleBtn.addEventListener('click', async (evt) => {
            evt.preventDefault();
            evt.stopPropagation();
            const nextStatus = status === 'Pagado' ? 'Pendiente' : 'Pagado';
            toggleBtn.disabled = true;
            try {
              await updateGanttStatus({
                providerId: vendor.vendor_id,
                week: weekObj.week,
                weekYear: weekObj.year,
                status: nextStatus,
              });
            } catch (error) {
              alert(error.message);
            } finally {
              toggleBtn.disabled = false;
            }
          });
          const valueEl = cell.querySelector('.gantt-value');
          cell.insertBefore(toggleBtn, valueEl);
        }
        if (entry.details && entry.details.length) {
          cell.classList.add('gantt-has-tooltip');
          cell.dataset.tooltip = JSON.stringify({
            vendorName,
            vendorCategory,
            week: weekObj.week,
            year: weekObj.year,
            total: entry.total || 0,
            status: entry.status || 'Pendiente',
            details: entry.details,
          });
        }
      } else {
        cell.textContent = '-';
      }
      grid.appendChild(cell);
    });
  });

  const totalLabel = document.createElement('div');
  totalLabel.className = 'gantt-vendor gantt-sticky gantt-total';
  totalLabel.textContent = 'Total semana';
  grid.appendChild(totalLabel);

  weeks.forEach((weekObj) => {
    const key = weekObj.key;
    const cell = document.createElement('div');
    cell.className = 'gantt-cell gantt-total-cell';
    cell.innerHTML = `<span class="gantt-value">${_formatGanttValue(weeklyTotals[key] || 0)}</span>`;
    grid.appendChild(cell);
  });

  el.ganttChart.innerHTML = '';
  el.ganttChart.appendChild(grid);
  bindGanttTooltip(grid);
}

function openEditPaymentModal(payment) {
  const data = payment.data_json;
  if (el.paymentForm) {
    el.paymentForm.reset();
    el.paymentForm.querySelector('[name="id"]').value = payment.id;
    el.paymentForm.querySelector('[name="date"]').value = data.date || '';
    el.paymentForm.querySelector('[name="status"]').value = data.status || 'Pendiente';
    const providerSel = el.paymentForm.querySelector('[name="provider_id"]');
    if (providerSel) {
      populateProviderSelect(providerSel);
      providerSel.value = data.provider_id || '';
    }
  }
  if (el.itemsContainer) {
    el.itemsContainer.innerHTML = '';
    const items = data.items && data.items.length ? data.items : [];
    if (items.length) {
      items.forEach((item) => addItemRow(item));
    } else {
      addItemRow();
    }
  }
  if (el.paymentModalTitle) {
    el.paymentModalTitle.textContent = `Editar pago #${payment.id}`;
  }
  openModal(el.paymentModal);
}

function renderPayments(payments) {
  el.paymentsTable.innerHTML = '';
  const isAdmin = state.role === 'ADMIN';
  payments.forEach((p) => {
    const data = p.data_json;
    const items = data.items || [];
    const invoices = items.length ? items.map((item) => item.invoice) : (data.invoices || []);
    let products = items.length ? items.map((item) => item.product_name) : (data.product_names || []);
    if (!products.length && data.product_name) products = [data.product_name];
    const tr = document.createElement('tr');
    const editBtn = isAdmin ? `<button class="btn outline small" data-edit-id="${p.id}">Editar</button>` : '';
    tr.innerHTML = `
      <td class="catalog-select-col"><input type="checkbox" class="catalog-select" value="${p.id}"></td>
      <td>${p.id}</td>
      <td>${data.provider_name || '-'}</td>
      <td>${formatCompactList(invoices)}</td>
      <td>${formatCompactList(products)}</td>
      <td>${data.date || '-'}</td>
      <td>${data.week || '-'}</td>
      <td>${formatCurrency(data.amount)}</td>
      <td>${data.status}</td>
      <td>
        <button class="btn ghost small" data-id="${p.id}" data-status="${data.status}">Cambiar</button>
        ${editBtn}
      </td>
    `;
    el.paymentsTable.appendChild(tr);
  });

  if (typeof bindCatalogSelection === 'function') {
    bindCatalogSelection(el.paymentsTable, el.paymentsSelectAll, el.paymentsBulkDelete);
  }

  el.paymentsTable.querySelectorAll('[data-id]').forEach((btn) => {
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

  if (isAdmin) {
    el.paymentsTable.querySelectorAll('[data-edit-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.editId;
        const payment = payments.find((p) => String(p.id) === String(id));
        if (payment) openEditPaymentModal(payment);
      });
    });
  }

  if (el.paymentSearch) {
    applyTableSearch('payments-table', el.paymentSearch.value);
  } else {
    applyPagination('payments-table');
  }
}
