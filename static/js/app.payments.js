function updateOrdersTotal() {
  const inputs = document.querySelectorAll('#orders-container .order-amount-input');
  let total = 0;
  inputs.forEach((i) => { total += Number(i.value || 0); });
  const totalEl = document.getElementById('orders-grand-total');
  if (totalEl) totalEl.textContent = formatCurrency(total);
}

function addOrderRow(data) {
  const container = document.getElementById('orders-container');
  if (!container) return;
  const row = document.createElement('div');
  row.className = 'order-row';
  row.innerHTML = `
    <input type="text" class="order-input" placeholder="Ej: OC-001 o EMB-2026-01" value="${(data && data.order) || ''}">
    <input type="number" class="order-amount-input" placeholder="0.00" min="0" step="0.01" value="${(data && data.amount) || ''}">
    <button type="button" class="btn ghost small remove-order">Quitar</button>
  `;
  row.querySelector('.order-amount-input').addEventListener('input', updateOrdersTotal);
  row.querySelector('.remove-order').addEventListener('click', () => {
    const rows = container.querySelectorAll('.order-row');
    if (rows.length > 1) {
      row.remove();
    } else {
      row.querySelector('.order-input').value = '';
      row.querySelector('.order-amount-input').value = '';
    }
    updateOrdersTotal();
  });
  container.appendChild(row);
  updateOrdersTotal();
}

function clearOrdersForm() {
  const container = document.getElementById('orders-container');
  if (!container) return;
  container.innerHTML = '';
  addOrderRow();
}

function getOrdersFromForm() {
  const rows = document.querySelectorAll('#orders-container .order-row');
  const orders = [];
  rows.forEach((row) => {
    const label = row.querySelector('.order-input').value.trim();
    const amount = Number(row.querySelector('.order-amount-input').value || 0);
    if (label) orders.push({ order: label, amount });
  });
  return orders;
}

async function handleCreatePayment(evt) {
  evt.preventDefault();
  const formData = new FormData(el.paymentForm);
  const payload = Object.fromEntries(formData.entries());
  const paymentId = payload.id;
  delete payload.id;
  delete payload.amount;

  const orders = getOrdersFromForm();
  if (!orders.length) {
    alert('Agrega al menos una OC/Embarque.');
    return;
  }
  const total = orders.reduce((s, o) => s + o.amount, 0);
  if (total <= 0) {
    alert('Ingresa el valor a pagar en al menos una OC.');
    return;
  }
  payload.orders = orders;

  try {
    if (paymentId) {
      await apiFetch(`/payments/${paymentId}`, { method: 'PUT', body: JSON.stringify(payload) });
    } else {
      await apiFetch('/payments', { method: 'POST', body: JSON.stringify(payload) });
    }
    el.paymentForm.reset();
    clearOrdersForm();
    if (el.paymentModal) {
      closeModal(el.paymentModal);
    }
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
    const response = await apiFetch('/payments/upload', { method: 'POST', body: formData });
    const result = await response.json().catch(() => ({}));
    const created = Number(result && result.created);
    if (Number.isFinite(created)) {
      alert(`Carga masiva de pagos completada. Registros creados: ${created}.`);
    } else {
      alert('Carga masiva de pagos completada correctamente.');
    }
    el.uploadForm.reset();
    await loadDashboard();
    setActiveModule('payments');
  } catch (error) {
    alert(`Error en la carga masiva de pagos: ${error.message}`);
  }
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
  const container = document.getElementById('orders-container');
  if (container) {
    container.innerHTML = '';
    const orders = Array.isArray(data.orders) ? data.orders : [];
    if (orders.length) {
      orders.forEach((o) => addOrderRow(typeof o === 'object' ? o : { order: o, amount: 0 }));
    } else {
      addOrderRow();
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
    const orders = Array.isArray(data.orders) ? data.orders : [];
    const orderCount = orders.length;
    const orderLabels = orders.map((o) => (typeof o === 'object' ? o.order : o)).filter(Boolean);

    const tr = document.createElement('tr');
    tr.className = 'payment-main-row';
    const editBtn = isAdmin ? `<button class="btn outline small" data-edit-id="${p.id}">Editar</button>` : '';

    tr.innerHTML = `
      <td class="catalog-select-col"><input type="checkbox" class="catalog-select" value="${p.id}"></td>
      <td>${p.id}</td>
      <td>${data.provider_name || '-'}</td>
      <td>
        <button type="button" class="btn ghost small expand-orders-btn" aria-expanded="false">
          <span class="expand-icon">▶</span> ${orderCount} OC${orderCount !== 1 ? 's' : ''}
        </button>
        <span style="display:none">${orderLabels.join(' ')}</span>
      </td>
      <td>${data.date || '-'}</td>
      <td>${data.week || '-'}</td>
      <td>${formatCurrency(data.amount)}</td>
      <td>${data.status}</td>
      <td>
        <button class="btn ghost small" data-id="${p.id}" data-status="${data.status}">Cambiar</button>
        ${editBtn}
      </td>
    `;

    const detailsTr = document.createElement('tr');
    detailsTr.className = 'order-details-row';
    detailsTr.dataset.paginationSkip = 'true';
    detailsTr.style.display = 'none';

    const ordersBodyHtml = orders.length
      ? orders.map((o) => {
          const label = typeof o === 'object' ? (o.order || '-') : String(o);
          const amount = typeof o === 'object' ? (o.amount || 0) : 0;
          return `<tr><td>${label}</td><td class="order-detail-amount">${formatCurrency(amount)}</td></tr>`;
        }).join('')
      : '<tr><td colspan="2" class="order-detail-empty">Sin OC registradas</td></tr>';

    detailsTr.innerHTML = `
      <td colspan="9" class="order-details-cell">
        <div class="order-details-inner">
          <table class="order-details-table">
            <thead><tr><th>OC / Embarque</th><th>Valor</th></tr></thead>
            <tbody>${ordersBodyHtml}</tbody>
          </table>
        </div>
      </td>
    `;

    el.paymentsTable.appendChild(tr);
    el.paymentsTable.appendChild(detailsTr);

    tr.querySelector('.expand-orders-btn').addEventListener('click', () => {
      const btn = tr.querySelector('.expand-orders-btn');
      const expanded = btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', String(!expanded));
      btn.querySelector('.expand-icon').textContent = expanded ? '▶' : '▼';
      detailsTr.style.display = expanded ? 'none' : '';
    });
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
