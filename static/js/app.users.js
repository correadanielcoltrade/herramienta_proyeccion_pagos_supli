async function loadUsers() {
  if (state.role !== 'ADMIN') return;
  const response = await apiFetch('/users');
  const users = await response.json();
  state.users = users;
  renderUsers(users);
}

async function handleUserCreate(evt) {
  evt.preventDefault();
  if (!el.userForm) return;
  const formData = new FormData(el.userForm);
  const payload = Object.fromEntries(formData.entries());
  payload.role = (payload.role || 'USER').toUpperCase();
  try {
    await apiFetch('/users', { method: 'POST', body: JSON.stringify(payload) });
    el.userForm.reset();
    const roleSelect = el.userForm.querySelector('[name="role"]');
    if (roleSelect) roleSelect.value = 'USER';
    await loadUsers();
  } catch (error) {
    alert(error.message);
  }
}

function openUserEdit(user) {
  if (!el.userEditForm || !el.userEditModal) return;
  const data = user.data_json || {};
  el.userEditForm.reset();
  el.userEditForm.querySelector('[name="id"]').value = user.id;
  el.userEditForm.querySelector('[name="name"]').value = data.name || '';
  el.userEditForm.querySelector('[name="email"]').value = data.email || '';
  el.userEditForm.querySelector('[name="role"]').value = (data.role || 'USER').toUpperCase();
  if (el.userEditHint) {
    el.userEditHint.textContent = '';
  }
  openModal(el.userEditModal);
}

async function handleUserEditSubmit(evt) {
  evt.preventDefault();
  if (!el.userEditForm) return;
  const formData = new FormData(el.userEditForm);
  const payload = Object.fromEntries(formData.entries());
  const userId = payload.id;
  delete payload.id;
  payload.role = (payload.role || 'USER').toUpperCase();
  if (!payload.password) {
    delete payload.password;
  }
  try {
    await apiFetch(`/users/${userId}`, { method: 'PUT', body: JSON.stringify(payload) });
    closeModal(el.userEditModal);
    await loadUsers();
  } catch (error) {
    if (el.userEditHint) {
      el.userEditHint.textContent = error.message;
    } else {
      alert(error.message);
    }
  }
}

function renderUsers(users) {
  if (!el.usersTable) return;
  el.usersTable.innerHTML = '';
  users.forEach((user) => {
    const data = user.data_json || {};
    const createdAt = (user.created_at || '').replace('T', ' ').replace('Z', '');
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${user.id}</td>
      <td>${data.name || '-'}</td>
      <td>${data.email || '-'}</td>
      <td>${data.role || 'USER'}</td>
      <td>${createdAt || '-'}</td>
      <td>
        <button type="button" class="btn ghost small user-edit-btn" data-id="${user.id}">Editar</button>
      </td>
    `;
    el.usersTable.appendChild(tr);
    const editBtn = tr.querySelector('.user-edit-btn');
    if (editBtn) {
      editBtn.addEventListener('click', () => openUserEdit(user));
    }
  });
  if (el.userSearch) {
    applyTableSearch('users-table', el.userSearch.value);
  } else {
    applyPagination('users-table');
  }
}
