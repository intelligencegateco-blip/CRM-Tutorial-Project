// Analytics tab: how sales are going across every lead, for a chosen period.

import { STAGES, OPEN_STAGES, SOURCES, OWNERS, stageById, stageIndex } from '../config.js';
import * as store from '../store.js';
import { openLeadDetail } from '../components/drawer.js';
import { columnChart, barList, attachTooltips } from '../charts.js';
import { html, raw, $, formatCurrency, formatCompactCurrency, formatNumber, formatPercent, daysBetween, DAY } from '../utils.js';

const RANGES = [
  { id: '30', label: '30 days', days: 30, bucket: 'week', prevLabel: 'previous 30 days' },
  { id: '90', label: '90 days', days: 90, bucket: 'week', prevLabel: 'previous 90 days' },
  { id: '365', label: '12 months', days: 365, bucket: 'month', prevLabel: 'previous 12 months' },
  { id: 'all', label: 'All time', days: null, bucket: 'month' },
];

const filters = { range: '365', owner: '' };
const tableViews = new Set();
let root = null;

/* ---------- Data ---------- */

function periodBounds(range, leads) {
  const end = Date.now();
  if (!range.days) {
    const earliest = Math.min(end, ...leads.map((l) => new Date(l.createdAt).getTime()));
    return { start: earliest, end, prev: null };
  }
  const start = end - range.days * DAY;
  const prevStart = start - range.days * DAY;
  // Only compare against the previous period when the data actually covers it.
  const earliest = Math.min(...leads.map((l) => new Date(l.createdAt).getTime()));
  return { start, end, prev: earliest <= prevStart ? { start: prevStart, end: start } : null };
}

const within = (iso, { start, end }) => {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return t >= start && t < end;
};

function metrics(leads, period) {
  const created = leads.filter((l) => within(l.createdAt, period));
  const won = leads.filter((l) => l.stage === 'won' && within(l.closedAt, period));
  const lost = leads.filter((l) => l.stage === 'lost' && within(l.closedAt, period));
  const revenue = won.reduce((s, l) => s + l.value, 0);
  return {
    created: created.length,
    won: won.length,
    revenue,
    winRate: won.length + lost.length ? won.length / (won.length + lost.length) : null,
    avgDeal: won.length ? revenue / won.length : null,
    cycle: won.length ? won.reduce((s, l) => s + daysBetween(l.createdAt, l.closedAt), 0) / won.length : null,
  };
}

function bucketize(range, period) {
  const buckets = [];
  const end = new Date(period.end);
  if (range.bucket === 'week') {
    const d = new Date(period.start);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // back to Monday
    while (d <= end) {
      const start = d.getTime();
      d.setDate(d.getDate() + 7);
      buckets.push({ start, end: d.getTime(), label: new Date(start).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), long: `Week of ${new Date(start).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}` });
    }
  } else {
    const d = new Date(period.start);
    d.setHours(0, 0, 0, 0);
    d.setDate(1);
    while (d <= end) {
      const start = d.getTime();
      const first = buckets.length === 0;
      d.setMonth(d.getMonth() + 1);
      const s = new Date(start);
      const short = s.toLocaleDateString('en-US', { month: 'short' });
      buckets.push({ start, end: d.getTime(), label: first || s.getMonth() === 0 ? `${short} ’${String(s.getFullYear()).slice(2)}` : short, long: s.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) });
    }
  }
  return buckets;
}

/** Furthest open stage each lead reached, read from its stage history. */
function furthestStage(lead) {
  const reached = (lead.history || [{ stage: lead.stage }]).map((h) => h.stage);
  if (reached.includes('won')) return STAGES.length; // won passed through everything
  return Math.max(...reached.filter((s) => s !== 'lost').map(stageIndex));
}

/* ---------- View ---------- */

function mount(container) {
  root = container;
  container.innerHTML = html`
    <div class="page">
      <header class="page-head">
        <div>
          <h1>Analytics</h1>
          <p class="page-summary" data-summary></p>
        </div>
        <div class="toolbar toolbar-compact">
          <div class="segmented segmented-range" role="radiogroup" aria-label="Time period">
            ${RANGES.map((r) => html`<label><input type="radio" name="range" value="${r.id}" ${filters.range === r.id ? raw('checked') : ''} /><span>${r.label}</span></label>`)}
          </div>
          <label class="filter">
            <span class="visually-hidden">Owner</span>
            <select data-owner>
              <option value="">Whole team</option>
              ${OWNERS.map((o) => html`<option ${filters.owner === o ? raw('selected') : ''}>${o}</option>`)}
            </select>
          </label>
        </div>
      </header>
      <div data-body></div>
    </div>`;

  container.querySelectorAll('[name="range"]').forEach((el) => el.addEventListener('change', () => { filters.range = el.value; render(); }));
  $('[data-owner]', container).addEventListener('change', (e) => { filters.owner = e.target.value; render(); });
  const body = $('[data-body]', container);
  attachTooltips(body);
  body.addEventListener('click', (e) => {
    const toggle = e.target.closest('[data-toggle-table]');
    if (toggle) {
      const id = toggle.dataset.toggleTable;
      tableViews.has(id) ? tableViews.delete(id) : tableViews.add(id);
      render();
      $(`[data-toggle-table="${id}"]`, root)?.focus();
      return;
    }
    const lead = e.target.closest('[data-open]');
    if (lead) openLeadDetail(lead.dataset.open);
  });
  render();
}

function chartCard({ id, title, subtitle, chart, table, className = '' }) {
  const showTable = tableViews.has(id);
  return html`
    <section class="panel ${className}" aria-labelledby="${id}-title">
      <header class="panel-head">
        <div>
          <h2 id="${id}-title">${title}</h2>
          ${subtitle ? html`<p>${subtitle}</p>` : ''}
        </div>
        ${table ? html`<button type="button" class="btn btn-quiet btn-small" data-toggle-table="${id}" aria-pressed="${showTable}">${showTable ? 'Show chart' : 'Show table'}</button>` : ''}
      </header>
      ${showTable ? html`<div class="table-wrap">${table}</div>` : chart}
    </section>`;
}

function simpleTable(headers, rows) {
  return html`<table class="data-table">
    <thead><tr>${headers.map((h, i) => html`<th scope="col" class="${i ? 'num' : ''}">${h}</th>`)}</tr></thead>
    <tbody>${rows.map((r) => html`<tr>${r.map((c, i) => (i ? html`<td class="num">${c}</td>` : html`<th scope="row">${c}</th>`))}</tr>`)}</tbody>
  </table>`;
}

function delta(current, previous, { goodWhenUp = true, kind = 'pct' } = {}) {
  if (current === null || previous === null || previous === undefined) return '';
  let change;
  let text;
  if (kind === 'points') {
    change = current - previous;
    text = `${Math.abs(Math.round(change * 100))} pts`;
  } else {
    if (!previous) return '';
    change = (current - previous) / previous;
    text = formatPercent(Math.abs(change));
  }
  if (Math.abs(change) < 0.005) return html`<span class="delta">No change</span>`;
  const up = change > 0;
  const good = up === goodWhenUp;
  return html`<span class="delta ${good ? 'is-good' : 'is-bad'}"><span aria-hidden="true">${up ? '▲' : '▼'}</span><span class="visually-hidden">${up ? 'Up' : 'Down'}</span> ${text}</span>`;
}

function render() {
  if (!root) return;
  const range = RANGES.find((r) => r.id === filters.range);
  const all = store.getLeads();
  const leads = filters.owner ? all.filter((l) => l.owner === filters.owner) : all;
  const body = $('[data-body]', root);

  if (!leads.length) {
    $('[data-summary]', root).textContent = '';
    body.innerHTML = html`<div class="empty"><h2>Nothing to measure yet</h2><p>Add leads and move them through the pipeline. Charts fill in as deals open and close.</p></div>`;
    return;
  }

  const period = periodBounds(range, leads);
  const now = metrics(leads, period);
  const prev = period.prev ? metrics(leads, period.prev) : null;
  const vs = range.prevLabel ? `vs ${range.prevLabel}` : '';
  const open = leads.filter((l) => stageById[l.stage].open);
  const openValue = open.reduce((s, l) => s + l.value, 0);
  const weighted = open.reduce((s, l) => s + l.value * stageById[l.stage].probability, 0);

  $('[data-summary]', root).textContent = `${filters.owner || 'The whole team'}, ${range.days ? `last ${range.label}` : 'all time'}. ${now.won} ${now.won === 1 ? 'deal' : 'deals'} won from ${now.created} new ${now.created === 1 ? 'lead' : 'leads'}.`;

  // Trends
  const buckets = bucketize(range, period);
  const revenueSeries = buckets.map((b) => {
    const won = leads.filter((l) => l.stage === 'won' && within(l.closedAt, b));
    const value = won.reduce((s, l) => s + l.value, 0);
    return { label: b.label, value, tip: `${b.long}\n${formatCurrency(value)} from ${won.length} ${won.length === 1 ? 'deal' : 'deals'}` };
  });
  const leadSeries = buckets.map((b) => {
    const value = leads.filter((l) => within(l.createdAt, b)).length;
    return { label: b.label, value, tip: `${b.long}\n${value} new ${value === 1 ? 'lead' : 'leads'}` };
  });

  // Funnel: of leads created in the period, how many reached each stage.
  const cohort = leads.filter((l) => within(l.createdAt, period));
  const funnelStages = [...OPEN_STAGES, stageById.won];
  const funnel = funnelStages.map((s, i) => {
    const count = cohort.filter((l) => furthestStage(l) >= (s.id === 'won' ? STAGES.length : i)).length;
    return { stage: s, count };
  });
  const funnelData = funnel.map((f, i) => {
    const prevCount = i ? funnel[i - 1].count : null;
    const conv = prevCount ? f.count / prevCount : null;
    return {
      label: f.stage.label,
      value: f.count,
      stage: f.stage.id,
      note: i === 0 ? 'Start' : conv === null ? '—' : `${formatPercent(conv)} moved on`,
      tip: `${f.stage.label}: ${f.count} ${f.count === 1 ? 'lead' : 'leads'}${conv !== null ? `\n${formatPercent(conv)} of the previous stage` : ''}`,
    };
  });

  // Sources and team
  const sourceRows = SOURCES.map((src) => {
    const created = cohort.filter((l) => l.source === src);
    const won = leads.filter((l) => l.source === src && l.stage === 'won' && within(l.closedAt, period));
    const lost = leads.filter((l) => l.source === src && l.stage === 'lost' && within(l.closedAt, period));
    return { name: src, leads: created.length, won: won.length, winRate: won.length + lost.length ? won.length / (won.length + lost.length) : null, revenue: won.reduce((s, l) => s + l.value, 0) };
  }).sort((a, b) => b.revenue - a.revenue || b.leads - a.leads);

  const teamRows = OWNERS.filter((o) => !filters.owner || o === filters.owner).map((o) => {
    const mine = all.filter((l) => l.owner === o);
    const mineOpen = mine.filter((l) => stageById[l.stage].open);
    const m = metrics(mine, period);
    return { name: o, open: mineOpen.length, openValue: mineOpen.reduce((s, l) => s + l.value, 0), won: m.won, winRate: m.winRate, revenue: m.revenue };
  }).sort((a, b) => b.revenue - a.revenue);

  // Needs attention: open deals with an overdue follow-up or no activity in 3 weeks.
  const today = new Date().toISOString().slice(0, 10);
  const attention = open
    .map((l) => {
      const quietDays = daysBetween(l.lastContactAt || l.updatedAt || l.createdAt, new Date());
      const overdue = l.nextFollowUp && l.nextFollowUp < today;
      const reason = overdue ? `Follow-up was due ${daysBetween(l.nextFollowUp + 'T12:00:00', new Date())}d ago` : quietDays >= 21 ? `No contact for ${quietDays} days` : null;
      return reason && { lead: l, reason };
    })
    .filter(Boolean)
    .sort((a, b) => b.lead.value - a.lead.value);

  const maxSourceRevenue = Math.max(1, ...sourceRows.map((r) => r.revenue));
  const maxTeamRevenue = Math.max(1, ...teamRows.map((r) => r.revenue));
  const rateText = (r) => (r === null ? '—' : formatPercent(r));

  body.innerHTML = html`
    <section class="kpis" aria-label="Key numbers">
      <div class="kpi kpi-hero">
        <p class="kpi-label">Revenue won</p>
        <p class="kpi-value">${formatCurrency(now.revenue)}</p>
        <p class="kpi-foot">${prev?.revenue ? html`${delta(now.revenue, prev.revenue)} ${vs}` : `From ${now.won} ${now.won === 1 ? 'deal' : 'deals'}`}</p>
      </div>
      <div class="kpi">
        <p class="kpi-label">New leads</p>
        <p class="kpi-value">${formatNumber(now.created)}</p>
        <p class="kpi-foot">${delta(now.created, prev?.created)}</p>
      </div>
      <div class="kpi">
        <p class="kpi-label">Win rate</p>
        <p class="kpi-value">${rateText(now.winRate)}</p>
        <p class="kpi-foot">${delta(now.winRate, prev?.winRate, { kind: 'points' })}</p>
      </div>
      <div class="kpi">
        <p class="kpi-label">Average deal won</p>
        <p class="kpi-value">${now.avgDeal === null ? '—' : formatCompactCurrency(now.avgDeal)}</p>
        <p class="kpi-foot">${delta(now.avgDeal, prev?.avgDeal)}</p>
      </div>
      <div class="kpi">
        <p class="kpi-label">Days to close</p>
        <p class="kpi-value">${now.cycle === null ? '—' : Math.round(now.cycle)}</p>
        <p class="kpi-foot">${delta(now.cycle, prev?.cycle, { goodWhenUp: false })}</p>
      </div>
      <div class="kpi kpi-wide">
        <p class="kpi-label">Open pipeline today</p>
        <p class="kpi-value">${formatCompactCurrency(openValue)}</p>
        <p class="kpi-foot"><span class="muted">${formatCompactCurrency(weighted)} weighted</span></p>
      </div>
    </section>

    <div class="grid-2">
      ${chartCard({
        id: 'revenue',
        title: 'Revenue won',
        subtitle: `Value of deals marked won, by ${range.bucket}`,
        chart: columnChart({ data: revenueSeries, format: formatCompactCurrency, label: `Revenue won by ${range.bucket}` }),
        table: simpleTable([range.bucket === 'week' ? 'Week of' : 'Month', 'Revenue won'], revenueSeries.map((d, i) => [buckets[i].long.replace('Week of ', ''), formatCurrency(d.value)])),
      })}
      ${chartCard({
        id: 'leads',
        title: 'New leads',
        subtitle: `Leads added, by ${range.bucket}`,
        chart: columnChart({ data: leadSeries, format: formatNumber, label: `New leads by ${range.bucket}` }),
        table: simpleTable([range.bucket === 'week' ? 'Week of' : 'Month', 'New leads'], leadSeries.map((d, i) => [buckets[i].long.replace('Week of ', ''), formatNumber(d.value)])),
      })}
    </div>

    <div class="grid-2 grid-2-wide-left">
      ${chartCard({
        id: 'funnel',
        title: 'Conversion funnel',
        subtitle: `How far the ${cohort.length} leads added in this period have got so far`,
        chart: cohort.length ? barList({ data: funnelData, format: formatNumber, label: 'Leads reaching each stage' }) : html`<p class="panel-empty">No leads were added in this period.</p>`,
        table: simpleTable(['Stage', 'Leads reached', 'Moved on from previous'], funnelData.map((d, i) => [d.label, formatNumber(d.value), i ? d.note.replace(' moved on', '') : '—'])),
      })}
      <section class="panel" aria-labelledby="attention-title">
        <header class="panel-head">
          <div>
            <h2 id="attention-title">Needs attention</h2>
            <p>Open deals with an overdue follow-up or no contact in three weeks</p>
          </div>
        </header>
        ${attention.length
          ? html`<ul class="attention" role="list">
              ${attention.slice(0, 6).map(({ lead, reason }) => html`
                <li><button type="button" data-open="${lead.id}">
                  <span class="attention-main"><strong>${lead.company}</strong><span>${reason}</span></span>
                  <span class="attention-side"><span>${formatCompactCurrency(lead.value)}</span><span class="stage-pill" data-stage="${lead.stage}">${stageById[lead.stage].label}</span></span>
                </button></li>`)}
            </ul>
            ${attention.length > 6 ? html`<p class="panel-foot">${attention.length - 6} more open deals need attention. See the <a href="#/leads">Leads tab</a>.</p>` : ''}`
          : html`<p class="panel-empty">Every open deal has been touched recently. Nice work.</p>`}
      </section>
    </div>

    <section class="panel" aria-labelledby="sources-title">
      <header class="panel-head">
        <div>
          <h2 id="sources-title">Lead sources</h2>
          <p>Where this period’s leads came from, and which sources turn into revenue</p>
        </div>
      </header>
      <div class="table-wrap">
        <table class="data-table bar-table">
          <thead><tr><th scope="col">Source</th><th scope="col" class="num">Leads</th><th scope="col" class="num">Won</th><th scope="col" class="num">Win rate</th><th scope="col" class="col-bar">Revenue won</th></tr></thead>
          <tbody>
            ${sourceRows.map((r) => html`<tr>
              <th scope="row">${r.name}</th>
              <td class="num">${r.leads}</td>
              <td class="num">${r.won}</td>
              <td class="num">${rateText(r.winRate)}</td>
              <td class="col-bar"><span class="inline-bar"><span style="width:${(r.revenue / maxSourceRevenue) * 100}%"></span></span><span class="inline-value">${formatCurrency(r.revenue)}</span></td>
            </tr>`)}
          </tbody>
        </table>
      </div>
    </section>

    <section class="panel" aria-labelledby="team-title">
      <header class="panel-head">
        <div>
          <h2 id="team-title">Team</h2>
          <p>Open deals are as of today; won deals and win rate are for this period</p>
        </div>
      </header>
      <div class="table-wrap">
        <table class="data-table bar-table">
          <thead><tr><th scope="col">Owner</th><th scope="col" class="num">Open deals</th><th scope="col" class="num">Open value</th><th scope="col" class="num">Won</th><th scope="col" class="num">Win rate</th><th scope="col" class="col-bar">Revenue won</th></tr></thead>
          <tbody>
            ${teamRows.map((r) => html`<tr>
              <th scope="row">${r.name}</th>
              <td class="num">${r.open}</td>
              <td class="num">${formatCompactCurrency(r.openValue)}</td>
              <td class="num">${r.won}</td>
              <td class="num">${rateText(r.winRate)}</td>
              <td class="col-bar"><span class="inline-bar"><span style="width:${(r.revenue / maxTeamRevenue) * 100}%"></span></span><span class="inline-value">${formatCurrency(r.revenue)}</span></td>
            </tr>`)}
          </tbody>
        </table>
      </div>
    </section>`;
}

export default {
  mount,
  update: render,
  unmount() { root = null; },
};
