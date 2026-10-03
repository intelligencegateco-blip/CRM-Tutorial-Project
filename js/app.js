// App entry: routing between tabs, top-bar actions, and re-rendering on data changes.

import * as store from './store.js';
import { setupDrawer, openLeadForm } from './components/drawer.js';
import { confirmAction } from './components/confirm.js';
import { toast } from './components/toast.js';
import { exportLeadsCsv } from './views/leads.js';
import leadsView from './views/leads.js';
import pipelineView from './views/pipeline.js';
import analyticsView from './views/analytics.js';
import { $, $$ } from './utils.js';

const routes = { leads: leadsView, pipeline: pipelineView, analytics: analyticsView };
const titles = { leads: 'Leads', pipeline: 'Pipeline', analytics: 'Analytics' };
let active = null;

function currentRoute() {
  const name = location.hash.replace(/^#\/?/, '').split('?')[0];
  return routes[name] ? name : 'leads';
}

function navigate() {
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
    switch (button.dataset.action) {
      case 'new-lead':
        openLeadForm();
        break;
      case 'export':
        exportLeadsCsv(store.getLeads());
        break;
      case 'reset':
        if (await confirmAction({ title: 'Reload demo data?', body: 'This replaces every lead with the sample data set. Changes you made will be lost.', confirmLabel: 'Reload demo data' })) {
          store.resetDemoData();
          toast('Demo data reloaded');
        }
        break;
      case 'clear':
        if (await confirmAction({ title: 'Delete all leads?', body: 'Every lead and its history will be removed from this browser. This can’t be undone.', confirmLabel: 'Delete all leads' })) {
          store.clearAllData();
          toast('All leads deleted');
        }
        break;
    }
  });

  // "n" opens a new lead from anywhere, unless the person is typing.
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'n' || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target.closest('input, textarea, select, [contenteditable]') || document.querySelector('dialog[open]')) return;
    e.preventDefault();
    openLeadForm();
  });
}

setupDrawer();
setupTopbar();
store.subscribe((change) => active?.view.update?.(change));
window.addEventListener('hashchange', navigate);
navigate();
