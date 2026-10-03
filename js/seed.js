// Demo data generator. Deterministic (seeded RNG) so every fresh install looks
// the same, but dates are relative to today so the data never goes stale.

import { STAGES, SOURCES, DEMO_OWNERS } from './config.js';
import { DAY } from './utils.js';

function mulberry32(seed) {
  return function rng() {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST = ['Amara', 'Ben', 'Chloe', 'Daniel', 'Esther', 'Felix', 'Grace', 'Hassan', 'Ines', 'Jonah', 'Keiko', 'Liam', 'Maya', 'Noah', 'Olivia', 'Pablo', 'Quinn', 'Rosa', 'Samir', 'Tara', 'Uma', 'Victor', 'Wen', 'Yara', 'Zoe', 'Aaron', 'Bianca', 'Caleb', 'Dana', 'Emeka'];
const LAST = ['Adeyemi', 'Brooks', 'Castillo', 'Dubois', 'Eriksen', 'Fischer', 'Gallagher', 'Hughes', 'Ibrahim', 'Jensen', 'Kowalski', 'Lindqvist', 'Moreau', 'Nakamura', 'Osei', 'Petrov', 'Rahman', 'Silva', 'Thompson', 'Varga', 'Walsh', 'Young', 'Zhang', 'Novak', 'Haddad'];
const TITLES = ['Operations Director', 'Head of Marketing', 'Founder', 'COO', 'Procurement Manager', 'IT Manager', 'VP Sales', 'Office Manager', 'Finance Director', 'General Manager', 'Head of People', 'Managing Partner'];
const COMPANIES = [
  ['Northfield Logistics', 'northfieldlogistics.com'], ['Brightwater Dental', 'brightwaterdental.com'], ['Harbor & Pine Architects', 'harborpine.com'],
  ['Kestrel Manufacturing', 'kestrelmfg.com'], ['Lumen Health Clinics', 'lumenhealth.co'], ['Oakline Property Group', 'oakline.com'],
  ['Redwood Legal LLP', 'redwoodlegal.com'], ['Summit Fitness Co.', 'summitfitness.co'], ['Tidewater Foods', 'tidewaterfoods.com'],
  ['Vantage Solar', 'vantagesolar.io'], ['Westbrook Academy', 'westbrook.edu'], ['Alder Creek Vineyards', 'aldercreek.wine'],
  ['Bluefin Marine Supply', 'bluefinmarine.com'], ['Cobalt Analytics', 'cobaltanalytics.io'], ['Driftwood Hotels', 'driftwoodhotels.com'],
  ['Ember Coffee Roasters', 'embercoffee.com'], ['Fairway Insurance', 'fairwayins.com'], ['Granite Peak Construction', 'granitepeak.build'],
  ['Hollis Veterinary', 'hollisvet.com'], ['Ironclad Security', 'ironcladsec.com'], ['Juniper Florals', 'juniperflorals.com'],
  ['Keystone Accounting', 'keystonecpa.com'], ['Lakeside Auto Group', 'lakesideauto.com'], ['Meridian Travel', 'meridiantravel.com'],
  ['Nimbus Software', 'nimbussoft.io'], ['Orchard Pediatrics', 'orchardpeds.com'], ['Prairie Wind Energy', 'prairiewind.energy'],
  ['Quarry Stoneworks', 'quarrystone.com'], ['Riverside Credit Union', 'riversidecu.org'], ['Saltmarsh Brewing', 'saltmarshbrew.com'],
  ['Thornbury Retail', 'thornbury.shop'], ['Upland Outfitters', 'uplandoutfitters.com'], ['Verity Consulting', 'verityconsult.com'],
  ['Willow Home Care', 'willowhomecare.com'], ['Yellowbrick Events', 'yellowbrick.events'], ['Zenith Print Studio', 'zenithprint.com'],
];

const CALL_NOTES = ['Discovery call — mapped current process and pain points', 'Follow-up call on pricing questions', 'Walked through implementation timeline', 'Checked in after the demo', 'Call with decision maker to confirm scope'];
const EMAIL_NOTES = ['Sent intro deck and case studies', 'Shared pricing breakdown', 'Sent proposal for review', 'Answered security questionnaire', 'Sent revised terms'];
const MEETING_NOTES = ['On-site demo with the operations team', 'Video demo with three stakeholders', 'Scoping workshop', 'Contract review meeting'];
const LEAD_NOTES = ['Budget approved for Q-end. Wants onboarding before the busy season.', 'Currently using spreadsheets; main pain is double data entry.', 'Referred by an existing client. Warm intro, responsive.', 'Price sensitive — compare against the competitor quote they shared.', 'Needs sign-off from the finance director before anything moves.', ''];
const LOST_REASONS = ['Lost — chose a competitor', 'Lost — budget cut this year', 'Lost — went quiet after proposal', 'Lost — timing not right, revisit next year'];

export function generateSeedData(count = 84) {
  const rng = mulberry32(20261003);
  const pick = (arr) => arr[Math.floor(rng() * arr.length)];
  const between = (a, b) => a + rng() * (b - a);
  const now = Date.now();
  const iso = (t) => new Date(Math.min(t, now)).toISOString();

  const leads = [];
  for (let i = 0; i < count; i++) {
    // Skew creation dates toward recent months so volume visibly grows.
    const age = Math.round(390 * Math.pow(rng(), 1.25)) + 1;
    const createdAt = now - age * DAY - between(0, 8) * 3600000;

    const [company, domain] = pick(COMPANIES);
    const first = pick(FIRST);
    const last = pick(LAST);

    // Decide how far this lead got through the pipeline.
    let path;
    let closed = false;
    if (age > 18 && rng() < Math.min(0.8, age / 70)) {
      closed = true;
      if (rng() < 0.42) {
        path = ['new', 'contacted', 'qualified', 'proposal', 'negotiation', 'won'];
        if (rng() < 0.3) path.splice(4, 1); // some skip negotiation
      } else {
        const reached = 1 + Math.floor(rng() * 4);
        path = [...STAGES.slice(0, reached + 1).map((s) => s.id), 'lost'];
      }
    } else {
      const maxIdx = Math.min(4, Math.floor(rng() * (1.6 + age / 14)));
      path = STAGES.slice(0, maxIdx + 1).map((s) => s.id);
    }

    // Spread stage changes between creation and the close (or now).
    const lifespan = closed ? Math.min(age - 1, between(12, 75)) : between(age * 0.5, age * 0.95);
    const endAt = createdAt + lifespan * DAY;
    const stepTimes = path.map((_, idx) => (idx === 0 ? createdAt : createdAt + ((endAt - createdAt) * idx) / (path.length - 1) - between(0, 1.5) * DAY));

    const activities = [{ id: `act_seed_${i}_0`, type: 'created', text: 'Lead created', at: iso(createdAt) }];
    let lastContactAt = null;
    for (let s = 1; s < path.length; s++) {
      // A touchpoint shortly before most stage changes.
      const touchAt = stepTimes[s] - between(0.3, 2) * DAY;
      if (touchAt > createdAt) {
        const kind = path[s] === 'proposal' ? 'email' : path[s] === 'qualified' || path[s] === 'negotiation' ? 'meeting' : rng() < 0.55 ? 'call' : 'email';
        const text = kind === 'call' ? pick(CALL_NOTES) : kind === 'email' ? pick(EMAIL_NOTES) : pick(MEETING_NOTES);
        activities.push({ id: `act_seed_${i}_${s}t`, type: kind, text, at: iso(touchAt) });
        lastContactAt = iso(touchAt);
      }
      const label = (id) => STAGES.find((st) => st.id === id).label;
      const text = path[s] === 'lost' ? pick(LOST_REASONS) : `Moved from ${label(path[s - 1])} to ${label(path[s])}`;
      activities.push({ id: `act_seed_${i}_${s}`, type: 'stage', text, at: iso(stepTimes[s]) });
    }
    activities.sort((a, b) => b.at.localeCompare(a.at));

    const stage = path[path.length - 1];
    const value = Math.round(Math.exp(between(Math.log(2500), Math.log(68000))) / 500) * 500;
    const stageChangedAt = iso(stepTimes[stepTimes.length - 1]);
    const nextFollowUp = closed ? null : new Date(now + between(-6, 14) * DAY).toISOString();

    leads.push({
      id: `lead_seed_${i}`,
      name: `${first} ${last}`,
      title: pick(TITLES),
      company,
      email: `${first.toLowerCase()}.${last.toLowerCase()}@${domain}`,
      phone: `(${200 + Math.floor(rng() * 700)}) ${100 + Math.floor(rng() * 900)}-${String(Math.floor(rng() * 10000)).padStart(4, '0')}`,
      source: pick(SOURCES),
      owner: pick(DEMO_OWNERS),
      stage,
      value,
      notes: pick(LEAD_NOTES),
      nextFollowUp: nextFollowUp && nextFollowUp.slice(0, 10),
      createdAt: iso(createdAt),
      updatedAt: activities[0].at,
      stageChangedAt,
      closedAt: closed ? stageChangedAt : null,
      lastContactAt,
      history: path.map((st, idx) => ({ stage: st, at: iso(stepTimes[idx]) })),
      activities,
    });
  }

  return leads.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
