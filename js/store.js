// Data layer. Every read and write in the app goes through this module, so
// swapping localStorage for a real API later only means changing this file.

import { STORAGE_KEY, stageById } from './config.js';
import { generateSeedData } from './seed.js';
import { uid } from './utils.js';

const listeners = new Set();
let state = load();

function load() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed.leads)) return parsed;
    }
  } catch {
    // Storage unavailable or corrupted: fall through to fresh demo data.
  }
  return { leads: generateSeedData(), seededAt: new Date().toISOString() };
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Private mode or quota exceeded: the app keeps working in memory.
  }
}

function commit(change) {
  persist();
  listeners.forEach((fn) => fn(change));
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export const getLeads = () => state.leads;
export const getLead = (id) => state.leads.find((l) => l.id === id);

const activity = (type, text, at = new Date().toISOString()) => ({ id: uid('act'), type, text, at });

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
  commit({ type: 'create', id: lead.id });
  return lead;
}

export function updateLead(id, patch) {
  const lead = getLead(id);
  if (!lead) return null;
  const { stage, ...rest } = patch;
  Object.assign(lead, rest, { updatedAt: new Date().toISOString() });
  if (stage && stage !== lead.stage) applyStage(lead, stage);
  commit({ type: 'update', id });
  return lead;
}

export function moveLead(id, stage) {
  const lead = getLead(id);
  if (!lead || lead.stage === stage) return lead;
  applyStage(lead, stage);
  lead.updatedAt = new Date().toISOString();
  commit({ type: 'move', id });
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
  commit({ type: 'activity', id });
}

export function deleteLead(id) {
  const index = state.leads.findIndex((l) => l.id === id);
  if (index === -1) return null;
  const [removed] = state.leads.splice(index, 1);
  commit({ type: 'delete', id });
  return { lead: removed, index };
}

/** Put a deleted lead back where it was (powers "Undo"). */
export function restoreLead({ lead, index }) {
  state.leads.splice(Math.min(index, state.leads.length), 0, lead);
  commit({ type: 'create', id: lead.id });
}

export function resetDemoData() {
  state = { leads: generateSeedData(), seededAt: new Date().toISOString() };
  commit({ type: 'reset' });
}

export function clearAllData() {
  state = { leads: [], seededAt: null };
  commit({ type: 'reset' });
}
