// App entry: start-up (sign-in or setup), routing between tabs, top-bar
// actions, and re-rendering on data changes.

import * as store from './store.js';
import { setupDrawer, openLeadForm, closeDrawer } from './components/drawer.js';
import { toast } from './components/toast.js';
import { renderAuth, renderFatal } from './components/auth.js';
import { openPasswordPanel } from './components/account.js';
import { exportLeadsCsv } from './views/leads.js';
import leadsView from './views/leads.js';
import pipelineView from './views/pipeline.js';
import analyticsView from './views/analytics.js';
import settingsView from './views/settings.js';
import { $, $$, html } from './utils.js';

const routes = { leads: leadsView, pipeline: pipelineView, analytics: analyticsView, settings: settingsView };
const titles = { leads: 'Leads', pipeline: 'Pipeline', analytics: 'Analytics', settings: 'Settings' };
const REFRESH_MS = 60000;
let active = null;
let signedIn = false;

function currentRoute() {
  const name = location.hash.replace(/^#\/?/, '').split('?')[0];
  if (name === 'settings' && !store.isOwner()) return 'leads';
  return routes[name] ? name : 'leads';
}

function navigate() {
  if (!signedIn) return;
  const name = currentRoute();
  const view = $('#view');
  if (active?.name !== name) {
    active?.view.unmount?.();
    view.innerHTML = '';
    view.dataset.route = name;
    routes[name].mount(view);
    active = { name, view: routes[name] };
    document.title = `${titles[name]} · Groundwork CRM`;
    window.scrollTo(0, 0);
  }
  $$('[data-route-link]').forEach((link) => {
    if (link.dataset.routeLink === name) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  $$('.tab').forEach((tab) => {
    const isActive = tab.dataset.route === name;
    tab.classList.toggle('is-active', isActive);
    if (isActive) tab.setAttribute('aria-current', 'page');
    else tab.removeAttribute('aria-current');
  });
}

/* ---------- Start-up & sign-in ---------- */

async function boot() {
  const view = $('#view');
  view.innerHTML = html`<p class="loading">Loading your CRM…</p>`;
  let result;
  try {
    result = await store.init();
  } catch (e) {
    renderFatal(view, e.message, boot);
    return;
  }
  if (result.status === 'ready') enterApp();
  else showAuth(result.status);
}

function showAuth(kind) {
  signedIn = false;
  closeDrawer();
  active?.view.unmount?.();
  active = null;
  document.body.classList.add('is-signed-out');
  document.title = kind === 'setup' ? 'Set up · Groundwork CRM' : 'Sign in · Groundwork CRM';
  renderAuth($('#view'), kind, enterApp);
}

function enterApp() {
  signedIn = true;
  document.body.classList.remove('is-signed-out');
  renderMenu();
  active = null;
  navigate();
}

const ROLE_LABELS = { owner: 'Owner', editor: 'Editor', viewer: 'Viewer (view only)' };

/** Show or hide controls for this person's access level. The server enforces the same rules. */
function renderMenu() {
  const user = store.getUser();
  const apiMode = store.getMode() === 'api';
  $$('[data-api-only]').forEach((el) => { el.hidden = !apiMode; });
  $$('[data-owner-only]').forEach((el) => { el.hidden = !store.isOwner(); });
  document.body.classList.toggle('is-readonly', !store.canEdit());
  if (user) {
    $('[data-user-name]').textContent = user.name;
    $('[data-user-email]').textContent = user.email;
    $('[data-user-role]').textContent = ROLE_LABELS[user.role] || '';
  }
}

/* ---------- Top bar ---------- */

function setupTopbar() {
  const menu = $('.menu');
  document.addEventListener('click', (e) => {
    if (menu.open && !menu.contains(e.target)) menu.open = false;
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && menu.open) {
      menu.open = false;
      menu.querySelector('summary').focus();
    }
  });

  document.addEventListener('click', async (e) => {
    const button = e.target.closest('[data-action]');
    if (!button) return;
    menu.open = false;
    try {
      switch (button.dataset.action) {
        case 'new-lead':
          openLeadForm();
          break;
        case 'export':
          exportLeadsCsv(store.getLeads());
          break;
        case 'password':
          openPasswordPanel();
          break;
        case 'logout':
          await store.logout();
          showAuth('login');
          break;
      }
    } catch (err) {
      if (err.status === 401) showAuth('login');
      else toast(err.message);
    }
  });

  // "n" opens a new lead from anywhere, unless the person is typing.
  document.addEventListener('keydown', (e) => {
    if (!signedIn || !store.canEdit() || e.key !== 'n' || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target.closest('input, textarea, select, [contenteditable]') || document.querySelector('dialog[open]')) return;
    e.preventDefault();
    openLeadForm();
  });
}

/* ---------- Keeping in sync with the team ---------- */

function refreshIfIdle() {
  if (!signedIn || document.hidden || document.querySelector('dialog[open]')) return;
  store.refresh();
}

store.subscribe((change) => {
  if (change.type === 'auth') {
    toast('Your session ended. Sign in again to keep working.');
    showAuth('login');
    return;
  }
  if (change.type === 'error') {
    toast(change.message, { duration: 8000 });
    return;
  }
  if (change.type === 'users' || change.type === 'reset') {
    renderMenu();
    // If the owner changed this person's access, leave pages they can no longer use.
    if (active?.name === 'settings' && !store.isOwner()) navigate();
  }
  if (signedIn) active?.view.update?.(change);
});

setupDrawer();
setupTopbar();
window.addEventListener('hashchange', navigate);
document.addEventListener('visibilitychange', refreshIfIdle);
setInterval(refreshIfIdle, REFRESH_MS);
boot();
