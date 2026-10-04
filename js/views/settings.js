// Settings (owner only): who can use the CRM, what they can do, and bulk data actions.

import * as store from '../store.js';
import { confirmAction } from '../components/confirm.js';
import { toast } from '../components/toast.js';
import { openResetPasswordPanel, generatePassword, showFormError } from '../components/account.js';
import { exportLeadsCsv } from './leads.js';
import { html, raw, $, formatRelative, initials } from '../utils.js';

const ROLE_LABELS = { owner: 'Owner', editor: 'Editor', viewer: 'Viewer' };
let root = null;
let addOpen = false;

function mount(container) {
  root = container;
  addOpen = false;
  container.innerHTML = html`
    <div class="page page-narrow">
      <header class="page-head">
        <div>
          <h1>Settings</h1>
          <p class="page-summary">Decide who can use the CRM and what they can do. Only you, the owner, can see this page.</p>
        </div>
      </header>
      <div data-users></div>
      <section class="panel" aria-labelledby="data-title">
        <header class="panel-head">
          <div>
            <h2 id="data-title">Data</h2>
            <p>These affect every lead, for everyone on the team.</p>
          </div>
        </header>
        <ul class="setting-rows" role="list">
          <li>
            <div><strong>Export leads</strong><span>Download every lead as a CSV file for Excel or Google Sheets.</span></div>
            <button class="btn" type="button" data-export>Export CSV</button>
          </li>
          <li>
            <div><strong>Reload demo data</strong><span>Replace every lead with the sample set. Useful for training.</span></div>
            <button class="btn" type="button" data-demo>Reload demo data</button>
          </li>
          <li>
            <div><strong>Delete all leads</strong><span>Start with an empty CRM. This can’t be undone.</span></div>
            <button class="btn btn-ghost-danger" type="button" data-clear>Delete all leads</button>
          </li>
        </ul>
      </section>
    </div>`;

  $('[data-export]', container).addEventListener('click', () => exportLeadsCsv(store.getLeads()));
  $('[data-demo]', container).addEventListener('click', () => runDataAction({
    title: 'Reload demo data?',
    body: 'This replaces every lead, for everyone on the team, with the sample data set. Changes you made will be lost.',
    confirmLabel: 'Reload demo data',
    action: store.resetDemoData,
    done: 'Demo data reloaded',
  }));
  $('[data-clear]', container).addEventListener('click', () => runDataAction({
    title: 'Delete all leads?',
    body: 'Every lead and its history will be deleted for everyone on the team. This can’t be undone.',
    confirmLabel: 'Delete all leads',
    action: store.clearAllData,
    done: 'All leads deleted',
  }));

  const users = $('[data-users]', container);
  users.addEventListener('change', onAccessChange);
  users.addEventListener('click', onUsersClick);
  users.addEventListener('submit', onAddPerson);
  renderUsers();
}

async function runDataAction({ title, body, confirmLabel, action, done }) {
  if (!(await confirmAction({ title, body, confirmLabel }))) return;
  try {
    await action();
    toast(done);
  } catch (err) {
    toast(err.message);
  }
}

function renderUsers() {
  if (!root) return;
  const box = $('[data-users]', root);
  if (store.getMode() !== 'api') {
    box.innerHTML = html`<section class="panel"><header class="panel-head"><div><h2>Users and access</h2>
      <p>People and access levels are managed on the live site, where everyone signs in. This preview keeps data in your browser only.</p></div></header></section>`;
    return;
  }
  const me = store.getUser();
  const users = [...store.getUsers()].sort((a, b) => (a.role === 'owner' ? -1 : b.role === 'owner' ? 1 : a.name.localeCompare(b.name)));

  box.innerHTML = html`
    <section class="panel" aria-labelledby="users-title">
      <header class="panel-head">
        <div>
          <h2 id="users-title">Users and access</h2>
          <p>${users.length} ${users.length === 1 ? 'person' : 'people'} can sign in. Turning someone’s access off signs them out straight away.</p>
        </div>
        <button class="btn btn-primary btn-small" type="button" data-toggle-add aria-expanded="${addOpen}">${addOpen ? 'Close' : 'Add person'}</button>
      </header>

      ${addOpen ? html`
        <form class="add-person" novalidate>
          <p class="form-error" role="alert" hidden></p>
          <div class="field-grid">
            <label class="field"><span>Name</span><input name="name" autocomplete="off" required /></label>
            <label class="field"><span>Email</span><input name="email" type="email" autocomplete="off" required /></label>
            <div class="field">
              <label for="new-password"><span>Temporary password</span></label>
              <div class="input-row">
                <input id="new-password" name="password" type="text" autocomplete="off" spellcheck="false" value="${generatePassword()}" required />
                <button class="btn" type="button" data-regenerate>New</button>
              </div>
            </div>
            <label class="field"><span>Access</span>
              <select name="role"><option value="editor">Editor: can add and change leads</option><option value="viewer">Viewer: can only look</option></select>
            </label>
          </div>
          <p class="field-hint">Share the email and temporary password with them. They can change the password after signing in.</p>
          <div class="add-person-actions"><button class="btn btn-primary" type="submit">Add person</button></div>
        </form>` : ''}

      <div class="table-wrap">
        <table class="data-table people-table">
          <thead>
            <tr><th scope="col">Person</th><th scope="col">Access</th><th scope="col">Last signed in</th><th scope="col"><span class="visually-hidden">Actions</span></th></tr>
          </thead>
          <tbody>
            ${users.map((u) => html`
              <tr class="${u.active ? '' : 'is-off'}">
                <th scope="row">
                  <span class="person">
                    <span class="avatar avatar-lg" aria-hidden="true">${initials(u.name)}</span>
                    <span class="person-who"><strong>${u.name}${u.id === me.id ? ' (you)' : ''}</strong><span>${u.email}</span></span>
                  </span>
                </th>
                <td>
                  ${u.role === 'owner'
                    ? html`<span class="access-fixed">Owner</span>`
                    : html`<label class="visually-hidden" for="access-${u.id}">Access for ${u.name}</label>
                      <select class="access-select" id="access-${u.id}" data-access="${u.id}" ${u.active ? '' : raw('disabled')}>
                        <option value="editor" ${u.role === 'editor' ? raw('selected') : ''}>Editor</option>
                        <option value="viewer" ${u.role === 'viewer' ? raw('selected') : ''}>Viewer</option>
                      </select>`}
                  ${u.active ? '' : html`<span class="access-off">Access off</span>`}
                </td>
                <td class="muted">${u.lastLoginAt ? formatRelative(u.lastLoginAt) : 'Never'}</td>
                <td class="person-actions">
                  ${u.role === 'owner' ? '' : html`
                    <button class="btn btn-quiet btn-small" type="button" data-reset="${u.id}">Reset password</button>
                    <button class="btn btn-quiet btn-small" type="button" data-active="${u.id}" data-to="${u.active ? '0' : '1'}">${u.active ? 'Turn off access' : 'Turn on access'}</button>
                    <button class="btn btn-ghost-danger btn-small" type="button" data-remove="${u.id}">Remove</button>`}
                </td>
              </tr>`)}
          </tbody>
        </table>
      </div>

      <dl class="role-legend">
        <div><dt>Owner</dt><dd>Everything, including this page. Only you.</dd></div>
        <div><dt>Editor</dt><dd>Add, edit, move, and delete leads, and log activity.</dd></div>
        <div><dt>Viewer</dt><dd>See leads, the pipeline, and analytics. Can’t change anything.</dd></div>
      </dl>
    </section>`;
}

const userById = (id) => store.getUsers().find((u) => String(u.id) === String(id));

async function onAccessChange(e) {
  const select = e.target.closest('[data-access]');
  if (!select) return;
  const user = userById(select.dataset.access);
  try {
    await store.updateUser(user.id, { role: select.value });
    toast(`${user.name} is now ${select.value === 'viewer' ? 'a Viewer' : 'an Editor'}`);
  } catch (err) {
    toast(err.message);
    renderUsers();
  }
}

async function onUsersClick(e) {
  const t = e.target;
  if (t.closest('[data-toggle-add]')) {
    addOpen = !addOpen;
    renderUsers();
    if (addOpen) root.querySelector('.add-person input')?.focus();
    else $('[data-toggle-add]', root)?.focus();
    return;
  }
  if (t.closest('[data-regenerate]')) {
    const input = root.querySelector('.add-person [name="password"]');
    input.value = generatePassword();
    input.select();
    return;
  }
  const reset = t.closest('[data-reset]');
  if (reset) return openResetPasswordPanel(userById(reset.dataset.reset));

  const toggle = t.closest('[data-active]');
  if (toggle) {
    const user = userById(toggle.dataset.active);
    const active = toggle.dataset.to === '1';
    try {
      await store.updateUser(user.id, { active });
      toast(active ? `${user.name} can sign in again` : `${user.name}’s access is off`, {
        action: { label: 'Undo', onClick: () => store.updateUser(user.id, { active: !active }).catch((err) => toast(err.message)) },
      });
    } catch (err) {
      toast(err.message);
    }
    return;
  }

  const remove = t.closest('[data-remove]');
  if (remove) {
    const user = userById(remove.dataset.remove);
    const ok = await confirmAction({
      title: `Remove ${user.name}?`,
      body: 'Their account is deleted and they’re signed out. Leads they own and activity they logged stay. To keep their account but block sign-in, turn off their access instead.',
      confirmLabel: 'Remove',
    });
    if (!ok) return;
    try {
      await store.removeUser(user.id);
      toast(`Removed ${user.name}`);
    } catch (err) {
      toast(err.message);
    }
  }
}

async function onAddPerson(e) {
  const form = e.target.closest('.add-person');
  if (!form) return;
  e.preventDefault();
  form.querySelectorAll('[aria-invalid]').forEach((el) => el.removeAttribute('aria-invalid'));
  const data = Object.fromEntries(new FormData(form));
  const button = form.querySelector('[type="submit"]');
  button.disabled = true;
  try {
    await store.addUser(data);
    addOpen = false;
    renderUsers();
    toast(`Added ${data.name}. Share their email and temporary password with them.`, { duration: 8000 });
  } catch (err) {
    showFormError(form, err);
    button.disabled = false;
  }
}

export default {
  mount,
  update(change) {
    // The background refresh shouldn't wipe a half-filled "Add person" form.
    if (change?.type === 'reset' && addOpen) return;
    if (change?.type === 'users' || change?.type === 'reset') renderUsers();
  },
  unmount() { root = null; },
};
