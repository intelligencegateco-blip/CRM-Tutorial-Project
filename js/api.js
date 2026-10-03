// Thin wrapper around the PHP API in /api.

export class ApiError extends Error {
  constructor(message, { status = 0, field = null, network = false, notJson = false } = {}) {
    super(message);
    this.status = status;
    this.field = field;
    this.network = network;
    this.notJson = notJson;
  }
}

export async function api(method, path, body) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  // Required on every write; the server rejects writes without it (CSRF guard).
  if (method !== 'GET') headers['X-CRM-Request'] = '1';

  let res;
  try {
    res = await fetch(`api/${path}`, {
      method,
      headers,
      credentials: 'same-origin',
      cache: 'no-store',
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError('Can’t reach the server. Check your internet connection.', { network: true });
  }

  if (!(res.headers.get('content-type') || '').includes('application/json')) {
    throw new ApiError(`The server sent an unexpected response (${res.status}).`, { status: res.status, notJson: true });
  }
  const data = await res.json();
  if (!res.ok) throw new ApiError(data.error || `Request failed (${res.status}).`, { status: res.status, field: data.field });
  return data;
}
