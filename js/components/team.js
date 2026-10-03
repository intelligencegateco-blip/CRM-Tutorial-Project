// Team members (admin) and change-password panels, shown in the side drawer.

import * as store from '../store.js';
import { html, raw, $ } from '../utils.js';
import { openPanel, closeDrawer } from './drawer.js';
import { confirmAction } from './confirm.js';
import { toast } from './toast.js';

const closeIcon = raw('<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" /></svg>');

function showErrors(form, err) {
  const box = $('.form-error', form);
  box.textContent = err.message;
  box.hidden = false;
  const field = err.field && form.querySelector(`[name="${err.field}"]`);
  if (field) {
    field.setAttribute('aria-invalid', 'true');
    field.focus();
  }
}

export function openTeamPanel() {
  const me = store.getUser();
  const admin = store.isAdmin();
  openPanel(html`
    <div class="drawer-inner">
      <header class="drawer-head">
        <div>
          <h2 id="drawer-title">Team</h2>
          <p class="drawer-sub">Everyone here can sign in and work on leads. Admins can also add people and reload or delete all data.</p>
        </div>
        <button class="btn btn-icon" type="button" data-close aria-label="Close">${closeIcon}</button>
      </header>

      <ul class="team-list" role="list">
        ${store.getUsers().map((u) => html`
          <li>
            <span class="avatar avatar-lg" aria-hidden="true">${u.name.split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase()}</span>
            <span class="team-who"><strong>${u.name}${u.id === me.id ? ' (you)' : ''}</strong><span>${u.email}</span></span>
            <span class="team-role">${u.role === 'admin' ? 'Admin' : 'Member'}</span>
            ${admin && u.id !== me.id ? html`<button class="btn btn-ghost-danger btn-small" type="button" data-remove="${u.id}" data-name="${u.name}">Remove</button>` : ''}
          </li>`)}
      </ul>

      ${admin ? html`
        <form class="team-form" novalidate>
          <h3>Add a team member</h3>
          <p class="drawer-sub">Share the email and temporary password with them. They can change the password after signing in.</p>
          <p class="form-error" role="alert" hidden></p>
          <div class="field-grid">
            <label class="field"><span>Name</span><input name="name" autocomplete="off" required /></label>
            <label class="field"><span>Email</span><input name="email" type="email" autocomplete="off" required /></label>
            <label class="field"><span>Temporary password</span><input name="password" type="text" autocomplete="off" spellcheck="false" required /></label>
            <label class="field"><span>Role</span><select name="role"><option value="member">Member</option><option value="admin">Admin</option></select></label>
          </div>
          <button class="btn btn-primary" type="submit">Add team member</button>
        </form>` : ''}
    </div>`);

  const d = document.getElementById('drawer');
  d.querySelector('[data-close]').addEventListener('click', closeDrawer);
  d.querySelectorAll('[data-remove]').forEach((btn) => btn.addEventListener('click', async () => {
    const ok = await confirmAction({
      title: `Remove ${btn.dataset.name}?`,
      body: 'They’ll be signed out and won’t be able to sign in again. Leads they own stay as they are.',
      confirmLabel: 'Remove',
    });
    if (!ok) return;
    try {
      await store.removeUser(btn.dataset.remove);
      toast(`Removed ${btn.dataset.name}`);
      openTeamPanel();
    } catch (err) {
      toast(err.message);
    }
  }));

  const form = d.querySelector('.team-form');
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    form.querySelectorAll('[aria-invalid]').forEach((el) => el.removeAttribute('aria-invalid'));
    const data = Object.fromEntries(new FormData(form));
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    try {
      await store.addUser(data);
      toast(`Added ${data.name}`);
      openTeamPanel();
    } catch (err) {
      showErrors(form, err);
      button.disabled = false;
    }
  });
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

  const d = document.getElementById('drawer');
  const form = d.querySelector('form');
  form.querySelector('input').focus();
  d.querySelector('[data-close]').addEventListener('click', closeDrawer);
  d.querySelector('[data-cancel]').addEventListener('click', closeDrawer);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    form.querySelectorAll('[aria-invalid]').forEach((el) => el.removeAttribute('aria-invalid'));
    const data = Object.fromEntries(new FormData(form));
    try {
      await store.changePassword(data.current, data.password);
      closeDrawer();
      toast('Password changed');
    } catch (err) {
      showErrors(form, err);
    }
  });
}
