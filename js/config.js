// Business configuration. Edit these lists to match your team and sales process.

export const STAGES = [
  { id: 'new', label: 'New', probability: 0.1, open: true },
  { id: 'contacted', label: 'Contacted', probability: 0.2, open: true },
  { id: 'qualified', label: 'Qualified', probability: 0.4, open: true },
  { id: 'proposal', label: 'Proposal sent', probability: 0.6, open: true },
  { id: 'negotiation', label: 'Negotiation', probability: 0.8, open: true },
  { id: 'won', label: 'Won', probability: 1, open: false },
  { id: 'lost', label: 'Lost', probability: 0, open: false },
];

export const OPEN_STAGES = STAGES.filter((s) => s.open);
export const stageById = Object.fromEntries(STAGES.map((s) => [s.id, s]));
export const stageIndex = (id) => STAGES.findIndex((s) => s.id === id);

export const SOURCES = ['Website', 'Referral', 'LinkedIn', 'Cold outreach', 'Event', 'Partner'];

export const OWNERS = ['Priya Shah', 'Marcus Bell', 'Elena Ortiz', 'Tom Okafor'];

export const ACTIVITY_TYPES = [
  { id: 'note', label: 'Note' },
  { id: 'call', label: 'Call' },
  { id: 'email', label: 'Email' },
  { id: 'meeting', label: 'Meeting' },
];

export const STORAGE_KEY = 'crm.data.v1';
