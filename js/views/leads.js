// Leads tab: searchable, filterable, sortable list of every lead.

import { STAGES, SOURCES, OWNERS, stageById, stageIndex } from '../config.js';
import * as store from '../store.js';
import { openLeadDetail, openLeadForm } from '../components/drawer.js';
import { html, raw, $, formatCurrency, formatCompactCurrency, formatDate, formatRelative, debounce, downloadFile, toCsv } from '../utils.js';

const filters = { q: '', stage: '', source: '', owner: '', view: 'open' };
let sort = { key: 'createdAt', dir: 'desc' };
let root = null;

const COLUMNS = [
  { key: 'name', label: 'Lead', sortValue: (l) => l.name.toLowerCase() },
  { key: 'stage', label: 'Stage', sortValue: (l) => stageIndex(l.stage) },
  { key: 'value', label: 'Value', sortValue: (l) => l.value, numeric: true },
  { key: 'owner', label: 'Owner', sortValue: (l) => l.owner || '~' },
  { key: 'source', label: 'Source', sortValue: (l) => l.source || '~' },
  { key: 'lastContactAt', label: 'Last contact', sortValue: (l) => l.lastContactAt || '' },
  { key: 'nextFollowUp', label: 'Follow-up', sortValue: (l) => l.nextFollowUp || '9999' },
  { key: 'createdAt', label: 'Added', sortValue: (l) => l.createdAt },
];

const today = () => new Date().toISOString().slice(0, 10);
const isOverdue = (l) => stageById[l.stage].open && l.nextFollowUp && l.nextFollowUp < today();

const VIEWS = [
  { id: 'open', label: 'Open', test: (l) => stageById[l.stage].open },
  { id: 'overdue', label: 'Follow-up due', test: isOverdue },
  { id: 'won', label: 'Won', test: (l) => l.stage === 'won' },
  { id: 'lost', label: 'Lost', test: (l) => l.stage === 'lost' },
  { id: 'all', label: 'All', test: () => true },
];

function filtered() {
  const q = filters.q.trim().toLowerCase();
  const view = VIEWS.find((v) => v.id === filters.view);
  const col = COLUMNS.find((c) => c.key === sort.key);
  return store
    .getLeads()
    .filter((l) => view.test(l))
    .filter((l) => !filters.stage || l.stage === filters.stage)
    .filter((l) => !filters.source || l.source === filters.source)
    .filter((l) => !filters.owner || l.owner === filters.owner)
    .filter((l) => !q || [l.name, l.company, l.email, l.title, l.phone].some((f) => f?.toLowerCase().includes(q)))
    .sort((a, b) => {
      const av = col.sortValue(a);
      const bv = col.sortValue(b);
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sort.dir === 'asc' ? cmp : -cmp;
    });
}

function mount(container) {
  root = container;
  const select = (name, label, list, all) => html`
    <label class="filter">
      <span class="visually-hidden">${label}</span>
      <select data-filter="${name}">
        <option value="">${all}</option>
        ${list.map((o) => {
          const value = typeof o === 'string' ? o : o.id;
          return html`<option value="${value}" ${filters[name] === value ? raw('selected') : ''}>${typeof o === 'string' ? o : o.label}</option>`;
        })}
      </select>
    </label>`;

  container.innerHTML = html`
    <div class="page">
      <header class="page-head">
        <div>
          <h1>Leads</h1>
          <p class="page-summary" data-summary></p>
        </div>
      </header>

      <div class="views" role="group" aria-label="Lead views" data-views></div>

      <div class="toolbar">
        <label class="search">
          <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="4.5" /><path d="M10.5 10.5L14 14" /></svg>
          <span class="visually-hidden">Search leads</span>
          <input type="search" placeholder="Search name, company, email" value="${filters.q}" data-search />
        </label>
        ${select('stage', 'Stage', STAGES, 'Any stage')}
        ${select('owner', 'Owner', OWNERS, 'Any owner')}
        ${select('source', 'Source', SOURCES, 'Any source')}
        <button class="btn btn-quiet" type="button" data-clear hidden>Clear filters</button>
        <button class="btn toolbar-end" type="button" data-export>Export CSV</button>
      </div>

      <div class="table-wrap" data-results></div>
    </div>`;

  $('[data-search]', container).addEventListener('input', debounce((e) => { filters.q = e.target.value; renderResults(); }, 120));
  container.querySelectorAll('[data-filter]').forEach((el) =>
    el.addEventListener('change', () => { filters[el.dataset.filter] = el.value; renderResults(); }));
  $('[data-clear]', container).addEventListener('click', () => {
    Object.assign(filters, { q: '', stage: '', source: '', owner: '' });
    $('[data-search]', container).value = '';
    container.querySelectorAll('[data-filter]').forEach((el) => { el.value = ''; });
    renderResults();
  });
  $('[data-export]', container).addEventListener('click', () => exportLeadsCsv(filtered(), 'leads-filtered'));
  $('[data-views]', container).addEventListener('click', (e) => {
    const tab = e.target.closest('[data-view]');
    if (!tab) return;
    filters.view = tab.dataset.view;
    renderResults();
  });
  $('[data-results]', container).addEventListener('click', (e) => {
    const sortBtn = e.target.closest('[data-sort]');
    if (sortBtn) {
      const key = sortBtn.dataset.sort;
      // Same column flips direction; a new column starts biggest/newest first for numbers and dates.
      const startsDesc = COLUMNS.find((c) => c.key === key).numeric || key.endsWith('At');
      const dir = sort.key === key ? (sort.dir === 'desc' ? 'asc' : 'desc') : startsDesc ? 'desc' : 'asc';
      sort = { key, dir };
      renderResults();
      $(`[data-sort="${key}"]`, container)?.focus();
      return;
    }
    if (e.target.closest('[data-add]')) return openLeadForm();
    if (e.target.closest('[data-reset-filters]')) return $('[data-clear]', container).click();
    if (e.target.closest('a, button')) {
      const open = e.target.closest('[data-open]');
      if (open) openLeadDetail(open.dataset.open);
      return;
    }
    const row = e.target.closest('tr[data-id]');
    if (row) openLeadDetail(row.dataset.id);
  });

  renderResults();
}

function renderResults() {
  if (!root) return;
  const all = store.getLeads();
  const rows = filtered();
  const open = all.filter((l) => stageById[l.stage].open);
  const openValue = open.reduce((s, l) => s + l.value, 0);
  const hasFilters = Boolean(filters.q || filters.stage || filters.source || filters.owner);

  $('[data-summary]', root).textContent = all.length
    ? `${all.length} leads in total. ${open.length} are open, worth ${formatCompactCurrency(openValue)}.`
    : 'No leads yet.';

  $('[data-views]', root).innerHTML = html`${VIEWS.map((v) => {
    const count = all.filter(v.test).length;
    const selected = v.id === filters.view;
    return html`<button type="button" class="view-tab ${v.id === 'overdue' && count ? 'has-alert' : ''}" aria-pressed="${selected}" data-view="${v.id}">
      ${v.label} <span class="count">${count}</span></button>`;
  })}`;
  $('[data-clear]', root).hidden = !hasFilters;

  const results = $('[data-results]', root);
  if (!all.length) {
    results.innerHTML = html`<div class="empty">
      <h2>${store.canEdit() ? 'Add your first lead' : 'No leads yet'}</h2>
      <p>${store.canEdit() ? 'Leads you add show up here and on the pipeline board.' : 'Leads your team adds will show up here.'}</p>
      ${store.canEdit() ? html`<button class="btn btn-primary" type="button" data-add>Add a lead</button>` : ''}
    </div>`;
    return;
  }
  if (!rows.length) {
    results.innerHTML = html`<div class="empty">
      <h2>No leads match</h2>
      <p>Try a different search, or widen the filters.</p>
      ${hasFilters ? html`<button class="btn" type="button" data-reset-filters>Clear filters</button>` : ''}
    </div>`;
    return;
  }

  const total = rows.reduce((s, l) => s + l.value, 0);
  results.innerHTML = html`
    <table class="leads-table">
      <caption class="visually-hidden">Leads, sorted by ${COLUMNS.find((c) => c.key === sort.key).label}</caption>
      <thead>
        <tr>
          ${COLUMNS.map((c) => {
            const active = sort.key === c.key;
            return html`<th scope="col" class="${c.numeric ? 'num' : ''} col-${c.key}" aria-sort="${active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}">
              <button type="button" data-sort="${c.key}">${c.label}<span class="sort-mark" aria-hidden="true">${active ? (sort.dir === 'asc' ? '↑' : '↓') : ''}</span></button>
            </th>`;
          })}
        </tr>
      </thead>
      <tbody>
        ${rows.map((l) => html`
          <tr data-id="${l.id}">
            <td class="col-name">
              <button type="button" class="lead-link" data-open="${l.id}">${l.name}</button>
              <span class="lead-company">${l.company}</span>
            </td>
            <td><span class="stage-pill" data-stage="${l.stage}">${stageById[l.stage].label}</span></td>
            <td class="num">${formatCurrency(l.value)}</td>
            <td class="col-owner">${l.owner || 'Unassigned'}</td>
            <td class="col-source">${l.source || '—'}</td>
            <td class="col-lastContactAt">${formatRelative(l.lastContactAt)}</td>
            <td class="col-nextFollowUp ${isOverdue(l) ? 'is-overdue' : ''}">${stageById[l.stage].open && l.nextFollowUp ? html`${isOverdue(l) ? html`<span class="overdue-mark" aria-hidden="true"></span>` : ''}${formatDate(l.nextFollowUp + 'T12:00:00')}${isOverdue(l) ? html`<span class="visually-hidden"> (overdue)</span>` : ''}` : '—'}</td>
            <td class="col-createdAt">${formatDate(l.createdAt)}</td>
          </tr>`)}
      </tbody>
      <tfoot>
        <tr>
          <td>${rows.length} ${rows.length === 1 ? 'lead' : 'leads'}</td>
          <td></td>
          <td class="num">${formatCurrency(total)}</td>
          <td colspan="5"></td>
        </tr>
      </tfoot>
    </table>`;
}

export function exportLeadsCsv(leads, name = 'leads') {
  const csv = toCsv(leads, [
    { label: 'Name', value: (l) => l.name },
    { label: 'Title', value: (l) => l.title },
    { label: 'Company', value: (l) => l.company },
    { label: 'Email', value: (l) => l.email },
    { label: 'Phone', value: (l) => l.phone },
    { label: 'Stage', value: (l) => stageById[l.stage].label },
    { label: 'Value', value: (l) => l.value },
    { label: 'Owner', value: (l) => l.owner },
    { label: 'Source', value: (l) => l.source },
    { label: 'Next follow-up', value: (l) => l.nextFollowUp },
    { label: 'Created', value: (l) => l.createdAt.slice(0, 10) },
    { label: 'Notes', value: (l) => l.notes },
  ]);
  downloadFile(`${name}-${new Date().toISOString().slice(0, 10)}.csv`, csv);
}

export default {
  mount,
  update: renderResults,
  unmount() { root = null; },
};
