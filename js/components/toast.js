import { html } from '../utils.js';

/** Show a short confirmation. Pass `action` ({ label, onClick }) for things like Undo. */
export function toast(message, { action, duration = 5000 } = {}) {
  const root = document.getElementById('toasts');
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = html`<span>${message}</span>${action ? html`<button type="button" class="toast-action">${action.label}</button>` : ''}`;
  root.append(el);
  // As a popover the stack sits in the top layer, above an open drawer.
  if (root.showPopover) {
    if (root.matches(':popover-open')) root.hidePopover();
    root.showPopover();
  }

  const close = () => {
    el.classList.add('leaving');
    setTimeout(() => el.remove(), 200);
  };
  const timer = setTimeout(close, duration);
  el.querySelector('.toast-action')?.addEventListener('click', () => {
    clearTimeout(timer);
    action.onClick();
    close();
  });
}
