// Shared helpers: safe HTML templating, formatting, dates.

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

class SafeHtml {
  constructor(str) { this.str = str; }
  toString() { return this.str; }
}

/** Mark a string as trusted markup so `html` won't escape it. */
export const raw = (str) => new SafeHtml(str);

/**
 * Tagged template that escapes every interpolation unless it is SafeHtml.
 * Arrays are joined, null/undefined/false render as nothing.
 */
export function html(strings, ...values) {
  let out = strings[0];
  values.forEach((v, i) => {
    out += renderValue(v) + strings[i + 1];
  });
  return new SafeHtml(out);
}

function renderValue(v) {
  if (v instanceof SafeHtml) return v.str;
  if (Array.isArray(v)) return v.map(renderValue).join('');
  if (v === null || v === undefined || v === false) return '';
  return escapeHtml(v);
}

export function $(selector, root = document) { return root.querySelector(selector); }
export function $$(selector, root = document) { return [...root.querySelectorAll(selector)]; }

const currencyFmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const compactFmt = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });
const numberFmt = new Intl.NumberFormat('en-US');

export const formatCurrency = (n) => currencyFmt.format(n || 0);
export const formatCompactCurrency = (n) => (Math.abs(n) >= 10000 ? '$' + compactFmt.format(n) : formatCurrency(n));
export const formatNumber = (n) => numberFmt.format(n || 0);
export const formatPercent = (n, digits = 0) => `${(n * 100).toFixed(digits)}%`;

const dateFmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const shortDateFmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });

export const DAY = 86400000;

export function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.getFullYear() === new Date().getFullYear() ? shortDateFmt.format(d) : dateFmt.format(d);
}

export function formatRelative(iso) {
  if (!iso) return 'Never';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / DAY);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} wk ago`;
  return formatDate(iso);
}

export function daysBetween(a, b) {
  return Math.max(0, Math.round((new Date(b) - new Date(a)) / DAY));
}

export function initials(name = '') {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('');
}

export function uid(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

export function debounce(fn, ms = 150) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

export function downloadFile(filename, content, type = 'text/csv') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function toCsv(rows, columns) {
  const cell = (v) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [columns.map((c) => cell(c.label)).join(','), ...rows.map((r) => columns.map((c) => cell(c.value(r))).join(','))].join('\n');
}
