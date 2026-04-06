// ==================== ANALYSIS MODULE ====================

let _analysisData = null;

const AN_CAT_ORDER = { Alta: 0, Media: 1, Baja: 2, Normal: 3 };
const AN_CAT_COLOR = { Alta: 'cat-alta', Media: 'cat-media', Baja: 'cat-baja', Normal: 'cat-normal' };

function _anFmt(n) { return formatCurrency(n || 0); }
function _anPct(part, total) { if (!total) return 0; return Math.min(100, Math.round((part / total) * 100)); }
function _anCatBadge(cat) {
  const cls = AN_CAT_COLOR[cat] || 'cat-normal';
  return `<span class="an-cat-badge ${cls}">${cat || 'Normal'}</span>`;
}
function _anTagsHtml(list, cls, max) {
  const shown = (list || []).slice(0, max);
  const more = (list || []).length - max;
  return shown.map((t) => `<span class="psum-tag ${cls}" title="${t}">${t}</span>`).join('')
    + (more > 0 ? `<span class="psum-tag">+${more} mas</span>` : '');
}
function _anExpandCard(card) {
  const header = card.querySelector('.psum-provider-card-header');
  const body = card.querySelector('.psum-provider-card-body');
  const icon = card.querySelector('.psum-expand-icon');
  if (!header || !body) return;
  header.addEventListener('click', () => {
    const open = body.classList.toggle('open');
    icon.textContent = open ? '\u25B2' : '\u25BC';
  });
}

// ---- Show More helper (lista de elementos hijos) ----
function _anApplyShowMore(container, initialVisible, step) {
  const items = [...container.children].filter((el) => !el.classList.contains('an-show-more-row'));
  if (items.length <= initialVisible) return;

  let shown = initialVisible;
  items.slice(shown).forEach((el) => { el.style.display = 'none'; });

  const btn = document.createElement('button');
  btn.className = 'btn ghost small an-show-more-row an-show-more-btn';

  const update = () => {
    const remaining = items.length - shown;
    if (remaining > 0) {
      btn.innerHTML = `&#9660; Ver m&aacute;s &mdash; ${remaining} registro${remaining !== 1 ? 's' : ''} m&aacute;s`;
    } else {
      btn.innerHTML = '&#9650; Ver menos';
    }
  };

  btn.addEventListener('click', () => {
    if (shown < items.length) {
      const next = Math.min(shown + step, items.length);
      items.slice(shown, next).forEach((el) => { el.style.display = ''; });
      shown = next;
    } else {
      items.slice(initialVisible).forEach((el) => { el.style.display = 'none'; });
      shown = initialVisible;
      container.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    update();
  });

  update();
  container.appendChild(btn);
}

// ---- Show More helper para <tbody> de tablas ----
function _anApplyTableShowMore(tbody, initialVisible, step) {
  const rows = [...tbody.querySelectorAll('tr')].filter((r) => !r.classList.contains('an-show-more-row'));
  if (rows.length <= initialVisible) return;

  let shown = initialVisible;
  rows.slice(shown).forEach((r) => { r.style.display = 'none'; });

  const colCount = rows[0] ? rows[0].cells.length : 4;
  const tr = document.createElement('tr');
  tr.className = 'an-show-more-row';
  const td = document.createElement('td');
  td.colSpan = colCount;
  tr.appendChild(td);

  const btn = document.createElement('button');
  btn.className = 'an-show-more-btn';

  const update = () => {
    const remaining = rows.length - shown;
    if (remaining > 0) {
      btn.innerHTML = `&#9660; Ver m&aacute;s &mdash; ${remaining} fila${remaining !== 1 ? 's' : ''} m&aacute;s`;
    } else {
      btn.innerHTML = '&#9650; Ver menos';
    }
  };

  btn.addEventListener('click', () => {
    if (shown < rows.length) {
      const next = Math.min(shown + step, rows.length);
      rows.slice(shown, next).forEach((r) => { r.style.display = ''; });
      shown = next;
    } else {
      rows.slice(initialVisible).forEach((r) => { r.style.display = 'none'; });
      shown = initialVisible;
    }
    update();
  });

  update();
  td.appendChild(btn);
  tbody.appendChild(tr);
}

// ---- Date helpers ----
function _anIsoDate(d) {
  return d.toISOString().slice(0, 10);
}

function _anDateShortcut(key) {
  const today = new Date();
  const y = today.getFullYear();
  const m = today.getMonth();
  switch (key) {
    case 'month':
      return { from: _anIsoDate(new Date(y, m, 1)), to: _anIsoDate(today) };
    case 'quarter': {
      const d = new Date(today);
      d.setMonth(d.getMonth() - 3);
      return { from: _anIsoDate(d), to: _anIsoDate(today) };
    }
    case 'year':
      return { from: `${y}-01-01`, to: _anIsoDate(today) };
    case 'prev_year':
      return { from: `${y - 1}-01-01`, to: `${y - 1}-12-31` };
    case 'all':
    default:
      return { from: '', to: '' };
  }
}

function _anSetDateInputs(from, to) {
  const df = document.getElementById('an-filter-date-from');
  const dt = document.getElementById('an-filter-date-to');
  if (df) df.value = from || '';
  if (dt) dt.value = to || '';
}

function _anUpdateActiveRange() {
  const from = (document.getElementById('an-filter-date-from') || {}).value || '';
  const to = (document.getElementById('an-filter-date-to') || {}).value || '';
  const wrap = document.getElementById('an-active-range');
  const label = document.getElementById('an-active-range-label');
  if (!wrap || !label) return;
  if (from || to) {
    label.textContent = `Periodo: ${from || '…'} → ${to || '…'}`;
    wrap.style.display = '';
  } else {
    wrap.style.display = 'none';
  }
}

// ---- Filter logic ----
function _anGetFilters() {
  return {
    provider: (document.getElementById('an-filter-provider') || {}).value || '',
    brand: (document.getElementById('an-filter-brand') || {}).value || '',
    category: (document.getElementById('an-filter-category') || {}).value || '',
    date_from: (document.getElementById('an-filter-date-from') || {}).value || '',
    date_to: (document.getElementById('an-filter-date-to') || {}).value || '',
  };
}

function _anPopulateFilters(data) {
  const provSel = document.getElementById('an-filter-provider');
  const brandSel = document.getElementById('an-filter-brand');
  if (!data) return;
  if (provSel) {
    const cur = provSel.value;
    provSel.innerHTML = '<option value="">Todos</option>';
    (data.providers || []).forEach((p) => {
      const o = document.createElement('option');
      o.value = p.name; o.textContent = p.name;
      provSel.appendChild(o);
    });
    if (cur) provSel.value = cur;
  }
  if (brandSel) {
    const cur = brandSel.value;
    brandSel.innerHTML = '<option value="">Todas</option>';
    (data.brands || []).forEach((b) => {
      const o = document.createElement('option');
      o.value = b.name; o.textContent = b.name;
      brandSel.appendChild(o);
    });
    if (cur) brandSel.value = cur;
  }
}

function _anApplyFilters(data, filters) {
  if (!data) return data;
  const fp = (filters.provider || '').toLowerCase();
  const fb = (filters.brand || '').toLowerCase();
  const fc = (filters.category || '').toLowerCase();
  if (!fp && !fb && !fc) return data;

  const providers = (data.providers || []).filter((p) => {
    const mp = !fp || p.name.toLowerCase() === fp;
    const mb = !fb || p.brands.some((b) => b.toLowerCase() === fb);
    const mc = !fc || (p.category || 'normal').toLowerCase() === fc;
    return mp && mb && mc;
  });
  const brands = (data.brands || []).filter((b) => {
    const mp = !fp || b.providers.some((p) => p.toLowerCase() === fp);
    const mb = !fb || b.name.toLowerCase() === fb;
    const mc = !fc || (b.category || 'normal').toLowerCase() === fc;
    return mp && mb && mc;
  });
  const products = (data.products || []).filter((p) => {
    const mp = !fp || p.providers.some((prov) => prov.toLowerCase() === fp);
    const mb = !fb || p.brands.some((b) => b.toLowerCase() === fb);
    const mc = !fc || (p.category || 'normal').toLowerCase() === fc;
    return mp && mb && mc;
  });

  const filterCombos = (list, k1, k2) => (list || []).filter((r) => {
    const mp = !fp || !k1 || (r[k1] || '').toLowerCase() === fp;
    const mb = !fb || !k2 || (r[k2] || '').toLowerCase() === fb;
    return mp && mb;
  });

  const total = providers.reduce((s, p) => s + p.total, 0);
  const ocs = providers.reduce((s, p) => s + p.oc_count, 0);

  const filterCatBucket = (list) => (list || []).filter((b) => {
    const mc = !fc || (b.category || 'normal').toLowerCase() === fc;
    return mc;
  });

  return {
    ...data,
    kpis: {
      total_invested: total,
      total_ocs: ocs,
      unique_providers: providers.length,
      unique_brands: brands.length,
      unique_products: products.length,
      avg_per_oc: ocs ? total / ocs : 0,
    },
    providers,
    brands,
    products,
    top_provider_brand: filterCombos(data.top_provider_brand, 'provider', 'brand'),
    top_provider_product: filterCombos(data.top_provider_product, 'provider', null),
    top_brand_product: filterCombos(data.top_brand_product, null, 'brand'),
    by_provider_category: filterCatBucket(data.by_provider_category),
    by_brand_category: filterCatBucket(data.by_brand_category),
    by_product_category: filterCatBucket(data.by_product_category),
    category_matrix: (data.category_matrix || []).filter((r) => {
      return !fc || r.provider_cat.toLowerCase() === fc || r.brand_cat.toLowerCase() === fc;
    }),
    monthly_trend: data.monthly_trend,
  };
}

// ---- KPIs ----
function _anRenderKPIs(kpis) {
  const c = document.getElementById('an-kpis');
  if (!c) return;
  const items = [
    { label: 'Total invertido', value: _anFmt(kpis.total_invested), sub: 'en compras' },
    { label: 'Ordenes de compra', value: String(kpis.total_ocs), sub: 'registradas' },
    { label: 'Proveedores', value: String(kpis.unique_providers), sub: 'distintos' },
    { label: 'Marcas', value: String(kpis.unique_brands), sub: 'distintas' },
    { label: 'Productos', value: String(kpis.unique_products), sub: 'distintos' },
    { label: 'Promedio por OC', value: _anFmt(kpis.avg_per_oc), sub: 'por orden' },
  ];
  c.innerHTML = items.map((it) => `
    <div class="psum-kpi-card">
      <span class="psum-kpi-label">${it.label}</span>
      <strong class="psum-kpi-value">${it.value}</strong>
      <span class="psum-kpi-sub">${it.sub}</span>
    </div>`).join('');
}

// ---- Tendencia ----
function _anRenderTrend(trend) {
  const c = document.getElementById('an-trend-chart');
  if (!c) return;
  if (!trend || !trend.length) { c.innerHTML = '<p class="psum-empty-msg">Sin datos.</p>'; return; }
  const maxVal = Math.max(...trend.map((t) => t.total), 1);
  c.innerHTML = trend.map((row) => `
    <div class="psum-bar-row">
      <span class="psum-bar-label">${row.month}</span>
      <div class="psum-bar-track"><div class="psum-bar-fill" style="width:${_anPct(row.total, maxVal)}%"></div></div>
      <span class="psum-bar-amount">${_anFmt(row.total)}</span>
    </div>`).join('');
}

// ---- Rankings ----
function _anRenderRankList(containerId, items, colorClass) {
  const c = document.getElementById(containerId);
  if (!c) return;
  if (!items || !items.length) { c.innerHTML = '<p class="psum-empty-msg">Sin datos.</p>'; return; }
  const maxVal = Math.max(...items.map((i) => i.total), 1);
  c.innerHTML = items.map((item, idx) => `
    <div class="psum-rank-item">
      <span class="psum-rank-num">${idx + 1}</span>
      <div class="psum-rank-bar-wrap">
        <div class="an-rank-name-row">
          <span class="psum-rank-name" title="${item.name}">${item.name}</span>
          ${item.category ? _anCatBadge(item.category) : ''}
        </div>
        <div class="psum-rank-track">
          <div class="psum-rank-fill ${colorClass}" style="width:${_anPct(item.total, maxVal)}%"></div>
        </div>
      </div>
      <span class="psum-rank-amount">${_anFmt(item.total)}</span>
    </div>`).join('');
  _anApplyShowMore(c, 5, 5);
}

// ---- Tablas combinaciones ----
function _anRenderComboTable(tableId, rows, k1, k2) {
  const table = document.getElementById(tableId);
  if (!table) return;
  const tbody = table.querySelector('tbody');
  if (!rows || !rows.length) { tbody.innerHTML = '<tr><td colspan="4" class="psum-empty-msg">Sin datos.</td></tr>'; return; }
  tbody.innerHTML = rows.map((row, idx) => `
    <tr>
      <td>${idx + 1}</td>
      <td title="${row[k1] || ''}">${row[k1] || '-'}</td>
      <td title="${row[k2] || ''}">${row[k2] || '-'}</td>
      <td>${_anFmt(row.total)}</td>
    </tr>`).join('');
  _anApplyTableShowMore(tbody, 8, 8);
}

// ---- Analisis por categoria (cards expandibles) ----
function _anRenderCatGrid(containerId, buckets, grandTotal) {
  const c = document.getElementById(containerId);
  if (!c) return;
  if (!buckets || !buckets.length) { c.innerHTML = '<p class="psum-empty-msg">Sin datos.</p>'; return; }
  c.innerHTML = '';
  buckets.forEach((b) => {
    const cat = b.category;
    const pct = _anPct(b.total, grandTotal);
    const card = document.createElement('div');
    card.className = 'psum-provider-card an-cat-card';
    card.innerHTML = `
      <div class="psum-provider-card-header an-cat-card-header">
        <div class="psum-provider-title">
          ${_anCatBadge(cat)}
          <div class="an-cat-meta-inline">
            <span>${b.provider_count} proveedor${b.provider_count !== 1 ? 'es' : ''}</span>
            <span>&middot;</span>
            <span>${b.brand_count} marca${b.brand_count !== 1 ? 's' : ''}</span>
            <span>&middot;</span>
            <span>${b.product_count} producto${b.product_count !== 1 ? 's' : ''}</span>
          </div>
        </div>
        <div class="psum-provider-meta">
          <span class="psum-meta-chip total">${_anFmt(b.total)}</span>
          <span class="psum-meta-chip">${pct}% del total</span>
        </div>
        <span class="psum-expand-icon">&#9660;</span>
      </div>
      <div class="psum-provider-card-body an-cat-card-body">
        <div class="an-cat-bar-wrap">
          <div class="an-cat-bar-track">
            <div class="an-cat-bar-fill ${AN_CAT_COLOR[cat] || 'cat-normal'}" style="width:${pct}%"></div>
          </div>
        </div>
        <div class="psum-rel-section">
          <div class="psum-rel-title">Proveedores en esta categoria (${b.provider_count})</div>
          <div class="psum-tag-list">${_anTagsHtml(b.providers, '', 12)}</div>
        </div>
        <div class="psum-rel-section">
          <div class="psum-rel-title">Marcas en esta categoria (${b.brand_count})</div>
          <div class="psum-tag-list">${_anTagsHtml(b.brands, 'brand-tag', 12)}</div>
        </div>
        <div class="psum-rel-section">
          <div class="psum-rel-title">Productos en esta categoria (${b.product_count})</div>
          <div class="psum-tag-list">${_anTagsHtml(b.products, 'product-tag', 12)}</div>
        </div>
      </div>
    `;
    _anExpandCard(card);
    c.appendChild(card);
  });
}

// ---- Matriz Proveedor-Cat x Marca-Cat ----
function _anRenderCatMatrix(matrixData) {
  const c = document.getElementById('an-cat-matrix');
  if (!c) return;
  if (!matrixData || !matrixData.length) { c.innerHTML = '<p class="psum-empty-msg">Sin datos.</p>'; return; }

  const cats = ['Alta', 'Media', 'Baja', 'Normal'];
  const lookup = {};
  matrixData.forEach((r) => { lookup[`${r.provider_cat}|||${r.brand_cat}`] = r.total; });
  const grandTotal = matrixData.reduce((s, r) => s + r.total, 0);

  let html = '<table class="an-matrix-table"><thead><tr>';
  html += '<th class="an-matrix-corner">Proveedor \\ Marca</th>';
  cats.forEach((c2) => { html += `<th>${_anCatBadge(c2)}</th>`; });
  html += '</tr></thead><tbody>';

  cats.forEach((provCat) => {
    html += `<tr><td class="an-matrix-row-header">${_anCatBadge(provCat)}</td>`;
    cats.forEach((brandCat) => {
      const val = lookup[`${provCat}|||${brandCat}`] || 0;
      const pct = _anPct(val, grandTotal);
      const intensity = Math.round((pct / 100) * 9);
      html += `<td class="an-matrix-cell" style="--intensity:${intensity}">
        <span class="an-matrix-val">${val ? _anFmt(val) : '—'}</span>
        ${val ? `<span class="an-matrix-pct">${pct}%</span>` : ''}
      </td>`;
    });
    html += '</tr>';
  });

  html += '</tbody></table>';
  c.innerHTML = html;
}

// ---- Detalle relacional por proveedor ----
function _anRenderProviderDetail(providers, grandTotal) {
  const c = document.getElementById('an-provider-detail');
  if (!c) return;
  if (!providers || !providers.length) { c.innerHTML = '<p class="psum-empty-msg">Sin proveedores.</p>'; return; }
  c.innerHTML = '';
  providers.forEach((prov, idx) => {
    const sharePct = _anPct(prov.total, grandTotal);
    const card = document.createElement('div');
    card.className = 'psum-provider-card';
    card.innerHTML = `
      <div class="psum-provider-card-header">
        <div class="psum-provider-title">
          <span class="psum-provider-rank">#${idx + 1}</span>
          <span class="psum-provider-name" title="${prov.name}">${prov.name}</span>
          ${_anCatBadge(prov.category)}
        </div>
        <div class="psum-provider-meta">
          <span class="psum-meta-chip total">${_anFmt(prov.total)}</span>
          <span class="psum-meta-chip">${sharePct}% del total</span>
          <span class="psum-meta-chip">${prov.oc_count} OC${prov.oc_count !== 1 ? 's' : ''}</span>
          <span class="psum-meta-chip">${prov.brand_count} marca${prov.brand_count !== 1 ? 's' : ''}</span>
          <span class="psum-meta-chip">${prov.product_count} producto${prov.product_count !== 1 ? 's' : ''}</span>
        </div>
        <span class="psum-expand-icon">&#9660;</span>
      </div>
      <div class="psum-provider-card-body">
        <div class="an-share-bar"><div class="an-share-fill" style="width:${sharePct}%"></div></div>
        <div class="psum-rel-section">
          <div class="psum-rel-title">Marcas compradas a este proveedor (${prov.brand_count})</div>
          <div class="psum-tag-list">${_anTagsHtml(prov.brands, 'brand-tag', 15)}</div>
        </div>
        <div class="psum-rel-section">
          <div class="psum-rel-title">Productos comprados a este proveedor (${prov.product_count})</div>
          <div class="psum-tag-list">${_anTagsHtml(prov.products, 'product-tag', 15)}</div>
        </div>
      </div>`;
    _anExpandCard(card);
    c.appendChild(card);
  });
  _anApplyShowMore(c, 5, 5);
}

// ---- Detalle relacional por marca ----
function _anRenderBrandDetail(brands, grandTotal) {
  const c = document.getElementById('an-brand-detail');
  if (!c) return;
  if (!brands || !brands.length) { c.innerHTML = '<p class="psum-empty-msg">Sin marcas.</p>'; return; }
  c.innerHTML = '';
  brands.forEach((brand, idx) => {
    const sharePct = _anPct(brand.total, grandTotal);
    const card = document.createElement('div');
    card.className = 'psum-provider-card';
    card.innerHTML = `
      <div class="psum-provider-card-header">
        <div class="psum-provider-title">
          <span class="psum-provider-rank">#${idx + 1}</span>
          <span class="psum-provider-name" title="${brand.name}">${brand.name}</span>
          ${_anCatBadge(brand.category)}
        </div>
        <div class="psum-provider-meta">
          <span class="psum-meta-chip total">${_anFmt(brand.total)}</span>
          <span class="psum-meta-chip">${sharePct}% del total</span>
          <span class="psum-meta-chip">${brand.provider_count} proveedor${brand.provider_count !== 1 ? 'es' : ''}</span>
          <span class="psum-meta-chip">${brand.product_count} producto${brand.product_count !== 1 ? 's' : ''}</span>
        </div>
        <span class="psum-expand-icon">&#9660;</span>
      </div>
      <div class="psum-provider-card-body">
        <div class="an-share-bar"><div class="an-share-fill brand" style="width:${sharePct}%"></div></div>
        <div class="psum-rel-section">
          <div class="psum-rel-title">Proveedores que suministran esta marca (${brand.provider_count})</div>
          <div class="psum-tag-list">${_anTagsHtml(brand.providers, '', 15)}</div>
        </div>
        <div class="psum-rel-section">
          <div class="psum-rel-title">Productos de esta marca (${brand.product_count})</div>
          <div class="psum-tag-list">${_anTagsHtml(brand.products, 'product-tag', 15)}</div>
        </div>
      </div>`;
    _anExpandCard(card);
    c.appendChild(card);
  });
  _anApplyShowMore(c, 5, 5);
}

// ---- Detalle relacional por producto ----
function _anRenderProductDetail(products, grandTotal) {
  const c = document.getElementById('an-product-detail');
  if (!c) return;
  if (!products || !products.length) { c.innerHTML = '<p class="psum-empty-msg">Sin productos.</p>'; return; }
  c.innerHTML = '';
  products.forEach((prod, idx) => {
    const sharePct = _anPct(prod.total, grandTotal);
    const card = document.createElement('div');
    card.className = 'psum-provider-card';
    card.innerHTML = `
      <div class="psum-provider-card-header">
        <div class="psum-provider-title">
          <span class="psum-provider-rank">#${idx + 1}</span>
          <span class="psum-provider-name" title="${prod.name}">${prod.name}</span>
          ${_anCatBadge(prod.category)}
        </div>
        <div class="psum-provider-meta">
          <span class="psum-meta-chip total">${_anFmt(prod.total)}</span>
          <span class="psum-meta-chip">${sharePct}% del total</span>
          <span class="psum-meta-chip">Qty: ${prod.qty}</span>
          <span class="psum-meta-chip">${prod.brand_count} marca${prod.brand_count !== 1 ? 's' : ''}</span>
          <span class="psum-meta-chip">${prod.provider_count} proveedor${prod.provider_count !== 1 ? 'es' : ''}</span>
        </div>
        <span class="psum-expand-icon">&#9660;</span>
      </div>
      <div class="psum-provider-card-body">
        <div class="an-share-bar"><div class="an-share-fill product" style="width:${sharePct}%"></div></div>
        <div class="psum-rel-section">
          <div class="psum-rel-title">Marcas de este producto (${prod.brand_count})</div>
          <div class="psum-tag-list">${_anTagsHtml(prod.brands, 'brand-tag', 15)}</div>
        </div>
        <div class="psum-rel-section">
          <div class="psum-rel-title">Proveedores que lo suministran (${prod.provider_count})</div>
          <div class="psum-tag-list">${_anTagsHtml(prod.providers, '', 15)}</div>
        </div>
      </div>`;
    _anExpandCard(card);
    c.appendChild(card);
  });
  _anApplyShowMore(c, 5, 5);
}

// ---- Render principal ----
function renderAnalysis(data, filters) {
  const fd = _anApplyFilters(data, filters || { provider: '', brand: '', category: '' });
  const grandTotal = (fd.kpis || {}).total_invested || 0;

  _anRenderKPIs(fd.kpis || {});
  _anRenderTrend(fd.monthly_trend || []);
  _anRenderRankList('an-top-providers', fd.providers, '');
  _anRenderRankList('an-top-brands', fd.brands, 'brand');
  _anRenderRankList('an-top-products', fd.products, 'product');
  _anRenderCatGrid('an-by-prov-cat', fd.by_provider_category, grandTotal);
  _anRenderCatGrid('an-by-brand-cat', fd.by_brand_category, grandTotal);
  _anRenderCatGrid('an-by-prod-cat', fd.by_product_category, grandTotal);
  _anRenderCatMatrix(fd.category_matrix);
  _anRenderComboTable('an-prov-brand-table', fd.top_provider_brand, 'provider', 'brand');
  _anRenderComboTable('an-prov-product-table', fd.top_provider_product, 'provider', 'product');
  _anRenderComboTable('an-brand-product-table', fd.top_brand_product, 'brand', 'product');
  _anRenderProviderDetail(fd.providers, grandTotal);
  _anRenderBrandDetail(fd.brands, grandTotal);
  _anRenderProductDetail(fd.products, grandTotal);
}

// ---- Cargar datos ----
async function loadAnalysis() {
  const loadingEl = document.getElementById('analysis-loading');
  if (loadingEl) loadingEl.style.display = '';
  _anUpdateActiveRange();
  try {
    const filters = _anGetFilters();
    const params = new URLSearchParams();
    if (filters.date_from) params.set('date_from', filters.date_from);
    if (filters.date_to) params.set('date_to', filters.date_to);
    const qs = params.toString() ? `?${params.toString()}` : '';
    const response = await apiFetch(`/purchases/summary${qs}`);
    _analysisData = await response.json();
    _anPopulateFilters(_analysisData);
    renderAnalysis(_analysisData, filters);
  } catch (err) {
    console.error('Error cargando analisis:', err);
  } finally {
    if (loadingEl) loadingEl.style.display = 'none';
  }
}

// ---- Bindings ----
(function _anInitBindings() {
  const refreshBtn = document.getElementById('analysis-refresh-btn');
  if (refreshBtn) refreshBtn.addEventListener('click', loadAnalysis);

  // Dates trigger a backend refetch
  ['an-filter-date-from', 'an-filter-date-to'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', () => { _anUpdateActiveRange(); loadAnalysis(); });
  });

  // Shortcuts set date inputs + refetch
  document.querySelectorAll('.an-shortcut-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.an-shortcut-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      const range = _anDateShortcut(btn.dataset.shortcut);
      _anSetDateInputs(range.from, range.to);
      _anUpdateActiveRange();
      loadAnalysis();
    });
  });

  // Provider / brand / category just re-render from cache (no refetch)
  const onFilterChange = () => { if (_analysisData) renderAnalysis(_analysisData, _anGetFilters()); };
  ['an-filter-provider', 'an-filter-brand', 'an-filter-category'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', onFilterChange);
  });

  // Reset all
  const resetBtn = document.getElementById('an-filter-reset');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      document.querySelectorAll('.an-shortcut-btn').forEach((b) => b.classList.remove('active'));
      _anSetDateInputs('', '');
      ['an-filter-provider', 'an-filter-brand', 'an-filter-category'].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.value = '';
      });
      loadAnalysis();
    });
  }
}());
