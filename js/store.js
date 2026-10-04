// Data layer. Every read and write in the app goes through this module.
//
// Two modes:
// - "api": the PHP backend in /api is reachable. Changes apply to the screen
//   at once, are sent to the server in order, and the server's saved copy
//   replaces the local one when it comes back.
// - "local": no backend (e.g. previewing with a static file server). Data
//   lives in this browser's localStorage, seeded with demo leads.

import { STORAGE_KEY, OWNERS, DEMO_OWNERS, stageById } from './config.js';
import { generateSeedData } from './seed.js';
import { uid } from './utils.js';
import { api, ApiError } from './api.js';

const listeners = new Set();
let state = { leads: [] };
let mode = 'local';
let session = { user: null, users: [] };
let queue = Promise.resolve();
let pending = 0;

export const getMode = () => mode;
export const getUser = () => session.user;
export const getUsers = () => session.users;
/** Owner: manages user access and bulk data. Without the server, this browser is the owner. */
export const isOwner = () => mode === 'local' || session.user?.role === 'owner';
/** Owner and editors can change leads; viewers are read-only. */
export const canEdit = () => mode === 'local' || ['owner', 'editor'].includes(session.user?.role);
export const hasPendingSaves = () => pending > 0;

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit(change) {
  if (mode === 'local') persistLocal();
  listeners.forEach((fn) => fn(change));
}

/* ---------- Startup & session ---------- */

/** Resolves to { status: 'ready' | 'login' | 'setup' }. */
export async function init() {
  let s;
  try {
    s = await api('GET', 'session');
  } catch (e) {
    // No PHP backend here (static preview): fall back to browser storage.
    if (e instanceof ApiError && (e.notJson || e.status === 404)) {
      mode = 'local';
      state = loadLocal();
      refreshOwners();
      return { status: 'ready' };
    }
    throw e;
  }
  mode = 'api';
  if (s.needsSetup) return { status: 'setup' };
  if (!s.user) return { status: 'login' };
  await loadFromServer();
  return { status: 'ready' };
}

async function loadFromServer() {
  const data = await api('GET', 'bootstrap');
  session = { user: data.user, users: data.users };
  state = { leads: data.leads };
  refreshOwners();
}

/** Pull the latest saved data (other people's changes). Skipped while saves are in flight. */
export async function refresh() {
  if (mode !== 'api' || pending > 0) return;
  try {
    await loadFromServer();
    emit({ type: 'reset' });
  } catch (e) {
    if (e.status === 401) emit({ type: 'auth' });
  }
}

export async function login(email, password) {
  const data = await api('POST', 'login', { email, password });
  session.user = data.user;
  await loadFromServer();
}

export async function setup({ code, name, email, password }) {
  const data = await api('POST', 'setup', { code, name, email, password });
  session.user = data.user;
  await loadFromServer();
}

export async function logout() {
  try { await api('POST', 'logout'); } catch { /* signed out locally either way */ }
  session = { user: null, users: [] };
  state = { leads: [] };
}

export async function changePassword(current, password) {
  await api('POST', 'account/password', { current, password });
}

/* User access (owner only; the server enforces it too) */

async function usersRequest(method, path, body) {
  const data = await api(method, path, body);
  session.users = data.users;
  refreshOwners();
  emit({ type: 'users' });
}

export const addUser = (user) => usersRequest('POST', 'users', user);
export const updateUser = (id, patch) => usersRequest('PATCH', `users/${id}`, patch);
export const resetUserPassword = (id, password) => usersRequest('POST', `users/${id}/password`, { password });
export const removeUser = (id) => usersRequest('DELETE', `users/${id}`);

/** Owner choices: team accounts first, then anyone already owning a lead. */
function refreshOwners() {
  const names = mode === 'api' ? session.users.map((u) => u.name) : [...DEMO_OWNERS];
  for (const l of state.leads) if (l.owner && !names.includes(l.owner)) names.push(l.owner);
  OWNERS.splice(0, OWNERS.length, ...names);
}

/* ---------- Syncing ---------- */

/** Send one change to the server, in order with the others. */
function sync(request) {
  if (mode !== 'api') return;
  pending += 1;
  queue = queue
    .then(request)
    .then((res) => {
      if (res?.lead) replaceLead(res.lead);
    })
    .catch(async (e) => {
      if (e.status === 401) return emit({ type: 'auth' });
      emit({ type: 'error', message: `${e.message} Showing the latest saved data instead.` });
      try { await loadFromServer(); emit({ type: 'reset' }); } catch { /* keep what's on screen */ }
    })
    .finally(() => { pending -= 1; });
}

function replaceLead(saved) {
  const index = state.leads.findIndex((l) => l.id === saved.id);
  if (index === -1) state.leads.unshift(saved);
  else state.leads[index] = saved;
  emit({ type: 'sync', id: saved.id });
}

/* ---------- Reads ---------- */

export const getLeads = () => state.leads;
export const getLead = (id) => state.leads.find((l) => l.id === id);

/* ---------- Writes ---------- */

const activity = (type, text, at = new Date().toISOString()) => ({ id: uid('act'), type, text, at, by: session.user?.name || null });

export function createLead(data) {
  const now = new Date().toISOString();
  const lead = {
    id: uid('lead'),
    name: '',
    title: '',
    company: '',
    email: '',
    phone: '',
    source: '',
    owner: '',
    stage: 'new',
    value: 0,
    notes: '',
    nextFollowUp: null,
    ...data,
    createdAt: now,
    updatedAt: now,
    stageChangedAt: now,
    closedAt: null,
    lastContactAt: null,
    activities: [activity('created', 'Lead created', now)],
  };
  lead.history = [{ stage: lead.stage, at: now }];
  if (!stageById[lead.stage].open) lead.closedAt = now;
  state.leads.unshift(lead);
  if (lead.owner && !OWNERS.includes(lead.owner)) OWNERS.push(lead.owner);
  emit({ type: 'create', id: lead.id });
  sync(() => api('POST', 'leads', { ...data, id: lead.id }));
  return lead;
}

export function updateLead(id, patch) {
  const lead = getLead(id);
  if (!lead) return null;
  const { stage, ...rest } = patch;
  Object.assign(lead, rest, { updatedAt: new Date().toISOString() });
  if (stage && stage !== lead.stage) applyStage(lead, stage);
  if (lead.owner && !OWNERS.includes(lead.owner)) OWNERS.push(lead.owner);
  emit({ type: 'update', id });
  sync(() => api('PATCH', `leads/${id}`, patch));
  return lead;
}

export function moveLead(id, stage) {
  const lead = getLead(id);
  if (!lead || lead.stage === stage) return lead;
  applyStage(lead, stage);
  lead.updatedAt = new Date().toISOString();
  emit({ type: 'move', id });
  sync(() => api('PATCH', `leads/${id}`, { stage }));
  return lead;
}

function applyStage(lead, stage) {
  const now = new Date().toISOString();
  const from = stageById[lead.stage].label;
  lead.stage = stage;
  lead.stageChangedAt = now;
  lead.closedAt = stageById[stage].open ? null : now;
  lead.history = [...(lead.history || []), { stage, at: now }];
  lead.activities.unshift(activity('stage', `Moved from ${from} to ${stageById[stage].label}`, now));
}

export function addActivity(id, type, text) {
  const lead = getLead(id);
  if (!lead) return;
  const entry = activity(type, text);
  lead.activities.unshift(entry);
  if (type !== 'note') lead.lastContactAt = entry.at;
  lead.updatedAt = entry.at;
  emit({ type: 'activity', id });
  sync(() => api('POST', `leads/${id}/activities`, { id: entry.id, type, text }));
}

export function deleteLead(id) {
  const index = state.leads.findIndex((l) => l.id === id);
  if (index === -1) return null;
  const [removed] = state.leads.splice(index, 1);
  emit({ type: 'delete', id });
  sync(() => api('DELETE', `leads/${id}`));
  return { lead: removed, index };
}

/** Put a deleted lead back where it was (powers "Undo"). */
export function restoreLead({ lead, index }) {
  state.leads.splice(Math.min(index, state.leads.length), 0, lead);
  emit({ type: 'create', id: lead.id });
  sync(() => api('POST', `leads/${lead.id}/restore`));
}

/** Replace every lead with the demo set. Owner only on the server. */
export async function resetDemoData() {
  const leads = generateSeedData();
  if (mode === 'api') {
    await queue;
    const data = await api('POST', 'leads/replace', { leads });
    state.leads = data.leads;
  } else {
    state.leads = leads;
  }
  refreshOwners();
  emit({ type: 'reset' });
}

export async function clearAllData() {
  if (mode === 'api') {
    await queue;
    await api('POST', 'leads/clear');
  }
  state.leads = [];
  refreshOwners();
  emit({ type: 'reset' });
}

/* ---------- Local mode storage ---------- */

function loadLocal() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed.leads)) return parsed;
    }
  } catch {
    // Storage unavailable or corrupted: fall through to fresh demo data.
  }
  return { leads: generateSeedData() };
}

function persistLocal() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Private mode or quota exceeded: keep working in memory.
  }
}
