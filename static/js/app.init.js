function formatUploadSummary(result) {
  if (!result || typeof result !== 'object') {
    return '';
  }
  const created = Number(result.created);
  const updated = Number(result.updated);
  const parts = [];
  if (Number.isFinite(created)) parts.push(`creados: ${created}`);
  if (Number.isFinite(updated)) parts.push(`actualizados: ${updated}`);
  return parts.length ? ` (${parts.join(', ')})` : '';
}

el.loginForm.addEventListener('submit', handleLogin);
if (el.forgotForm) {
  el.forgotForm.addEventListener('submit', handleForgotPassword);
}
if (el.resetForm) {
  el.resetForm.addEventListener('submit', handleResetPassword);
}
if (el.changePasswordForm) {
  el.changePasswordForm.addEventListener('submit', handleChangePassword);
}
if (el.userForm) {
  el.userForm.addEventListener('submit', handleUserCreate);
}
if (el.userEditForm) {
  el.userEditForm.addEventListener('submit', handleUserEditSubmit);
}
if (el.paymentForm) {
  el.paymentForm.addEventListener('submit', handleCreatePayment);
}
if (el.uploadForm) {
  el.uploadForm.addEventListener('submit', handleUpload);
}
if (el.paymentTemplateBtn) {
  el.paymentTemplateBtn.addEventListener('click', () => downloadFile('/templates/payments', 'template_pagos.xlsx'));
}
if (el.ganttExportBtn) {
  el.ganttExportBtn.addEventListener('click', () => {
    const week = el.ganttExportWeek ? el.ganttExportWeek.value : '';
    const query = week ? `?week=${encodeURIComponent(week)}` : '';
    const filename = week ? `reporte_programacion_semana_${week}.xlsx` : 'reporte_programacion_todas.xlsx';
    downloadFile(`/dashboard/gantt/export${query}`, filename);
  });
}

if (el.paymentOpen && el.paymentModal) {
  el.paymentOpen.addEventListener('click', () => {
    if (el.paymentForm) {
      el.paymentForm.reset();
    }
    if (el.paymentModalTitle) {
      el.paymentModalTitle.textContent = 'Nuevo pago';
    }
    if (typeof populateProviderSelect === 'function') {
      populateProviderSelect(el.providerSelect);
    }
    clearOrdersForm();
    openModal(el.paymentModal);
  });
}

if (el.addOrderBtn) {
  el.addOrderBtn.addEventListener('click', () => addOrderRow());
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
      const result = await handleCatalogUpload(el.brandUploadForm, '/brands/upload');
      alert(`Carga masiva de marcas completada${formatUploadSummary(result)}.`);
      await loadBrands();
    } catch (error) {
      alert(`Error en la carga masiva de marcas: ${error.message}`);
    }
  });
  el.brandTemplateBtn.addEventListener('click', () => downloadFile('/templates/brands', 'template_marcas.xlsx'));
  if (el.brandBulkDelete) {
    el.brandBulkDelete.addEventListener('click', () =>
      handleBulkDelete('/brands/bulk-delete', el.brandTable, el.brandSelectAll, el.brandBulkDelete, loadBrands)
    );
  }
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
      const result = await handleCatalogUpload(el.vendorUploadForm, '/providers/upload');
      alert(`Carga masiva de proveedores completada${formatUploadSummary(result)}.`);
      await loadProviders();
      if (typeof loadGantt === 'function') {
        await loadGantt();
      }
    } catch (error) {
      alert(`Error en la carga masiva de proveedores: ${error.message}`);
    }
  });
  el.vendorTemplateBtn.addEventListener('click', () => downloadFile('/templates/providers', 'template_proveedores.xlsx'));
  if (el.vendorBulkDelete) {
    el.vendorBulkDelete.addEventListener('click', () =>
      handleBulkDelete('/providers/bulk-delete', el.vendorTable, el.vendorSelectAll, el.vendorBulkDelete, async () => {
        await loadProviders();
        if (typeof loadGantt === 'function') {
          await loadGantt();
        }
      })
    );
  }
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
      const result = await handleCatalogUpload(el.productUploadForm, '/products/upload');
      alert(`Carga masiva de productos completada${formatUploadSummary(result)}.`);
      await loadProducts();
      if (typeof loadGantt === 'function') {
        await loadGantt();
      }
    } catch (error) {
      alert(`Error en la carga masiva de productos: ${error.message}`);
    }
  });
  el.productTemplateBtn.addEventListener('click', () => downloadFile('/templates/products', 'template_productos.xlsx'));
if (el.productBulkDelete) {
  el.productBulkDelete.addEventListener('click', () =>
    handleBulkDelete('/products/bulk-delete', el.productTable, el.productSelectAll, el.productBulkDelete, async () => {
      await loadProducts();
      if (typeof loadGantt === 'function') {
        await loadGantt();
      }
    })
  );
}
if (el.paymentsBulkDelete) {
  el.paymentsBulkDelete.addEventListener('click', () =>
    handleBulkDelete('/payments/bulk-delete', el.paymentsTable, el.paymentsSelectAll, el.paymentsBulkDelete, loadPayments)
  );
}
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

el.navDashboard.addEventListener('click', () => { setActiveModule('dashboard'); loadDashboard(); });
el.navPayments.addEventListener('click', () => setActiveModule('payments'));
el.navBrands.addEventListener('click', () => setActiveModule('brands'));
el.navVendors.addEventListener('click', () => setActiveModule('vendors'));
el.navProducts.addEventListener('click', () => setActiveModule('products'));
if (el.navUsers) {
  el.navUsers.addEventListener('click', () => setActiveModule('users'));
}

if (el.usersRefresh) {
  el.usersRefresh.addEventListener('click', loadUsers);
}

bindCatalogFilters(el.brandSearch, el.brandFilterCategory, 'brands-table');
bindCatalogFilters(el.vendorSearch, el.vendorFilterCategory, 'vendors-table');
bindCatalogFilters(el.productSearch, el.productFilterCategory, 'products-table');
bindTableSearch(el.userSearch, 'users-table');
bindTableSearch(el.paymentSearch, 'payments-table');

if (el.brandExport) {
  el.brandExport.addEventListener('click', () => {
    const cat = el.brandFilterCategory ? el.brandFilterCategory.value : '';
    const q = el.brandSearch ? el.brandSearch.value.trim().toLowerCase() : '';
    const rows = state.brands
      .filter((b) => {
        const c = (b.data_json.category || 'Normal');
        const matchCat = !cat || c === cat;
        const matchQ = !q || b.data_json.name.toLowerCase().includes(q);
        return matchCat && matchQ;
      })
      .map((b) => [b.data_json.name, b.data_json.category || 'Normal']);
    exportCatalogXLSX(['Marca', 'Categoría'], rows, 'marcas.xlsx');
  });
}

if (el.vendorExport) {
  el.vendorExport.addEventListener('click', () => {
    const cat = el.vendorFilterCategory ? el.vendorFilterCategory.value : '';
    const q = el.vendorSearch ? el.vendorSearch.value.trim().toLowerCase() : '';
    const rows = state.providers
      .filter((p) => {
        const c = (p.data_json.category || 'Normal');
        const matchCat = !cat || c === cat;
        const matchQ = !q || p.data_json.name.toLowerCase().includes(q);
        return matchCat && matchQ;
      })
      .map((p) => [p.data_json.name, p.data_json.category || 'Normal', p.data_json.status || 'Nacional', p.data_json.type || 'Comercial']);
    exportCatalogXLSX(['Proveedor', 'Categoría', 'Estado', 'Tipo'], rows, 'proveedores.xlsx');
  });
}

if (el.productExport) {
  el.productExport.addEventListener('click', () => {
    const cat = el.productFilterCategory ? el.productFilterCategory.value : '';
    const q = el.productSearch ? el.productSearch.value.trim().toLowerCase() : '';
    const rows = state.products
      .filter((p) => {
        const c = (p.data_json.category || 'Normal');
        const matchCat = !cat || c === cat;
        const text = `${p.data_json.sku || ''} ${p.data_json.description || ''} ${p.data_json.brand_name || ''}`.toLowerCase();
        const matchQ = !q || text.includes(q);
        return matchCat && matchQ;
      })
      .map((p) => [p.data_json.sku || '', p.data_json.description || p.data_json.label || '', p.data_json.brand_name || '', p.data_json.category || 'Normal']);
    exportCatalogXLSX(['SKU', 'Descripción', 'Marca', 'Categoría'], rows, 'productos.xlsx');
  });
}

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
bindModalDismiss(el.paymentModal);
bindModalDismiss(el.userEditModal);

updateUI();
clearOrdersForm();
if (state.token) {
  loadAll().catch(() => {
    setSession('', '');
  });
}
