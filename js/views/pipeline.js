// Pipeline tab: a board of deals by stage. Drag cards between columns, or
// focus a card and use the left/right arrow keys.

import { STAGES, OPEN_STAGES, OWNERS, stageById, stageIndex } from '../config.js';
import * as store from '../store.js';
import { openLeadDetail } from '../components/drawer.js';
import { toast } from '../components/toast.js';
import { html, raw, $, $$, formatCurrency, formatCompactCurrency, initials, daysBetween, DAY, debounce } from '../utils.js';

const CLOSED_WINDOW_DAYS = 30;
const filters = { owner: '', q: '' };
let root = null;
let draggingId = null;
let focusAfterRender = null;

function visibleLeads() {
  const q = filters.q.trim().toLowerCase();
  const closedSince = Date.now() - CLOSED_WINDOW_DAYS * DAY;
  return store.getLeads().filter((l) => {
    if (filters.owner && l.owner !== filters.owner) return false;
    if (q && ![l.name, l.company].some((f) => f.toLowerCase().includes(q))) return false;
    if (!stageById[l.stage].open) return new Date(l.closedAt).getTime() >= closedSince;
    return true;
  });
}

function mount(container) {
  root = container;
  container.innerHTML = html`
    <div class="page page-wide">
      <header class="page-head">
        <div>
          <h1>Pipeline</h1>
          <p class="page-summary" data-summary></p>
        </div>
        <div class="toolbar toolbar-compact">
          <label class="search">
            <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="4.5" /><path d="M10.5 10.5L14 14" /></svg>
            <span class="visually-hidden">Search deals</span>
            <input type="search" placeholder="Search deals" value="${filters.q}" data-search />
          </label>
          <label class="filter">
            <span class="visually-hidden">Owner</span>
            <select data-owner>
              <option value="">Everyone’s deals</option>
              ${OWNERS.map((o) => html`<option ${filters.owner === o ? raw('selected') : ''}>${o}</option>`)}
            </select>
          </label>
        </div>
      </header>

      <section class="flow" aria-labelledby="flow-title">
        <h2 id="flow-title" class="flow-title">Where the open value sits</h2>
        <div class="flow-bar" data-flow></div>
      </section>

      <p class="board-hint" id="board-hint">${store.canEdit()
        ? 'Drag a card to another column to change its stage. With the keyboard, focus a card and press the left or right arrow.'
        : 'You have view-only access, so cards can’t be moved. Open a card to see its details.'}</p>
      <div class="board" data-board></div>
    </div>`;

  $('[data-search]', container).addEventListener('input', debounce((e) => { filters.q = e.target.value; render(); }, 120));
  $('[data-owner]', container).addEventListener('change', (e) => { filters.owner = e.target.value; render(); });

  const board = $('[data-board]', container);
  board.addEventListener('click', (e) => {
    const card = e.target.closest('[data-card]');
    if (card) openLeadDetail(card.dataset.card);
  });
  board.addEventListener('keydown', onCardKey);
  board.addEventListener('dragstart', (e) => {
    const card = e.target.closest('[data-card]');
    if (!card || !store.canEdit()) return;
    draggingId = card.dataset.card;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', draggingId);
    requestAnimationFrame(() => card.classList.add('is-dragging'));
  });
  board.addEventListener('dragend', () => {
    draggingId = null;
    $$('.is-dragging, .is-drop-target', board).forEach((el) => el.classList.remove('is-dragging', 'is-drop-target'));
  });
  board.addEventListener('dragover', (e) => {
    const column = e.target.closest('[data-column]');
    if (!column || !draggingId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    $$('.is-drop-target', board).forEach((el) => el !== column && el.classList.remove('is-drop-target'));
    column.classList.add('is-drop-target');
  });
  board.addEventListener('dragleave', (e) => {
    const column = e.target.closest('[data-column]');
    if (column && !column.contains(e.relatedTarget)) column.classList.remove('is-drop-target');
  });
  board.addEventListener('drop', (e) => {
    const column = e.target.closest('[data-column]');
    if (!column || !draggingId) return;
    e.preventDefault();
    move(draggingId, column.dataset.column);
  });

  render();
}

function move(id, stage) {
  const lead = store.getLead(id);
  if (!lead || lead.stage === stage) return;
  const from = lead.stage;
  store.moveLead(id, stage);
  toast(`Moved ${lead.company} to ${stageById[stage].label}`, {
    action: { label: 'Undo', onClick: () => store.moveLead(id, from) },
  });
}

function onCardKey(e) {
  const card = e.target.closest('[data-card]');
  if (!card) return;
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    openLeadDetail(card.dataset.card);
    return;
  }
  if ((e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') || !store.canEdit()) return;
  e.preventDefault();
  const lead = store.getLead(card.dataset.card);
  const next = STAGES[stageIndex(lead.stage) + (e.key === 'ArrowRight' ? 1 : -1)];
  if (!next) return;
  focusAfterRender = lead.id;
  move(lead.id, next.id);
}

function render() {
  if (!root) return;
  // Keep keyboard focus on the same card across re-renders.
  focusAfterRender ??= document.activeElement?.closest?.('[data-card]')?.dataset.card || null;
  const leads = visibleLeads();
  const open = leads.filter((l) => stageById[l.stage].open);
  const openValue = open.reduce((s, l) => s + l.value, 0);
  const weighted = open.reduce((s, l) => s + l.value * stageById[l.stage].probability, 0);

  $('[data-summary]', root).textContent = open.length
    ? `${formatCurrency(openValue)} open across ${open.length} ${open.length === 1 ? 'deal' : 'deals'}. Weighted by each stage’s odds of closing, that’s about ${formatCompactCurrency(weighted)}.`
    : 'No open deals match these filters.';

  renderFlow(open, openValue);

  const byStage = Object.fromEntries(STAGES.map((s) => [s.id, []]));
  leads.forEach((l) => byStage[l.stage].push(l));
  STAGES.forEach((s) => byStage[s.id].sort((a, b) => (s.open ? b.value - a.value : b.closedAt.localeCompare(a.closedAt))));

  $('[data-board]', root).innerHTML = html`${STAGES.map((s) => {
    const items = byStage[s.id];
    const total = items.reduce((sum, l) => sum + l.value, 0);
    return html`
      <section class="column ${s.open ? '' : 'column-closed'}" data-column="${s.id}" aria-labelledby="col-${s.id}">
        <header class="column-head">
          <h3 id="col-${s.id}"><span class="stage-dot" data-stage="${s.id}"></span>${s.label}</h3>
          <p class="column-meta"><span>${items.length}</span><span>${formatCompactCurrency(total)}</span></p>
          ${s.open ? '' : html`<p class="column-note">Closed in the last ${CLOSED_WINDOW_DAYS} days</p>`}
        </header>
        <ul class="cards" role="list">
          ${items.length ? items.map(card) : html`<li class="column-empty">${!s.open ? 'Nothing closed recently' : store.canEdit() ? 'Drop a deal here' : 'No deals'}</li>`}
        </ul>
      </section>`;
  })}`;

  if (focusAfterRender) {
    $(`[data-card="${focusAfterRender}"]`, root)?.focus();
    focusAfterRender = null;
  }
}

function card(l) {
  const open = stageById[l.stage].open;
  const days = daysBetween(l.stageChangedAt, open ? new Date() : l.closedAt);
  const overdue = open && l.nextFollowUp && l.nextFollowUp < new Date().toISOString().slice(0, 10);
  const stale = open && days >= 21;
  return html`
    <li>
      <article class="deal" tabindex="0" draggable="${store.canEdit()}" data-card="${l.id}" aria-describedby="board-hint"
        aria-label="${l.company}, ${l.name}, ${formatCurrency(l.value)}, ${stageById[l.stage].label}">
        <div class="deal-top">
          <h4>${l.company}</h4>
          <span class="deal-value">${formatCompactCurrency(l.value)}</span>
        </div>
        <p class="deal-contact">${l.name}</p>
        <div class="deal-foot">
          <span class="avatar" title="${l.owner || 'Unassigned'}">${initials(l.owner) || '?'}</span>
          <span class="deal-age ${stale ? 'is-stale' : ''}">${open ? `${days}d in stage` : closedLabel(l)}</span>
          ${overdue ? html`<span class="deal-flag">Follow-up due</span>` : ''}
        </div>
      </article>
    </li>`;
}

function closedLabel(l) {
  const ago = daysBetween(l.closedAt, new Date());
  return ago === 0 ? 'Closed today' : `Closed ${ago}d ago`;
}

function renderFlow(open, openValue) {
  const flow = $('[data-flow]', root);
  if (!openValue) {
    flow.innerHTML = html`<p class="flow-empty">Open deals with a value will show here.</p>`;
    return;
  }
  const parts = OPEN_STAGES.map((s) => {
    const items = open.filter((l) => l.stage === s.id);
    const value = items.reduce((sum, l) => sum + l.value, 0);
    return { stage: s, value, count: items.length, share: value / openValue };
  });
  flow.innerHTML = html`
    <div class="flow-track" role="img" aria-label="${parts.map((p) => `${p.stage.label} ${formatCompactCurrency(p.value)}`).join(', ')}">
      ${parts.filter((p) => p.value > 0).map((p) => html`
        <div class="flow-seg" data-stage="${p.stage.id}" style="flex-grow:${p.share}" title="${p.stage.label}: ${formatCurrency(p.value)} across ${p.count} deals"></div>`)}
    </div>
    <ol class="flow-legend">
      ${parts.map((p) => html`
        <li>
          <span class="stage-dot" data-stage="${p.stage.id}"></span>
          <span class="flow-stage">${p.stage.label}</span>
          <span class="flow-value">${formatCompactCurrency(p.value)}</span>
          <span class="flow-share">${Math.round(p.share * 100)}%</span>
        </li>`)}
    </ol>`;
}

export default {
  mount,
  update: render,
  unmount() { root = null; },
};
