// App entry: start-up (sign-in or setup), routing between tabs, top-bar
// actions, and re-rendering on data changes.

import * as store from './store.js';
import { setupDrawer, openLeadForm, closeDrawer } from './components/drawer.js';
import { confirmAction } from './components/confirm.js';
import { toast } from './components/toast.js';
import { renderAuth, renderFatal } from './components/auth.js';
import { openTeamPanel, openPasswordPanel } from './components/team.js';
import { exportLeadsCsv } from './views/leads.js';
import leadsView from './views/leads.js';
import pipelineView from './views/pipeline.js';
import analyticsView from './views/analytics.js';
import { $, $$, html } from './utils.js';

const routes = { leads: leadsView, pipeline: pipelineView, analytics: analyticsView };
const titles = { leads: 'Leads', pipeline: 'Pipeline', analytics: 'Analytics' };
const REFRESH_MS = 60000;
let active = null;
let signedIn = false;

function currentRoute() {
  const name = location.hash.replace(/^#\/?/, '').split('?')[0];
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

function renderMenu() {
  const user = store.getUser();
  const apiMode = store.getMode() === 'api';
  $$('[data-api-only]').forEach((el) => { el.hidden = !apiMode; });
  $$('[data-admin-only]').forEach((el) => { el.hidden = !store.isAdmin(); });
  if (user) {
    $('[data-user-name]').textContent = user.name;
    $('[data-user-email]').textContent = user.email;
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
        case 'team':
          openTeamPanel();
          break;
        case 'password':
          openPasswordPanel();
          break;
        case 'logout':
          await store.logout();
          showAuth('login');
          break;
        case 'reset':
          if (await confirmAction({ title: 'Reload demo data?', body: 'This replaces every lead, for everyone on the team, with the sample data set. Changes you made will be lost.', confirmLabel: 'Reload demo data' })) {
            await store.resetDemoData();
            toast('Demo data reloaded');
          }
          break;
        case 'clear':
          if (await confirmAction({ title: 'Delete all leads?', body: 'Every lead and its history will be deleted for everyone on the team. This can’t be undone.', confirmLabel: 'Delete all leads' })) {
            await store.clearAllData();
            toast('All leads deleted');
          }
          break;
      }
    } catch (err) {
      if (err.status === 401) showAuth('login');
      else toast(err.message);
    }
  });

  // "n" opens a new lead from anywhere, unless the person is typing.
  document.addEventListener('keydown', (e) => {
    if (!signedIn || e.key !== 'n' || e.metaKey || e.ctrlKey || e.altKey) return;
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
  if (change.type === 'users') renderMenu();
  if (signedIn) active?.view.update?.(change);
});

setupDrawer();
setupTopbar();
window.addEventListener('hashchange', navigate);
document.addEventListener('visibilitychange', refreshIfIdle);
setInterval(refreshIfIdle, REFRESH_MS);
boot();
