// Lightweight, dependency-free charts rendered as HTML/CSS so they reflow
// with the layout. Every mark is focusable and shares one tooltip.

import { html, escapeHtml } from './utils.js';

/** Round an axis maximum up to a clean number and return evenly spaced ticks. */
export function niceTicks(max, count = 4) {
  if (max <= 0) return [0, 1];
  const rough = max / count;
  const mag = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= rough);
  const top = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = 0; v <= top + step / 2; v += step) ticks.push(v);
  return ticks;
}

/**
 * Vertical columns for change over time.
 * data: [{ label, value, tip }]; format: value -> string for ticks/labels.
 */
export function columnChart({ data, format, tickFormat = format, label }) {
  const max = Math.max(0, ...data.map((d) => d.value));
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1] || 1;
  const peak = data.reduce((best, d, i) => (d.value > (data[best]?.value ?? -1) ? i : best), 0);
  const labelEvery = data.length > 12 ? 3 : data.length > 7 ? 2 : 1;

  return html`
    <div class="colchart" role="img" aria-label="${label}">
      <div class="colchart-y" aria-hidden="true">
        ${ticks.slice().reverse().map((t) => html`<span style="bottom:${(t / top) * 100}%">${tickFormat(t)}</span>`)}
      </div>
      <div class="colchart-plot">
        ${ticks.map((t) => html`<span class="gridline ${t === 0 ? 'baseline' : ''}" style="bottom:${(t / top) * 100}%"></span>`)}
        <div class="colchart-cols">
          ${data.map((d, i) => html`
            <div class="col" tabindex="0" data-tip="${d.tip || `${d.label}: ${format(d.value)}`}">
              ${i === peak && d.value > 0 ? html`<span class="col-label" style="bottom:${(d.value / top) * 100}%">${format(d.value)}</span>` : ''}
              <span class="bar" style="height:${(d.value / top) * 100}%"></span>
            </div>`)}
        </div>
      </div>
      <div class="colchart-x" aria-hidden="true">
        ${data.map((d, i) => html`<span>${i % labelEvery === 0 || i === data.length - 1 ? d.label : ''}</span>`)}
      </div>
    </div>`;
}

/**
 * Horizontal bars with the value at the tip.
 * data: [{ label, value, note, stage }] — `stage` picks an ordinal color via CSS.
 */
export function barList({ data, format, label }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return html`
    <ol class="barlist" aria-label="${label}">
      ${data.map((d) => html`
        <li class="barlist-row" tabindex="0" data-tip="${d.tip || `${d.label}: ${format(d.value)}`}">
          <span class="barlist-label">${d.label}</span>
          <span class="barlist-track">
            <span class="barlist-bar" ${d.stage ? html`data-stage="${d.stage}"` : ''} style="width:${Math.max(d.value > 0 ? 1.5 : 0, (d.value / max) * 100)}%"></span>
            <span class="barlist-value">${format(d.value)}</span>
          </span>
          ${d.note ? html`<span class="barlist-note">${d.note}</span>` : ''}
        </li>`)}
    </ol>`;
}

/** One shared tooltip for every element with data-tip inside `root`. */
export function attachTooltips(root) {
  let tip = document.querySelector('.chart-tip');
  if (!tip) {
    tip = document.createElement('div');
    tip.className = 'chart-tip';
    tip.setAttribute('role', 'tooltip');
    tip.hidden = true;
    document.body.append(tip);
    window.addEventListener('scroll', () => { tip.hidden = true; }, { passive: true });
  }

  const show = (el) => {
    tip.innerHTML = escapeHtml(el.dataset.tip).replace(/\n/g, '<br>');
    tip.hidden = false;
    const r = el.getBoundingClientRect();
    const target = el.querySelector('.bar, .barlist-bar') || el;
    const t = target.getBoundingClientRect();
    const tw = tip.offsetWidth;
    const th = tip.offsetHeight;
    const centerX = r.left + r.width / 2;
    let left = Math.min(window.innerWidth - tw - 8, Math.max(8, centerX - tw / 2));
    let top = (el.classList.contains('col') ? t.top : r.top) - th - 10;
    if (top < 8) top = r.bottom + 10;
    tip.style.transform = `translate(${Math.round(left + window.scrollX)}px, ${Math.round(top + window.scrollY)}px)`;
  };
  const hide = () => { tip.hidden = true; };

  root.addEventListener('pointerover', (e) => {
    const el = e.target.closest('[data-tip]');
    if (el) show(el);
  });
  root.addEventListener('pointerout', (e) => {
    const el = e.target.closest('[data-tip]');
    if (el && !el.contains(e.relatedTarget)) hide();
  });
  root.addEventListener('focusin', (e) => {
    const el = e.target.closest('[data-tip]');
    if (el) show(el);
  });
  root.addEventListener('focusout', hide);
  return hide;
}
