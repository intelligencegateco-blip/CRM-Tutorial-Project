// Side drawer for viewing, creating, and editing a lead.

import { STAGES, SOURCES, OWNERS, ACTIVITY_TYPES, stageById } from '../config.js';
import * as store from '../store.js';
import { html, raw, formatCurrency, formatDate, formatRelative, daysBetween } from '../utils.js';
import { toast } from './toast.js';

const dialog = () => document.getElementById('drawer');
let currentLeadId = null;

const closeIcon = raw('<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" /></svg>');

function open(markup) {
  const d = dialog();
  d.innerHTML = markup;
  if (!d.open) d.showModal();
}

/** Show arbitrary content (team, password) in the drawer. */
export function openPanel(markup) {
  currentLeadId = null;
  dialog().dataset.mode = 'panel';
  open(markup);
}

export function closeDrawer() {
  currentLeadId = null;
  const d = dialog();
  if (d.open) d.close();
}

export function setupDrawer() {
  const d = dialog();
  // Clicking the backdrop closes the drawer.
  d.addEventListener('click', (e) => {
    if (e.target === d) closeDrawer();
  });
  d.addEventListener('close', () => { currentLeadId = null; });
  // Keep an open detail view in sync with changes made elsewhere.
  store.subscribe((change) => {
    if (!currentLeadId || !d.open || d.dataset.mode !== 'detail') return;
    if (!['delete', 'reset', 'sync', 'update', 'move', 'activity'].includes(change.type)) return;
    if (change.type !== 'reset' && change.id !== currentLeadId) return;
    if (!store.getLead(currentLeadId)) return closeDrawer();
    // The server's saved copy arriving shouldn't wipe a note being typed.
    const typing = d.querySelector('textarea')?.value.trim();
    if (change.type === 'sync' && typing) return;
    openLeadDetail(currentLeadId);
  });
}

/* ---------- Detail view ---------- */

const activityLabel = { created: 'Created', stage: 'Stage', note: 'Note', call: 'Call', email: 'Email', meeting: 'Meeting' };

export function openLeadDetail(id) {
  const lead = store.getLead(id);
  if (!lead) return;
  currentLeadId = id;
  dialog().dataset.mode = 'detail';
  const stage = stageById[lead.stage];
  const overdue = stage.open && lead.nextFollowUp && lead.nextFollowUp < new Date().toISOString().slice(0, 10);
  const editable = store.canEdit();

  open(html`
    <div class="drawer-inner">
      <header class="drawer-head">
        <div>
          <p class="drawer-kicker">${lead.company}</p>
          <h2 id="drawer-title">${lead.name}</h2>
          ${lead.title ? html`<p class="drawer-sub">${lead.title}</p>` : ''}
        </div>
        <button class="btn btn-icon" type="button" data-close aria-label="Close">${closeIcon}</button>
      </header>

      ${editable ? html`<div class="detail-actions">
        <label class="stage-picker">
          <span class="visually-hidden">Stage</span>
          <span class="stage-dot" data-stage="${lead.stage}"></span>
          <select data-field="stage">
            ${STAGES.map((s) => html`<option value="${s.id}" ${s.id === lead.stage ? raw('selected') : ''}>${s.label}</option>`)}
          </select>
        </label>
        <button class="btn" type="button" data-edit>Edit</button>
        <button class="btn btn-ghost-danger" type="button" data-delete>Delete</button>
      </div>` : html`<div class="detail-actions"><span class="stage-pill" data-stage="${lead.stage}">${stage.label}</span><span class="muted">You have view-only access.</span></div>`}

      <dl class="facts">
        <div><dt>Deal value</dt><dd class="fact-value">${formatCurrency(lead.value)}</dd></div>
        <div><dt>Owner</dt><dd>${lead.owner || 'Unassigned'}</dd></div>
        <div><dt>Source</dt><dd>${lead.source || '—'}</dd></div>
        <div><dt>In this stage</dt><dd>${daysBetween(lead.stageChangedAt, stage.open ? new Date() : lead.closedAt)} days</dd></div>
        <div><dt>Email</dt><dd>${lead.email ? html`<a href="mailto:${lead.email}">${lead.email}</a>` : '—'}</dd></div>
        <div><dt>Phone</dt><dd>${lead.phone ? html`<a href="tel:${lead.phone.replace(/[^\d+]/g, '')}">${lead.phone}</a>` : '—'}</dd></div>
        <div><dt>Next follow-up</dt><dd class="${overdue ? 'is-overdue' : ''}">${lead.nextFollowUp ? formatDate(lead.nextFollowUp + 'T12:00:00') : 'None set'}${overdue ? ' (overdue)' : ''}</dd></div>
        <div><dt>Created</dt><dd>${formatDate(lead.createdAt)}</dd></div>
      </dl>

      ${lead.notes ? html`<section class="detail-notes"><h3>Notes</h3><p>${lead.notes}</p></section>` : ''}

      ${editable ? html`<section class="log">
        <h3>Log activity</h3>
        <form class="log-form" data-log>
          <div class="segmented" role="radiogroup" aria-label="Activity type">
            ${ACTIVITY_TYPES.map((t, i) => html`<label><input type="radio" name="type" value="${t.id}" ${i === 0 ? raw('checked') : ''} /><span>${t.label}</span></label>`)}
          </div>
          <label class="visually-hidden" for="log-text">What happened</label>
          <textarea id="log-text" name="text" rows="2" placeholder="What happened? e.g. Called to confirm the demo date" required></textarea>
          <button class="btn btn-primary" type="submit">Log activity</button>
        </form>
      </section>` : ''}

      <section class="timeline">
        <h3>History</h3>
        <ol>
          ${lead.activities.map((a) => html`
            <li class="timeline-item" data-type="${a.type}">
              <span class="timeline-type">${activityLabel[a.type] || a.type}</span>
              <p>${a.text}${a.by && a.type !== 'stage' && a.type !== 'created' ? html`<span class="timeline-by">Logged by ${a.by}</span>` : ''}</p>
              <time datetime="${a.at}">${formatRelative(a.at)}</time>
            </li>`)}
        </ol>
      </section>
    </div>`);

  const d = dialog();
  d.querySelector('[data-close]').addEventListener('click', closeDrawer);
  if (!editable) return;
  d.querySelector('[data-field="stage"]').addEventListener('change', (e) => {
    store.moveLead(id, e.target.value);
    toast(`Moved ${lead.name} to ${stageById[e.target.value].label}`);
  });
  d.querySelector('[data-edit]').addEventListener('click', () => openLeadForm(id));
  d.querySelector('[data-delete]').addEventListener('click', () => deleteWithUndo(id));
  d.querySelector('[data-log]').addEventListener('submit', (e) => {
    e.preventDefault();
    const form = new FormData(e.target);
    const text = String(form.get('text')).trim();
    if (!text) return;
    store.addActivity(id, form.get('type'), text);
    d.querySelector('#log-text')?.focus();
  });
}

export function deleteWithUndo(id) {
  const lead = store.getLead(id);
  if (!lead) return;
  closeDrawer();
  const removed = store.deleteLead(id);
  toast(`Deleted ${lead.name}`, { action: { label: 'Undo', onClick: () => store.restoreLead(removed) }, duration: 7000 });
}

/* ---------- Create / edit form ---------- */

export function openLeadForm(id = null, defaults = {}) {
  if (!store.canEdit()) return;
  const lead = id ? store.getLead(id) : { stage: 'new', owner: OWNERS[0], source: SOURCES[0], value: '', ...defaults };
  currentLeadId = id;
  dialog().dataset.mode = 'form';
  const isEdit = Boolean(id);
  const options = (list, selected, empty) => html`
    ${empty ? html`<option value="">${empty}</option>` : ''}
    ${list.map((o) => {
      const value = typeof o === 'string' ? o : o.id;
      const label = typeof o === 'string' ? o : o.label;
      return html`<option value="${value}" ${value === selected ? raw('selected') : ''}>${label}</option>`;
    })}`;

  open(html`
    <form class="drawer-inner lead-form" novalidate>
      <header class="drawer-head">
        <h2 id="drawer-title">${isEdit ? 'Edit lead' : 'New lead'}</h2>
        <button class="btn btn-icon" type="button" data-close aria-label="Close">${closeIcon}</button>
      </header>

      <fieldset>
        <legend>Contact</legend>
        <div class="field-grid">
          <label class="field"><span>Full name</span><input name="name" value="${lead.name || ''}" required autocomplete="off" /><small class="field-error" data-error="name"></small></label>
          <label class="field"><span>Job title</span><input name="title" value="${lead.title || ''}" autocomplete="off" /></label>
          <label class="field"><span>Company</span><input name="company" value="${lead.company || ''}" required autocomplete="off" /><small class="field-error" data-error="company"></small></label>
          <label class="field"><span>Email</span><input name="email" type="email" value="${lead.email || ''}" autocomplete="off" /><small class="field-error" data-error="email"></small></label>
          <label class="field"><span>Phone</span><input name="phone" type="tel" value="${lead.phone || ''}" autocomplete="off" /></label>
        </div>
      </fieldset>

      <fieldset>
        <legend>Deal</legend>
        <div class="field-grid">
          <label class="field"><span>Deal value (USD)</span><input name="value" type="number" min="0" step="100" inputmode="numeric" value="${lead.value ?? ''}" /><small class="field-error" data-error="value"></small></label>
          <label class="field"><span>Stage</span><select name="stage">${options(STAGES, lead.stage)}</select></label>
          <label class="field"><span>Owner</span><select name="owner">${options(OWNERS, lead.owner, 'Unassigned')}</select></label>
          <label class="field"><span>Source</span><select name="source">${options(SOURCES, lead.source, 'Unknown')}</select></label>
          <label class="field"><span>Next follow-up</span><input name="nextFollowUp" type="date" value="${lead.nextFollowUp || ''}" /></label>
        </div>
      </fieldset>

      <label class="field"><span>Notes</span><textarea name="notes" rows="4">${lead.notes || ''}</textarea></label>

      <footer class="drawer-foot">
        <button class="btn" type="button" data-cancel>Cancel</button>
        <button class="btn btn-primary" type="submit">${isEdit ? 'Save changes' : 'Add lead'}</button>
      </footer>
    </form>`);

  const d = dialog();
  const form = d.querySelector('form');
  form.querySelector('[name="name"]').focus();
  d.querySelector('[data-close]').addEventListener('click', closeDrawer);
  d.querySelector('[data-cancel]').addEventListener('click', () => (isEdit ? openLeadDetail(id) : closeDrawer()));

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    const errors = validate(data);
    form.querySelectorAll('[data-error]').forEach((el) => {
      el.textContent = errors[el.dataset.error] || '';
      form.querySelector(`[name="${el.dataset.error}"]`).toggleAttribute('aria-invalid', Boolean(errors[el.dataset.error]));
    });
    const firstError = Object.keys(errors)[0];
    if (firstError) {
      form.querySelector(`[name="${firstError}"]`).focus();
      return;
    }
    const clean = {
      ...data,
      name: data.name.trim(),
      company: data.company.trim(),
      email: data.email.trim(),
      value: Number(data.value) || 0,
      nextFollowUp: data.nextFollowUp || null,
    };
    if (isEdit) {
      store.updateLead(id, clean);
      toast('Changes saved');
      openLeadDetail(id);
    } else {
      const created = store.createLead(clean);
      toast(`Added ${created.name}`);
      openLeadDetail(created.id);
    }
  });
}

function validate(data) {
  const errors = {};
  if (!data.name.trim()) errors.name = 'Enter the contact’s name.';
  if (!data.company.trim()) errors.company = 'Enter the company name.';
  if (data.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email.trim())) errors.email = 'Enter an email like name@company.com.';
  if (data.value !== '' && (Number.isNaN(Number(data.value)) || Number(data.value) < 0)) errors.value = 'Enter a positive number, or leave it blank.';
  return errors;
}
