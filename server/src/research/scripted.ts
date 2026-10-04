// Scripted research (Phase 7): a fixed tool sequence per target, no LLM. Phase 8's agent calls the same
// session methods; this stays as its fallback. Log lines are paced so the lobby can watch the research.

import { PARAM_FIELDS, type ParamField, type Twist } from '@overburden/shared';
import { ResearchSession } from './session';
import { curatedCard, solarSystemKeys } from './sources';

/** A curated solar-system key (see data/solar_system.json) or a live exoplanet. */
export type ScriptedTarget = string;
export const SCRIPTED_TARGETS: ScriptedTarget[] = [...solarSystemKeys(), 'exoplanet'];

const PACE_MS = process.env.RESEARCH_PACE_MS !== undefined ? Number(process.env.RESEARCH_PACE_MS) : 350;
const pause = (ms = PACE_MS) => new Promise(r => setTimeout(r, ms));

const fmtPct = (x: number) => (x < 0.1 ? `${(x * 100).toFixed(1)}%` : `${Math.round(x * 100)}%`);

async function curated(s: ResearchSession, key: string) {
  await s.log('Choosing a destination…');
  await pause();
  const f = s.fetchSolarSystemBody(key);
  await s.log(`Reading mission data: ${f.name}`);
  for (const field of PARAM_FIELDS) s.setParameter(f.fetchId, field);
  const get = (field: ParamField) => f.values.find(v => v.field === field)!;
  await pause();
  const sun = get('insolation');
  await s.log(`Sunlight ${fmtPct(sun.value as number)} of Earth’s (${sun.sourceLabel})`);
  await pause();
  const night = get('nightHours').value as number | null;
  if (night !== null) await s.log(`Nights last ${night > 48 ? `${(night / 24).toFixed(1)} Earth days` : `${night.toFixed(1)} hours`}`);
  await pause();
  const ice = get('waterIce');
  await s.log(ice.value ? `Water ice confirmed (${ice.sourceLabel})` : 'No water ice found');
  await pause();
  const { twist, ...card } = curatedCard(key);
  s.chooseTwist(twist as Twist);
  await s.log(`Mission twist: ${twist}`);
  s.writeCard(card);
  await s.commit();
  await s.log(`Destination locked: ${f.name}`);
}

async function randomExoplanet(s: ResearchSession, avoid: string[]) {
  await s.log('Querying NASA Exoplanet Archive for rocky worlds…');
  const { exoplanets } = await s.listCandidates();
  const pool = exoplanets.filter(e => !avoid.includes(e.name));
  const pick = (pool.length ? pool : exoplanets)[Math.floor(Math.random() * (pool.length || exoplanets.length))];
  await s.log(`${exoplanets.length} candidates. Selected: ${pick.name}, ${pick.distanceLy} light-years away`);

  const f = await s.fetchExoplanet(pick.name);
  for (const v of f.values) s.setParameter(f.fetchId, v.field);
  const val = (field: ParamField) => f.values.find(v => v.field === field)!;
  const insol = val('insolation').value as number;
  const eqt = val('meanTempK').value as number;
  await pause();
  await s.log(`Sunlight ${insol.toFixed(2)}× Earth’s (${val('insolation').sourceLabel})`);
  await pause();
  await s.log(`Equilibrium temperature ${Math.round(eqt)} K (${Math.round(eqt - 273.15)} °C)`);

  // What nobody has measured yet — said out loud, since that's part of the lesson.
  s.markEstimated('nightHours', 'Rotation not measured — planets this close to their star are often tidally locked');
  s.markEstimated('surfacePressureBar', 'Atmosphere not yet measured — very few rocky exoplanets have been checked');
  s.markEstimated('radiationDoseMSvPerDay', 'No surface measurements exist');
  s.markEstimated('co2Atmosphere', 'Atmosphere not yet measured');
  s.markEstimated('waterIce', 'No water detected');
  s.markEstimated('polarIce', 'No water detected');
  s.markEstimated('dustStorms', 'Weather unknown');
  await pause();
  await s.log('Unknown: rotation, atmosphere, water — planning for the worst');

  const twists = s.triggeredTwists();
  const twist: Twist = twists.includes('thermal') && Math.random() < 0.5 ? 'thermal' : twists[0];
  s.chooseTwist(twist);
  await s.log(`Mission twist: ${twist}`);

  const scale = f.scale;
  const width = scale.radiusEarths.toFixed(2);
  const star = f.star ? ` a ${f.star} star` : ' its star';
  s.writeCard({
    headline: `${f.name} gets ${fmtPct(insol)} of Earth’s sunlight, ${scale.distance.value} light-years away.`,
    scaleText: `${scale.distance.value} light-years away · ${width}× Earth’s width · ${insol.toFixed(2)}× Earth’s sunlight`,
    because: {
      power: { text: `It gets ${insol.toFixed(2)}× Earth’s sunlight; its nights have never been measured.`, field: 'insolation' },
      life_support: { text: 'No water or CO₂ has been detected, so supplies must be shipped.', field: 'waterIce' },
      twist:
        twist === 'thermal'
          ? { text: `Its equilibrium temperature is about ${Math.round(eqt)} K.`, field: 'meanTempK' }
          : { text: 'Its atmosphere has never been measured, so plan for radiation.', field: 'surfacePressureBar' },
    },
    funFacts: [
      `Welcome to ${f.name}, ${scale.distance.value} light-years from Earth.`,
      f.orbitDays ? `A year here lasts ${f.orbitDays < 2 ? f.orbitDays.toFixed(1) : Math.round(f.orbitDays)} Earth days as it circles${star}.` : `It circles${star}.`,
      'Nobody knows yet whether it has air — only a handful of rocky exoplanets have been checked.',
    ],
  });
  await s.commit();
  await s.log(`Destination locked: ${f.name}`);
  return f.name;
}

/** Runs one scripted research pass. Returns the planet name committed. */
export async function runScripted(s: ResearchSession, target: ScriptedTarget, avoid: string[] = []): Promise<string> {
  if (target === 'exoplanet') return randomExoplanet(s, avoid);
  await curated(s, target);
  return s.profile().name;
}
