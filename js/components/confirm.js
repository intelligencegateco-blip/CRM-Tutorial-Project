import { html } from '../utils.js';

/** In-page confirmation dialog. Resolves true when the person confirms. */
export function confirmAction({ title, body, confirmLabel, danger = true }) {
  const dialog = document.getElementById('confirm');
  dialog.innerHTML = html`
    <form method="dialog">
      <h2 id="confirm-title">${title}</h2>
      <p>${body}</p>
      <div class="confirm-actions">
        <button class="btn" value="cancel" autofocus>Cancel</button>
        <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" value="ok">${confirmLabel}</button>
      </div>
    </form>`;
  dialog.showModal();
  return new Promise((resolve) => {
    dialog.addEventListener('close', () => resolve(dialog.returnValue === 'ok'), { once: true });
  });
}
