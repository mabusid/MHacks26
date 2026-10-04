// Phase 8 research agent: Grok drives the ResearchSession through tools (Plan.md → Research pipeline).
// The model chooses, connects, and explains; numbers only ever come from fetch results. On any failure
// the caller falls back to scripted research.

import type { ParamField, Twist } from '@overburden/shared';
import { config } from '../config';
import { ungroundedNumbers } from './grounding';
import { ResearchError, type ResearchSession } from './session';

const API = 'https://api.x.ai/v1/chat/completions';
// camelCase field names only ("insolation" is a normal English word, so it isn't listed).
const FIELD_NAME = /\b(nightHours|meanTempK|surfacePressureBar|co2Atmosphere|waterIce|polarIce|radiationDoseMSvPerDay|dustStorms)\b/;
const ESTIMABLE = ['nightHours', 'surfacePressureBar', 'radiationDoseMSvPerDay', 'co2Atmosphere', 'waterIce', 'polarIce', 'dustStorms'];
const MAX_TURNS = 14;
/** Exoplanets offered per run (random sample) so rooms don't all get the famous ones. */
const CANDIDATE_SAMPLE = 12;
/** One rewrite after the first fact check; after that, flagged lines are replaced with templates. */
const MAX_FACT_CHECKS = 2;

const SYSTEM = `You are the research officer for Overburden, a co-op learning game where four players build a base on a REAL planet.
Prepare one planet for the next round using ONLY the tools.

Rules:
- Never write a number from memory. Every value enters through set_parameters (copied from a fetch) or mark_estimated (unknown).
- Pick an interesting destination from list_candidates, avoiding anything in "already_played". Mix solar-system bodies and exoplanets.
- Steps, in order (each step needs the previous step's result):
  1. list_candidates, then fetch ONE planet (fetch_solar_system_body or fetch_exoplanet).
  2. set_parameters with that fetch_id (copies everything the fetch measured).
  3. mark_estimated for every field listed in "not_measured" (skip if empty), each with a short honest note such as "Rotation not measured".
  4. choose_twist from the "allowed_twists" returned once nothing is missing, with a one-line justification citing the data.
  5. write_card, then commit.
- write_card — plain English for teenagers, short and vivid:
  - headline: ONE striking real fact about this planet, with a number (not a title).
  - because: for each requirement, the REAL FACT that causes it (not the requirement restated), ≤ 14 words, citing a field from that requirement's cite_one_of.
  - fun_facts: exactly 3, ≤ 20 words each; the first welcomes the crew by planet name. Say who measured something when the source names it.
  - Use only facts and numbers from the fetched values, notes, and sources. No outside knowledge, no comparisons to everyday things (no "X times a chest X-ray"), never write field names like "meanTempK".
  Example (Moon): headline "A single lunar night lasts about 15 Earth days."; because.power "A lunar night lasts ~15 Earth days, so solar alone can’t carry you." (nightHours); because.life_support "Water ice sits in permanently shadowed craters (LCROSS, 2010)." (waterIce); fun fact "With no air to stop it, radiation reaches 1.4 millisieverts a day (Chang’e 4).".
- Then call commit. If a tool returns an error, fix the problem and retry.
- Be fast: batch work into as few tool calls as possible; parallel tool calls are fine.`;

const tools = [
  fn('list_candidates', 'Destinations you can research, plus planets this room already played.', {}),
  fn('fetch_solar_system_body', 'Curated NASA/mission data for a solar-system body.', { key: { type: 'string' } }, ['key']),
  fn('fetch_exoplanet', 'Live NASA Exoplanet Archive data for one exoplanet (exact name from list_candidates).', { name: { type: 'string' } }, ['name']),
  fn('set_parameters', 'Copy every measured value from a fetch into the round.', { fetch_id: { type: 'string' } }, ['fetch_id']),
  fn(
    'mark_estimated',
    'Mark the fetch’s "not_measured" fields as unknown (applies a fixed default) with a short note each.',
    {
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: { field: { type: 'string', enum: ESTIMABLE }, note: { type: 'string' } },
          required: ['field', 'note'],
        },
      },
    },
    ['items']
  ),
  fn('choose_twist', 'Pick the mission twist from allowed_twists.', { kind: { type: 'string', enum: ['radiation', 'thermal', 'dust'] }, justification: { type: 'string' } }, ['kind', 'justification']),
  fn(
    'write_card',
    'Write the Mission Requirements Card text.',
    {
      headline: { type: 'string' },
      because: {
        type: 'object',
        properties: Object.fromEntries(
          ['power', 'life_support', 'twist'].map(k => [k, { type: 'object', properties: { text: { type: 'string' }, field: { type: 'string' } }, required: ['text', 'field'] }])
        ),
        required: ['power', 'life_support', 'twist'],
      },
      fun_facts: { type: 'array', items: { type: 'string' }, minItems: 3, maxItems: 3 },
    },
    ['headline', 'because', 'fun_facts']
  ),
  fn('commit', 'Commit the researched planet as the next round.', {}),
];

function fn(name: string, description: string, properties: object, required: string[] = []) {
  return { type: 'function', function: { name, description, parameters: { type: 'object', properties, required } } };
}

type Message = { role: string; content: string | null; tool_calls?: ToolCall[]; tool_call_id?: string };
type ToolCall = { id: string; type: 'function'; function: { name: string; arguments: string } };

export async function runAgent(s: ResearchSession, alreadyPlayed: string[], signal: AbortSignal): Promise<string> {
  if (!config.xaiApiKey) throw new Error('No XAI_API_KEY');
  const model = process.env.XAI_RESEARCH_MODEL ?? 'grok-4.20-0309-non-reasoning';
  let extraNumbers: number[] = [];
  const fetched = new Map<string, ParamField[]>();
  let lastFetch: FetchSummary | undefined;
  let checks = 0;
  let committed = false;

  // Tool arguments are model-written JSON; each handler validates through the session.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handlers: Record<string, (a: any) => Promise<unknown> | unknown> = {
    list_candidates: async () => {
      const all = await s.listCandidates();
      const exoplanets = [...all.exoplanets].sort(() => Math.random() - 0.5).slice(0, CANDIDATE_SAMPLE);
      return { ...all, exoplanets, already_played: alreadyPlayed };
    },
    fetch_solar_system_body: async ({ key }) => {
      const f = s.fetchSolarSystemBody(key);
      await s.log(`Reading mission data: ${f.name}`);
      fetched.set(f.fetchId, f.values.map(v => v.field));
      lastFetch = summarize(f);
      return lastFetch;
    },
    fetch_exoplanet: async ({ name }) => {
      await s.log(`Querying NASA Exoplanet Archive: ${name}`);
      const f = await s.fetchExoplanet(name);
      // Orbit and the star's spectral type (e.g. "M5.5 V") are fetched data too.
      extraNumbers = [...(f.orbitDays ? [f.orbitDays] : []), ...(f.star?.match(/\d+(?:\.\d+)?/g) ?? []).map(Number)];
      fetched.set(f.fetchId, f.values.map(v => v.field));
      lastFetch = { ...summarize(f), orbit_days: f.orbitDays, star: f.star };
      return lastFetch;
    },
    set_parameters: async ({ fetch_id }: { fetch_id: string }) => {
      const fields = fetched.get(fetch_id);
      if (!fields) throw new ResearchError(`Unknown fetch_id "${fetch_id}"`);
      for (const field of fields) s.setParameter(fetch_id, field);
      await s.log(`Recorded ${fields.length} sourced values`);
      return status();
    },
    mark_estimated: async ({ items }: { items: { field: ParamField; note: string }[] }) => {
      for (const it of items) s.markEstimated(it.field, it.note);
      if (items.length) await s.log(`Not yet measured: ${items.map(i => i.field).join(', ')}`);
      return status();
    },
    choose_twist: async ({ kind, justification }: { kind: Twist; justification: string }) => {
      s.chooseTwist(kind);
      await s.log(`Mission twist: ${kind} — ${justification}`.slice(0, 200));
      return { ok: true, requirements: s.requirementsPreview() };
    },
    write_card: async ({ headline, because, fun_facts }) => {
      const parts: [string, string][] = [
        ['headline', headline],
        ...fun_facts.map((f: string, i: number): [string, string] => [`fun_facts[${i}]`, f]),
        ...Object.entries(because).map(([k, b]: [string, any]): [string, string] => [`because.${k}`, b.text]),
      ];
      // Cause-and-effect the fact check can miss: sunlight drives SOLAR power; temperature drives HEATING/COOLING.
      const wrongCause = Object.entries(because as Record<string, { text: string; field: string }>).filter(
        ([, b]) => (b.field === 'insolation' && /\b(heat|heating|warm|cool|cooling)\b/i.test(b.text)) || (b.field === 'meanTempK' && /\bsun(light)?\b/i.test(b.text))
      );
      if (wrongCause.length) {
        throw new ResearchError(
          `Wrong cause-and-effect in because.${wrongCause.map(([k]) => k).join(', because.')}: sunlight drives solar power (not heating); temperature drives heating or cooling (not sunlight).`
        );
      }
      const leaked = parts.flatMap(([w, t]) => (t.match(FIELD_NAME) ? [`"${t.match(FIELD_NAME)![0]}" in ${w}`] : []));
      if (leaked.length) throw new ResearchError(`Replace internal field names with plain English: ${leaked.join(', ')}.`);
      const allowed = s.groundingNumbers(extraNumbers);
      const problems = parts.flatMap(([where, text]) => ungroundedNumbers(text, allowed).map(n => `${n} (in ${where})`));
      if (problems.length) throw new ResearchError(`Not in the fetched data: ${problems.join(', ')}. Use only fetched numbers, or drop them.`);
      // The scale line is pure formatting of fetched numbers, so the server writes it.
      const card = { headline, scaleText: scaleLine(lastFetch), because, funFacts: fun_facts };
      s.writeCard(card); // structural checks first
      checks++;
      const tc = performance.now();
      const flagged = await factCheck(parts, factLines(lastFetch), process.env.XAI_FACTCHECK_MODEL ?? model, signal);
      if (config.dev) console.log(`[agent] fact check ${checks}: ${flagged.length} flag(s) in ${Math.round(performance.now() - tc)} ms`);
      if (flagged.length && checks < MAX_FACT_CHECKS) {
        throw new ResearchError(
          `Fact check — rewrite or drop these unsupported claims, keep everything else: ${flagged.map(f => `[${f.where}] ${f.claim} — ${f.why}`).join(' | ')}`
        );
      }
      if (flagged.length) {
        // Out of rewrites: swap only the flagged parts for safe lines built from the fetched data.
        s.writeCard(repairCard(card, new Set(flagged.map(f => f.where)), lastFetch!, s.requirementsPreview()));
        await s.log(`Fact check: replaced ${flagged.length} unsupported line(s) with data-only text`);
      } else {
        await s.log('Card fact-checked against the mission data');
      }
      return { ok: true };
    },
    commit: async () => {
      await s.commit();
      committed = true;
      await s.log(`Destination locked: ${s.profile().name}`);
      return { ok: true };
    },
  };

  function status() {
    const missing = s.missingFields();
    return missing.length ? { ok: true, missing } : { ok: true, missing: [], allowed_twists: s.triggeredTwists() };
  }

  const messages: Message[] = [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: `Prepare the next planet. Already played in this room: ${alreadyPlayed.join(', ') || 'none'}.` },
  ];

  const t0 = performance.now();
  for (let turn = 0; turn < MAX_TURNS && !committed; turn++) {
    const res = await fetch(API, {
      method: 'POST',
      signal,
      headers: { Authorization: `Bearer ${config.xaiApiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model, messages, tools, temperature: 0.7 }),
    });
    if (!res.ok) throw new Error(`xAI HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const msg = (await res.json()).choices?.[0]?.message as Message | undefined;
    if (config.dev) console.log(`[agent] turn ${turn + 1}: ${msg?.tool_calls?.length ?? 0} tool call(s) after ${Math.round(performance.now() - t0)} ms`);
    if (!msg) throw new Error('xAI returned no message');
    messages.push({ role: 'assistant', content: msg.content ?? null, tool_calls: msg.tool_calls });
    if (!msg.tool_calls?.length) {
      messages.push({ role: 'user', content: 'Continue using the tools until commit succeeds.' });
      continue;
    }
    for (const call of msg.tool_calls) {
      let result: unknown;
      try {
        const handler = handlers[call.function.name];
        if (!handler) throw new ResearchError(`Unknown tool ${call.function.name}`);
        result = await handler(JSON.parse(call.function.arguments || '{}'));
      } catch (e) {
        result = { error: e instanceof Error ? e.message : String(e) };
      }
      if (config.dev) {
        const err = (result as { error?: string })?.error;
        console.log(`[agent] ${call.function.name}(${call.function.arguments.slice(0, 160)})${err ? ` → ERROR ${err}` : ''}`);
      }
      messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) });
    }
  }
  if (!committed) throw new Error(`Agent didn't commit within ${MAX_TURNS} turns`);
  return s.profile().name;
}

type FetchSummary = ReturnType<typeof summarize> & { orbit_days?: number | null; star?: string | null };

/** "40.5 light-years away · 0.92× Earth’s width · 0.65× Earth’s sunlight" — built from fetched numbers only. */
function scaleLine(f: FetchSummary | undefined): string {
  if (!f) throw new ResearchError('Fetch a planet first');
  const sun = f.fields.insolation?.value;
  const round = (x: number) => (x >= 10 ? Math.round(x) : x >= 1 ? Math.round(x * 10) / 10 : Math.round(x * 100) / 100);
  const where = /from the|from Earth/.test(f.distance) ? f.distance : `${f.distance} away`;
  return [where, `${round(f.radius_earths)}× Earth’s width`, typeof sun === 'number' ? `${round(sun)}× Earth’s sunlight` : '']
    .filter(Boolean)
    .join(' · ');
}

/** The fetched data as plain-English lines, so the fact checker can match claims against it. */
function factLines(f: FetchSummary | undefined): string {
  if (!f) return '';
  const lines = [`Planet: ${f.planet}`, `Distance from Earth: ${f.distance}`, `Width: ${f.radius_earths}× Earth’s`];
  if (f.orbit_days) lines.push(`Orbit (one year): ${f.orbit_days} Earth days`);
  if (f.star) lines.push(`Star spectral type: ${f.star}`);
  for (const [, v] of Object.entries(f.fields)) {
    const extra = [v.source && `source: ${v.source}`, v.note && `note: ${v.note}`].filter(Boolean).join('; ');
    lines.push(`${v.label}: ${String(v.value)}${v.unit ? ` ${v.unit}` : ''}${extra ? ` (${extra})` : ''}`);
  }
  return lines.join('\n');
}

/** Fetch result for the model: parameters under one clear key, so they aren't confused with metadata. */
function summarize(f: { fetchId: string; name: string; scale: { distance: { value: number; unit: string }; radiusEarths: number }; values: { field: string; value: unknown; unit: string; status: string; sourceLabel: string; note: string }[] }) {
  return {
    fetch_id: f.fetchId,
    planet: f.name,
    distance: formatDistance(f.scale.distance),
    radius_earths: Math.round(f.scale.radiusEarths * 100) / 100,
    fields: Object.fromEntries(
      f.values.map(v => [v.field, { label: LABELS[v.field] ?? v.field, value: v.value, unit: v.unit, status: v.status, source: v.sourceLabel, note: v.note }])
    ),
    not_measured: missingAfter(f.values.map(v => v.field)),
  };
}

const LABELS: Record<string, string> = {
  insolation: 'Sunlight (× Earth)',
  nightHours: 'Length of one night',
  meanTempK: 'Average temperature',
  surfacePressureBar: 'Surface air pressure',
  co2Atmosphere: 'Air is mostly CO₂',
  waterIce: 'Water ice present',
  polarIce: 'Ice in permanently shadowed craters',
  radiationDoseMSvPerDay: 'Surface radiation dose',
  dustStorms: 'Global dust storms',
  gravity: 'Surface gravity',
};

function formatDistance(d: { value: number; unit: string; label?: string }): string {
  if (d.label) return d.label;
  if (d.unit === 'ly') return `${d.value} light-years`;
  return d.value >= 1e6 ? `${Math.round(d.value / 1e6)} million km` : `${d.value.toLocaleString('en-US')} km`;
}

function missingAfter(fetched: string[]): string[] {
  return ['insolation', 'nightHours', 'meanTempK', 'surfacePressureBar', 'co2Atmosphere', 'waterIce', 'polarIce', 'radiationDoseMSvPerDay', 'dustStorms', 'gravity'].filter(
    f => !fetched.includes(f)
  );
}

const FACT_CHECK = `You fact-check short game text against PLANET DATA. Flag a claim only if it is FALSE or cannot be inferred from the data — for example outside physics/chemistry explanations ("cold enough to freeze CO₂"), comparisons to everyday things, or durations, sizes, and events the data never mentions.
Also flag: size words that contradict the width ("super-Earth" needs width > 1.25× Earth's, "Earth-sized" ≈ 0.8–1.25×); wrong cause-and-effect for the base (sunlight drives SOLAR POWER; temperature drives HEATING/COOLING; night length drives BATTERY storage).
Always accept: welcoming the crew; naming the planet; restating any data value with rounding or unit conversion (K→°C, hours→days, ×Earth→%); "no water detected"/"atmosphere unknown" when the data marks them unknown or false; naming a source, mission, or author that appears in the data; consequences for the game base (e.g. "so you need storage", "supplies must be shipped").
Each TEXT line starts with its location (e.g. "fun_facts[1]:"). Reply with JSON only: {"unsupported": [{"where": "<location>", "claim": "<quoted claim>", "why": "<short reason>"}]} or {"unsupported": []}.`;

/** Second, strict model pass: claims the fetched data doesn't support. Fails open only on API errors. */
type Flag = { where: string; claim: string; why: string };

async function factCheck(parts: [string, string][], data: string, model: string, signal: AbortSignal): Promise<Flag[]> {
  const res = await fetch(API, {
    method: 'POST',
    signal,
    headers: { Authorization: `Bearer ${config.xaiApiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: FACT_CHECK },
        { role: 'user', content: `PLANET DATA:\n${data}\n\nTEXT:\n${parts.map(([w, t]) => `${w}: ${t}`).join('\n')}` },
      ],
    }),
  });
  if (!res.ok) throw new Error(`fact check HTTP ${res.status}`);
  const content = (await res.json()).choices?.[0]?.message?.content ?? '{}';
  const parsed = JSON.parse(content) as { unsupported?: unknown };
  if (!Array.isArray(parsed.unsupported)) return [];
  const known = new Set(parts.map(([w]) => w));
  return parsed.unsupported.map((u): Flag => {
    const o = (typeof u === 'object' && u ? u : { claim: String(u) }) as Partial<Flag>;
    // An unlocatable flag is treated as the headline so it still gets repaired.
    return { where: o.where && known.has(o.where) ? o.where : 'headline', claim: String(o.claim ?? ''), why: String(o.why ?? '') };
  });
}

type CardIn = { headline: string; scaleText: string; because: Record<'power' | 'life_support' | 'twist', { text: string; field: ParamField }>; funFacts: [string, string, string] };

/** Replaces flagged parts with lines that only restate fetched values (always pass the provenance checks). */
function repairCard(card: CardIn, flagged: Set<string>, f: FetchSummary, reqs: { kind: string; cite_one_of: string[] }[]): CardIn {
  const v = (k: string) => f.fields[k as keyof typeof f.fields] as { value: unknown; source: string; status: string } | undefined;
  const sun = v('insolation')?.value as number | undefined;
  const pct = sun === undefined ? undefined : sun < 0.1 ? (sun * 100).toFixed(1) : String(Math.round(sun * 100));
  const temp = v('meanTempK')?.value as number | undefined;
  const ice = v('waterIce');

  const safeBecause = (kind: string): { text: string; field: ParamField } => {
    const allowed = reqs.find(r => r.kind === kind)?.cite_one_of ?? [];
    if (kind === 'power' && allowed.includes('insolation') && pct) return { text: `It gets ${pct}% of Earth’s sunlight.`, field: 'insolation' };
    if (kind === 'life_support' && allowed.includes('waterIce')) {
      return ice?.value === true ? { text: `Water ice has been found here (${ice.source}).`, field: 'waterIce' } : { text: 'No water has been detected, so supplies must be shipped.', field: 'waterIce' };
    }
    if (allowed.includes('meanTempK') && temp !== undefined) return { text: `It averages about ${Math.round(temp)} K (${Math.round(temp - 273.15)} °C).`, field: 'meanTempK' };
    if (allowed.includes('dustStorms')) return { text: `Global dust storms have been recorded (${v('dustStorms')?.source}).`, field: 'dustStorms' };
    const p = v('surfacePressureBar');
    return { text: p?.status === 'estimated' ? 'Its atmosphere hasn’t been measured, so plan for radiation.' : 'It has almost no atmosphere to block radiation.', field: allowed[0] as ParamField };
  };

  const measured = Object.entries(f.fields).find(([, x]) => x.status === 'sourced' && /et al\./.test(x.source));
  const safeFacts = [
    `Welcome to ${f.planet}, ${f.distance} away.`,
    pct ? `It gets ${pct}% of the sunlight Earth does.` : `It is ${f.radius_earths}× as wide as Earth.`,
    measured ? `Its ${measured[1].label.toLowerCase()} comes from ${measured[1].source}.` : `It is ${f.radius_earths}× as wide as Earth.`,
  ];
  return {
    headline: flagged.has('headline') ? (pct ? `${f.planet} gets ${pct}% of Earth’s sunlight, ${f.distance} away.` : `${f.planet} is ${f.distance} away.`) : card.headline,
    scaleText: card.scaleText,
    because: {
      power: flagged.has('because.power') ? safeBecause('power') : card.because.power,
      life_support: flagged.has('because.life_support') ? safeBecause('life_support') : card.because.life_support,
      twist: flagged.has('because.twist') ? safeBecause('twist') : card.because.twist,
    },
    funFacts: card.funFacts.map((t, i) => (flagged.has(`fun_facts[${i}]`) ? safeFacts[i] : t)) as [string, string, string],
  };
}
