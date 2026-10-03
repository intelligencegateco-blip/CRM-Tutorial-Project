// Sign-in and first-run setup screens.

import * as store from '../store.js';
import { html, $ } from '../utils.js';

const brandMark = html`<svg class="brand-mark" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="8" /><path d="M8 22h4v-6H8zM14 22h4V10h-4zM20 22h4v-9h-4z" /></svg>`;

/** Render the sign-in (or setup) screen into `container`; calls onDone once signed in. */
export function renderAuth(container, kind, onDone) {
  const setup = kind === 'setup';
  container.innerHTML = html`
    <div class="auth">
      <form class="auth-card" novalidate>
        <div class="auth-brand">${brandMark}<span>Groundwork</span></div>
        <h1>${setup ? 'Set up your CRM' : 'Sign in'}</h1>
        <p class="auth-lede">${setup
          ? 'Create the owner account. You’ll need the setup code you were given with this site.'
          : 'Use the email and password your admin set up for you.'}</p>

        <p class="auth-error" role="alert" hidden></p>

        ${setup ? html`
          <label class="field"><span>Setup code</span><input name="code" autocomplete="off" autocapitalize="characters" spellcheck="false" required /></label>
          <label class="field"><span>Your name</span><input name="name" autocomplete="name" required /></label>` : ''}
        <label class="field"><span>Email</span><input name="email" type="email" autocomplete="${setup ? 'email' : 'username'}" required /></label>
        <label class="field"><span>Password</span><input name="password" type="password" autocomplete="${setup ? 'new-password' : 'current-password'}" required /></label>
        ${setup ? html`
          <p class="field-hint">At least 10 characters.</p>
          <label class="check"><input type="checkbox" name="demo" checked /><span>Start with sample leads so you can explore. You can delete them all later.</span></label>` : ''}

        <button class="btn btn-primary auth-submit" type="submit">${setup ? 'Create account' : 'Sign in'}</button>
      </form>
    </div>`;

  const form = $('form', container);
  const error = $('.auth-error', form);
  const submit = $('.auth-submit', form);
  form.querySelector('input').focus();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    error.hidden = true;
    form.querySelectorAll('[aria-invalid]').forEach((el) => el.removeAttribute('aria-invalid'));
    submit.disabled = true;
    submit.textContent = setup ? 'Creating account…' : 'Signing in…';
    try {
      if (setup) {
        await store.setup(data);
        if (data.demo) await store.resetDemoData();
      } else {
        await store.login(data.email, data.password);
      }
      onDone();
    } catch (err) {
      error.textContent = err.message;
      error.hidden = false;
      const field = err.field && form.querySelector(`[name="${err.field}"]`);
      if (field) {
        field.setAttribute('aria-invalid', 'true');
        field.focus();
      }
      submit.disabled = false;
      submit.textContent = setup ? 'Create account' : 'Sign in';
    }
  });
}

/** Full-page message for when the app can't start (server down, etc.). */
export function renderFatal(container, message, onRetry) {
  container.innerHTML = html`
    <div class="auth">
      <div class="auth-card">
        <div class="auth-brand">${brandMark}<span>Groundwork</span></div>
        <h1>Can’t load the CRM</h1>
        <p class="auth-lede">${message}</p>
        <button class="btn btn-primary auth-submit" type="button">Try again</button>
      </div>
    </div>`;
  $('.auth-submit', container).addEventListener('click', onRetry);
}
