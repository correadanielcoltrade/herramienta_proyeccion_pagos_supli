function addOrderRow(value) {
  const container = document.getElementById('orders-container');
  if (!container) return;
  const row = document.createElement('div');
  row.className = 'order-row';
  row.innerHTML = `
    <input type="text" class="order-input" placeholder="Ej: OC-001 o EMB-2026-01" value="${value || ''}">
    <button type="button" class="btn ghost small remove-order">Quitar</button>
  `;
  row.querySelector('.remove-order').addEventListener('click', () => {
    const rows = container.querySelectorAll('.order-row');
    if (rows.length > 1) {
      row.remove();
    } else {
      row.querySelector('.order-input').value = '';
    }
  });
  container.appendChild(row);
}

function clearOrdersForm() {
  const container = document.getElementById('orders-container');
  if (!container) return;
  container.innerHTML = '';
  addOrderRow();
}

function getOrdersFromForm() {
  const inputs = document.querySelectorAll('#orders-container .order-input');
  return [...inputs].map((i) => i.value.trim()).filter(Boolean);
}

async function handleCreatePayment(evt) {
  evt.preventDefault();
  const formData = new FormData(el.paymentForm);
  const payload = Object.fromEntries(formData.entries());
  const paymentId = payload.id;
  delete payload.id;

  payload.orders = getOrdersFromForm();

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
    await apiFetch('/payments/upload', { method: 'POST', body: formData });
    el.uploadForm.reset();
    await loadDashboard();
    setActiveModule('payments');
  } catch (error) {
    alert(error.message);
  }
}

function openEditPaymentModal(payment) {
  const data = payment.data_json;
  if (el.paymentForm) {
    el.paymentForm.reset();
    el.paymentForm.querySelector('[name="id"]').value = payment.id;
    el.paymentForm.querySelector('[name="date"]').value = data.date || '';
    el.paymentForm.querySelector('[name="status"]').value = data.status || 'Pendiente';
    el.paymentForm.querySelector('[name="amount"]').value = data.amount || '';
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
      orders.forEach((o) => addOrderRow(o));
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
    const tr = document.createElement('tr');
    const editBtn = isAdmin ? `<button class="btn outline small" data-edit-id="${p.id}">Editar</button>` : '';
    tr.innerHTML = `
      <td class="catalog-select-col"><input type="checkbox" class="catalog-select" value="${p.id}"></td>
      <td>${p.id}</td>
      <td>${data.provider_name || '-'}</td>
      <td>${formatCompactList(orders)}</td>
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
