// Password panels shown in the side drawer: change your own, or (owner) reset someone else's.

import * as store from '../store.js';
import { html, raw, $ } from '../utils.js';
import { openPanel, closeDrawer } from './drawer.js';
import { toast } from './toast.js';

const closeIcon = raw('<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" /></svg>');

/** A readable random password: no look-alike characters (0/O, 1/l/I). */
export function generatePassword(length = 14) {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const values = crypto.getRandomValues(new Uint32Array(length));
  return Array.from(values, (v) => chars[v % chars.length]).join('');
}

export function showFormError(form, err) {
  const box = $('.form-error', form);
  box.textContent = err.message;
  box.hidden = false;
  const field = err.field && form.querySelector(`[name="${err.field}"]`);
  if (field) {
    field.setAttribute('aria-invalid', 'true');
    field.focus();
  }
}

function clearFormError(form) {
  $('.form-error', form).hidden = true;
  form.querySelectorAll('[aria-invalid]').forEach((el) => el.removeAttribute('aria-invalid'));
}

function wireClose(form) {
  const d = document.getElementById('drawer');
  d.querySelector('[data-close]').addEventListener('click', closeDrawer);
  d.querySelector('[data-cancel]').addEventListener('click', closeDrawer);
  form.querySelector('input').focus();
}

export function openPasswordPanel() {
  openPanel(html`
    <form class="drawer-inner" novalidate>
      <header class="drawer-head">
        <h2 id="drawer-title">Change password</h2>
        <button class="btn btn-icon" type="button" data-close aria-label="Close">${closeIcon}</button>
      </header>
      <p class="form-error" role="alert" hidden></p>
      <label class="field"><span>Current password</span><input name="current" type="password" autocomplete="current-password" required /></label>
      <label class="field"><span>New password</span><input name="password" type="password" autocomplete="new-password" required /></label>
      <p class="field-hint">At least 10 characters. Other devices signed in to your account will be signed out.</p>
      <footer class="drawer-foot">
        <button class="btn" type="button" data-cancel>Cancel</button>
        <button class="btn btn-primary" type="submit">Change password</button>
      </footer>
    </form>`);

  const form = document.querySelector('#drawer form');
  wireClose(form);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearFormError(form);
    const data = Object.fromEntries(new FormData(form));
    try {
      await store.changePassword(data.current, data.password);
      closeDrawer();
      toast('Password changed');
    } catch (err) {
      showFormError(form, err);
    }
  });
}

/** Owner: set a new password for a teammate who's locked out. */
export function openResetPasswordPanel(user) {
  openPanel(html`
    <form class="drawer-inner" novalidate>
      <header class="drawer-head">
        <div>
          <h2 id="drawer-title">Reset password</h2>
          <p class="drawer-sub">Set a new password for ${user.name}. They’ll be signed out everywhere and can sign in with this one.</p>
        </div>
        <button class="btn btn-icon" type="button" data-close aria-label="Close">${closeIcon}</button>
      </header>
      <p class="form-error" role="alert" hidden></p>
      <div class="field">
        <label for="reset-password"><span>New password</span></label>
        <div class="input-row">
          <input id="reset-password" name="password" type="text" autocomplete="off" spellcheck="false" value="${generatePassword()}" required />
          <button class="btn" type="button" data-generate>New suggestion</button>
        </div>
      </div>
      <p class="field-hint">At least 10 characters. Copy it before saving so you can share it with ${user.name}.</p>
      <footer class="drawer-foot">
        <button class="btn" type="button" data-cancel>Cancel</button>
        <button class="btn btn-primary" type="submit">Reset password</button>
      </footer>
    </form>`);

  const form = document.querySelector('#drawer form');
  wireClose(form);
  form.querySelector('[data-generate]').addEventListener('click', () => {
    form.password.value = generatePassword();
    form.password.select();
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearFormError(form);
    try {
      await store.resetUserPassword(user.id, form.password.value);
      closeDrawer();
      toast(`Password reset for ${user.name}`);
    } catch (err) {
      showFormError(form, err);
    }
  });
}
