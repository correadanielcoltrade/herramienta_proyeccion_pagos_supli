async function handleCreatePayment(evt) {
  evt.preventDefault();
  const formData = new FormData(el.paymentForm);
  const payload = Object.fromEntries(formData.entries());
  const paymentId = payload.id;
  delete payload.id;
  try {
    payload.items = getItemsFromForm();
  } catch (error) {
    alert(error.message);
    return;
  }
  if (!payload.items || !payload.items.length) {
    alert('Agrega al menos un producto con cantidad.');
    return;
  }
  try {
    if (paymentId) {
      await apiFetch(`/payments/${paymentId}`, { method: 'PUT', body: JSON.stringify(payload) });
    } else {
      await apiFetch('/payments', { method: 'POST', body: JSON.stringify(payload) });
    }
    el.paymentForm.reset();
    if (el.itemsContainer) {
      el.itemsContainer.innerHTML = '';
      addItemRow();
    }
    if (typeof resetPaymentPivot === 'function') {
      resetPaymentPivot();
    }
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
