async function handleLogin(evt) {
  evt.preventDefault();
  const formData = new FormData(el.loginForm);
  const payload = Object.fromEntries(formData.entries());
  try {
    const response = await apiFetch('/login', { method: 'POST', body: JSON.stringify(payload) });
    const data = await response.json();
    setSession(data.token, data.role);
    await loadAll();
  } catch (error) {
    alert(error.message);
  }
}

async function handleForgotPassword(evt) {
  evt.preventDefault();
  const formData = new FormData(el.forgotForm);
  const payload = Object.fromEntries(formData.entries());
  try {
    const response = await apiFetch('/forgot-password', { method: 'POST', body: JSON.stringify(payload) });
    const data = await response.json();
    if (el.forgotHint) {
      const codeText = data.reset_code ? `Código: ${data.reset_code}` : 'Revisa tu correo.';
      el.forgotHint.textContent = `${data.message} ${codeText}`;
    }
  } catch (error) {
    alert(error.message);
  }
}

async function handleResetPassword(evt) {
  evt.preventDefault();
  const formData = new FormData(el.resetForm);
  const payload = Object.fromEntries(formData.entries());
  try {
    const response = await apiFetch('/reset-password', { method: 'POST', body: JSON.stringify(payload) });
    const data = await response.json();
    if (el.resetHint) {
      el.resetHint.textContent = data.message || 'Password restablecida.';
    }
    el.resetForm.reset();
  } catch (error) {
    alert(error.message);
  }
}

async function handleChangePassword(evt) {
  evt.preventDefault();
  const formData = new FormData(el.changePasswordForm);
  const payload = Object.fromEntries(formData.entries());
  try {
    const response = await apiFetch('/change-password', { method: 'POST', body: JSON.stringify(payload) });
    const data = await response.json();
    if (el.changePasswordHint) {
      el.changePasswordHint.textContent = data.message || 'Password actualizada.';
    }
    el.changePasswordForm.reset();
  } catch (error) {
    alert(error.message);
  }
}
