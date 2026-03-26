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
    if (el.itemsContainer) {
      el.itemsContainer.innerHTML = '';
      addItemRow();
    }
    openModal(el.paymentModal);
  });
}

if (el.addItemBtn) {
  el.addItemBtn.addEventListener('click', () => addItemRow());
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
      await handleCatalogUpload(el.brandUploadForm, '/brands/upload');
      await loadBrands();
    } catch (error) {
      alert(error.message);
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
      await handleCatalogUpload(el.vendorUploadForm, '/providers/upload');
      await loadProviders();
      if (typeof loadGantt === 'function') {
        await loadGantt();
      }
    } catch (error) {
      alert(error.message);
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
      await handleCatalogUpload(el.productUploadForm, '/products/upload');
      await loadProducts();
      if (typeof loadGantt === 'function') {
        await loadGantt();
      }
    } catch (error) {
      alert(error.message);
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

el.navDashboard.addEventListener('click', () => setActiveModule('dashboard'));
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

bindTableSearch(el.brandSearch, 'brands-table');
bindTableSearch(el.vendorSearch, 'vendors-table');
bindTableSearch(el.productSearch, 'products-table');
bindTableSearch(el.userSearch, 'users-table');
bindTableSearch(el.paymentSearch, 'payments-table');

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
addItemRow();
if (state.token) {
  loadAll().catch(() => {
    setSession('', '');
  });
}
