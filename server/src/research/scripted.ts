// Deterministic research steps, no LLM: pick → fetch → record → mark unknowns (`prepare`), then a template
// card (`scriptedCard`). The agent reuses the prepared session and only writes the card, so a failed agent
// falls back to the template without fetching again. Log lines are paced so the lobby can watch the research.

import { PARAM_FIELDS, type ParamField, type Twist } from '@overburden/shared';
import type { Card, ResearchSession } from './session';
import { curatedCard, solarSystemKeys, type SourcedValue, type ScaleInfo } from './sources';

/** A curated solar-system key (see data/solar_system.json) or a live exoplanet. */
export type ScriptedTarget = string;
export const SCRIPTED_TARGETS: ScriptedTarget[] = [...solarSystemKeys(), 'exoplanet'];

const PACE_MS = process.env.RESEARCH_PACE_MS !== undefined ? Number(process.env.RESEARCH_PACE_MS) : 250;
const pause = (ms = PACE_MS) => new Promise(r => setTimeout(r, ms));
/** Exoplanets sampled per pick; the nearest wins, so famous neighbours come up more often than far, anonymous ones. */
const EXO_SAMPLE = 5;

const fmtPct = (x: number) => (x < 0.1 ? `${(x * 100).toFixed(1)}%` : `${Math.round(x * 100)}%`);

/** A planet whose parameters are all recorded; ready for a twist and a card. */
export interface Prepared {
  name: string;
  fetchId: string;
  kind: 'curated' | 'exoplanet';
  /** Curated key, for the hand-written card. */
  key?: string;
  values: SourcedValue[];
  scale: ScaleInfo;
  orbitDays?: number | null;
  star?: string | null;
}

async function prepareCurated(s: ResearchSession, key: string): Promise<Prepared> {
  await s.log('Exploring the solar system…');
  await pause();
  const f = s.fetchSolarSystemBody(key);
  await s.log(`Reading mission data: ${f.name}`);
  for (const field of PARAM_FIELDS) s.setParameter(f.fetchId, field);
  const get = (field: ParamField) => f.values.find(v => v.field === field)!;
  await pause();
  const sun = get('insolation');
  await s.log(`Sunlight ${fmtPct(sun.value as number)} of Earth’s (${sun.sourceLabel})`);
  const night = get('nightHours').value as number | null;
  if (night !== null) await s.log(`Nights last ${night > 48 ? `${(night / 24).toFixed(1)} Earth days` : `${night.toFixed(1)} hours`}`);
  const ice = get('waterIce');
  await s.log(ice.value ? `Water ice confirmed (${ice.sourceLabel})` : 'No water ice found');
  return { name: f.name, fetchId: f.fetchId, kind: 'curated', key, values: f.values, scale: f.scale };
}

async function prepareExoplanet(s: ResearchSession, avoid: string[]): Promise<Prepared> {
  await s.log('Exploring nearby star systems for rocky worlds…');
  await s.log('Querying NASA Exoplanet Archive…');
  const { exoplanets } = await s.listCandidates();
  const fresh = exoplanets.filter(e => !avoid.includes(e.name));
  const pool = fresh.length ? fresh : exoplanets;
  const sample = Array.from({ length: Math.min(EXO_SAMPLE, pool.length) }, () => pool[Math.floor(Math.random() * pool.length)]);
  const pick = sample.reduce((a, b) => (b.distanceLy < a.distanceLy ? b : a));
  await s.log(`${exoplanets.length} candidates. Selected: ${pick.name}, ${pick.distanceLy} light-years away`);

  const f = await s.fetchExoplanet(pick.name);
  for (const v of f.values) s.setParameter(f.fetchId, v.field);
  const val = (field: ParamField) => f.values.find(v => v.field === field)!;
  const insol = val('insolation').value as number;
  const eqt = val('meanTempK').value as number;
  await pause();
  await s.log(`Sunlight ${insol.toFixed(2)}× Earth’s (${val('insolation').sourceLabel})`);
  await s.log(`Equilibrium temperature ${Math.round(eqt)} K (${Math.round(eqt - 273.15)} °C)`);

  // What nobody has measured yet — said out loud, since that's part of the lesson.
  const locked = f.values.some(v => v.field === 'nightHours');
  if (!locked) s.markEstimated('nightHours', 'Rotation not measured, and its orbit is too wide to assume tidal locking');
  s.markEstimated('surfacePressureBar', 'Atmosphere not yet measured — very few rocky exoplanets have been checked');
  s.markEstimated('radiationDoseMSvPerDay', 'No surface measurements exist');
  s.markEstimated('co2Atmosphere', 'Atmosphere not yet measured');
  s.markEstimated('waterIce', 'No water detected');
  s.markEstimated('polarIce', 'No water detected');
  s.markEstimated('dustStorms', 'Weather unknown');
  if (locked) await s.log(`Orbit ${f.orbitDays?.toFixed(1)} days — likely tidally locked: no night on the star-facing side`);
  await s.log(`Unknown: ${locked ? '' : 'rotation, '}atmosphere, water — planning for the worst`);
  return { name: f.name, fetchId: f.fetchId, kind: 'exoplanet', values: f.values, scale: f.scale, orbitDays: f.orbitDays, star: f.star };
}

/**
 * "What the research officer is looking at" lines for the lobby log while the card is written. Pure
 * narration — no numbers or claims — tailored to what this planet's data covers.
 */
export function exploringLines(p: Prepared): string[] {
  const has = (field: ParamField) => p.values.some(v => v.field === field);
  const flag = (field: ParamField) => p.values.find(v => v.field === field)?.value === true;
  if (p.kind === 'exoplanet') {
    return [
      `Exploring the ${p.star ? `${p.star} star` : 'host star'}’s neighbourhood…`,
      'Estimating how much starlight reaches the surface…',
      has('nightHours') ? 'Checking whether one side always faces the star…' : 'Looking for clues about how fast it spins…',
      'Searching the data for any sign of an atmosphere…',
      'Sizing up the planet against Earth…',
      'Working out what the crew must ship from home…',
    ];
  }
  return [
    `Exploring ${p.name}’s surface for a landing site…`,
    flag('waterIce') ? 'Tracing where the water ice hides…' : 'Scanning for water ice…',
    'Following the sunlight across a full day and night…',
    flag('co2Atmosphere') ? 'Sampling the CO₂ air…' : 'Checking how thin the air is…',
    flag('dustStorms') ? 'Reviewing the dust storm record…' : 'Reading the radiation environment…',
    'Mapping temperature extremes…',
  ];
}

/** Streams `lines` to the log every `everyMs` until stopped (the slow step's progress, so the lobby never goes quiet). */
export function narrate(s: ResearchSession, lines: string[], everyMs = 1400): () => void {
  let i = 0;
  let busy = false;
  const timer = setInterval(() => {
    if (busy || i >= lines.length) return;
    busy = true;
    s.log(lines[i++]).catch(() => undefined).finally(() => (busy = false));
  }, everyMs);
  return () => clearInterval(timer);
}

/** Picks and records one planet. Fast (~1 s): one fetch, no model calls. */
export async function prepare(s: ResearchSession, target: ScriptedTarget, avoid: string[] = []): Promise<Prepared> {
  await s.log('Choosing a destination…');
  return target === 'exoplanet' ? prepareExoplanet(s, avoid) : prepareCurated(s, target);
}

/** Prefer a twist the room didn't just play (Plan.md → Twists). */
export function pickTwist(allowed: Twist[], lastTwist?: string): Twist {
  const fresh = allowed.filter(t => t !== lastTwist);
  const pool = fresh.length ? fresh : allowed;
  return pool[Math.floor(Math.random() * pool.length)];
}

/** The hand-written (curated) or templated (exoplanet) card. Chooses the twist on the session. */
export function scriptedCard(s: ResearchSession, p: Prepared, lastTwist?: string): Card {
  if (p.kind === 'curated') {
    // Hand-written because-lines belong to one twist, so curated bodies keep theirs.
    const { twist, ...card } = curatedCard(p.key!);
    s.chooseTwist(twist as Twist);
    return card;
  }
  const twist = pickTwist(s.triggeredTwists(), lastTwist);
  s.chooseTwist(twist);
  const val = (field: ParamField) => p.values.find(v => v.field === field);
  const insol = val('insolation')!.value as number;
  const eqt = val('meanTempK')!.value as number;
  const locked = !!val('nightHours');
  const dist = p.scale.distance.value;
  const star = p.star ? ` a ${p.star} star` : ' its star';
  return {
    headline: `${p.name} gets ${fmtPct(insol)} of Earth’s sunlight, ${dist} light-years away.`,
    scaleText: `${dist} light-years away · ${p.scale.radiusEarths.toFixed(2)}× Earth’s width · ${insol.toFixed(2)}× Earth’s sunlight`,
    because: {
      power: locked
        ? { text: 'It likely always faces its star, so the base never sees night.', field: 'nightHours' }
        : { text: `It gets ${insol.toFixed(2)}× Earth’s sunlight; its nights have never been measured.`, field: 'insolation' },
      life_support: { text: 'No water or CO₂ air has been detected there yet.', field: 'waterIce' },
      twist:
        twist === 'thermal'
          ? { text: `Its equilibrium temperature is about ${Math.round(eqt - 273.15)} °C, or ${Math.round(eqt)} K.`, field: 'meanTempK' }
          : { text: 'Its atmosphere has never been measured, so plan for radiation.', field: 'surfacePressureBar' },
    },
    funFacts: [
      `Welcome to ${p.name}, ${dist} light-years from Earth.`,
      p.orbitDays ? `A year here lasts ${p.orbitDays < 2 ? p.orbitDays.toFixed(1) : Math.round(p.orbitDays)} Earth days as it circles${star}.` : `It circles${star}.`,
      'Nobody knows yet whether it has air — only a handful of rocky exoplanets have been checked.',
    ],
  };
}

/** Writes the card, commits, and logs. */
export async function commitCard(s: ResearchSession, card: Card): Promise<string> {
  s.writeCard(card);
  await s.commit();
  await s.log(`Destination locked: ${s.profile().name}`);
  return s.profile().name;
}

/** Runs one scripted research pass. Returns the planet name committed. */
export async function runScripted(s: ResearchSession, target: ScriptedTarget, avoid: string[] = [], lastTwist?: string): Promise<string> {
  const p = await prepare(s, target, avoid);
  for (const line of exploringLines(p).slice(0, 2)) {
    await pause();
    await s.log(line);
  }
  const card = scriptedCard(s, p, lastTwist);
  await s.log(`Mission twist: ${s.chosenTwist}`);
  return commitCard(s, card);
}
