// Research agent: the server has already picked, fetched, and recorded the planet (scripted.ts → prepare),
// so the model does only what needs judgment — choose the twist and write the card — in one tool call.
// Numbers still only come from fetches: the card is checked for grounding and fact-checked before it's used.
// On any failure the caller uses the scripted card on the same prepared session (no second fetch).

import type { ParamField, Twist } from '@overburden/shared';
import { config } from '../config';
import { ungroundedNumbers } from './grounding';
import type { Prepared } from './scripted';
import { ResearchError, type Card, type ResearchSession } from './session';

const API = 'https://api.x.ai/v1/chat/completions';
// camelCase field names only ("insolation" is a normal English word, so it isn't listed).
const FIELD_NAME = /\b(nightHours|meanTempK|surfacePressureBar|co2Atmosphere|waterIce|polarIce|radiationDoseMSvPerDay|dustStorms)\b/;
/** Write → (fix validation errors) → fact check → one rewrite. Usually 2 calls. */
const MAX_TURNS = 4;
/** One rewrite after the first fact check; after that, flagged lines are replaced with templates. */
const MAX_FACT_CHECKS = 2;

const SYSTEM = `You are the research officer for Overburden, a co-op learning game where four players build a base on a REAL planet in 2 minutes.
The planet is already chosen and its data fetched. Call write_mission ONCE with the twist and the card text.

- twist: one of allowed_twists. Prefer one different from last_twist. Pick the one whose fact is most surprising or teaches the most.
- headline: ONE striking real fact about this planet, with a number (not a title). This is the moment players learn something — make it memorable.
- because: for each requirement of the chosen twist, the REAL FACT that causes it (not the requirement restated), ≤ 14 words, citing one field from that requirement's cite_one_of.
- fun_facts: exactly 3, ≤ 20 words each; the first welcomes the crew by planet name; the third ties to a requirement. Say who measured something when the source names it.
- Mission Control reads fun facts and because-lines ALOUD: write them as natural spoken sentences. No parentheses, brackets, or symbols like ~ or ×; credit a source in words ("LCROSS found…", "measured by Chang’e 4").
- Plain English for teenagers, short and vivid. Use ONLY the data given: no outside knowledge, no numbers from memory, no comparisons to everyday things, never write field names like "meanTempK".
- Cause and effect: sunlight drives SOLAR power; night length drives BATTERY storage; temperature drives HEATING/COOLING.
- The card states the planet's CONDITIONS; players work out the build. Never tell them which pieces or how many to use ("so ship water" / "build 6 batteries" spoil it) — give the fact that makes them think ("No water has been detected anywhere on it.").
Example (Moon): headline "A single lunar night lasts about 15 Earth days."; because.power "A lunar night lasts about 15 Earth days, with no sunlight at all." (nightHours); because.life_support "LCROSS found water ice in permanently shadowed craters." (waterIce).
If the tool returns an error, fix exactly what it names and call write_mission again.`;

const becauseSchema = { type: 'object', properties: { text: { type: 'string' }, field: { type: 'string' } }, required: ['text', 'field'] };

function writeMissionTool(allowed: Twist[]) {
  return {
    type: 'function',
    function: {
      name: 'write_mission',
      description: 'Choose the twist and write the Mission Requirements Card.',
      parameters: {
        type: 'object',
        properties: {
          twist: { type: 'string', enum: allowed },
          headline: { type: 'string' },
          because: {
            type: 'object',
            properties: { power: becauseSchema, life_support: becauseSchema, twist: becauseSchema },
            required: ['power', 'life_support', 'twist'],
          },
          fun_facts: { type: 'array', items: { type: 'string' }, minItems: 3, maxItems: 3 },
        },
        required: ['twist', 'headline', 'because', 'fun_facts'],
      },
    },
  };
}

type Message = { role: string; content: string | null; tool_calls?: ToolCall[]; tool_call_id?: string };
type ToolCall = { id: string; type: 'function'; function: { name: string; arguments: string } };
type MissionArgs = { twist: Twist; headline: string; because: Card['because']; fun_facts: [string, string, string] };

/** Chooses the twist on `s` and returns a grounded, fact-checked card for the prepared planet. */
export async function agentCard(s: ResearchSession, p: Prepared, lastTwist: string | undefined, signal: AbortSignal): Promise<Card> {
  if (!config.xaiApiKey) throw new Error('No XAI_API_KEY');
  const model = process.env.XAI_RESEARCH_MODEL ?? 'grok-4.20-0309-non-reasoning';
  const fetch_ = summarize(p);
  const extraNumbers = [...(p.orbitDays ? [p.orbitDays] : []), ...(p.star?.match(/\d+(?:\.\d+)?/g) ?? []).map(Number)];
  const allowed = s.triggeredTwists();
  const unknown = s.estimatedNotes();
  let checks = 0;

  async function handle(args: MissionArgs): Promise<Card> {
    const { twist, headline, because, fun_facts } = args;
    s.chooseTwist(twist);
    const parts: [string, string][] = [
      ['headline', headline],
      ...fun_facts.map((f, i): [string, string] => [`fun_facts[${i}]`, f]),
      ...Object.entries(because).map(([k, b]): [string, string] => [`because.${k}`, b.text]),
    ];
    // Cause-and-effect the fact check can miss: sunlight drives SOLAR power; temperature drives HEATING/COOLING.
    const wrongCause = Object.entries(because).filter(
      ([, b]) => (b.field === 'insolation' && /\b(heat|heating|warm|cool|cooling)\b/i.test(b.text)) || (b.field === 'meanTempK' && /\bsun(light)?\b/i.test(b.text))
    );
    if (wrongCause.length) {
      throw new ResearchError(
        `Wrong cause-and-effect in because.${wrongCause.map(([k]) => k).join(', because.')}: sunlight drives solar power (not heating); temperature drives heating or cooling (not sunlight).`
      );
    }
    const leaked = parts.flatMap(([w, t]) => (t.match(FIELD_NAME) ? [`"${t.match(FIELD_NAME)![0]}" in ${w}`] : []));
    if (leaked.length) throw new ResearchError(`Replace internal field names with plain English: ${leaked.join(', ')}.`);
    const allowedNums = s.groundingNumbers(extraNumbers);
    const problems = parts.flatMap(([where, text]) => ungroundedNumbers(text, allowedNums).map(n => `${n} (in ${where})`));
    if (problems.length) throw new ResearchError(`Not in the fetched data: ${problems.join(', ')}. Use only fetched numbers, or drop them.`);
    // The scale line is pure formatting of fetched numbers, so the server writes it.
    const card: Card = { headline, scaleText: scaleLine(fetch_), because, funFacts: fun_facts };
    s.writeCard(card); // structural checks first
    checks++;
    const tc = performance.now();
    const flagged = await factCheck(parts, factLines(fetch_, unknown), process.env.XAI_FACTCHECK_MODEL ?? model, signal);
    if (config.dev) console.log(`[agent] fact check ${checks}: ${flagged.length} flag(s) in ${Math.round(performance.now() - tc)} ms`);
    if (flagged.length && checks < MAX_FACT_CHECKS) {
      throw new ResearchError(
        `Fact check — rewrite or drop these unsupported claims, keep everything else: ${flagged.map(f => `[${f.where}] ${f.claim} — ${f.why}`).join(' | ')}`
      );
    }
    if (!flagged.length) {
      await s.log('Card fact-checked against the mission data');
      return card;
    }
    // Out of rewrites: swap only the flagged parts for safe lines built from the fetched data.
    await s.log(`Fact check: replaced ${flagged.length} unsupported line(s) with data-only text`);
    return repairCard(card, new Set(flagged.map(f => f.where)), fetch_, s.requirementsPreview());
  }

  const options = Object.fromEntries(allowed.map(t => [t, s.requirementsFor(t)]));
  const brief = {
    planet: fetch_.planet,
    data: factLines(fetch_, unknown),
    allowed_twists: allowed,
    last_twist: lastTwist ?? 'none',
    requirements_by_twist: options,
  };
  const messages: Message[] = [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: JSON.stringify(brief) },
  ];
  const tools = [writeMissionTool(allowed)];

  const t0 = performance.now();
  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const res = await fetch(API, {
      method: 'POST',
      signal,
      headers: { Authorization: `Bearer ${config.xaiApiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model, messages, tools, tool_choice: { type: 'function', function: { name: 'write_mission' } }, temperature: 0.7 }),
    });
    if (!res.ok) throw new Error(`xAI HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const msg = (await res.json()).choices?.[0]?.message as Message | undefined;
    if (config.dev) console.log(`[agent] turn ${turn + 1} after ${Math.round(performance.now() - t0)} ms`);
    const call = msg?.tool_calls?.[0];
    if (!msg || !call) throw new Error('xAI returned no tool call');
    messages.push({ role: 'assistant', content: msg.content ?? null, tool_calls: [call] });
    try {
      return await handle(JSON.parse(call.function.arguments || '{}') as MissionArgs);
    } catch (e) {
      if (!(e instanceof ResearchError) && !(e instanceof SyntaxError)) throw e;
      if (config.dev) console.log(`[agent] write_mission → ERROR ${e.message}`);
      messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify({ error: e.message }) });
    }
  }
  throw new Error(`Agent didn't produce a valid card within ${MAX_TURNS} turns`);
}

type FetchSummary = ReturnType<typeof summarize>;

/** "40.5 light-years away · 0.92× Earth’s width · 0.65× Earth’s sunlight" — built from fetched numbers only. */
function scaleLine(f: FetchSummary): string {
  const sun = f.fields.insolation?.value;
  const round = (x: number) => (x >= 10 ? Math.round(x) : x >= 1 ? Math.round(x * 10) / 10 : Math.round(x * 100) / 100);
  const where = /from the|from Earth/.test(f.distance) ? f.distance : `${f.distance} away`;
  return [where, `${round(f.radius_earths)}× Earth’s width`, typeof sun === 'number' ? `${round(sun)}× Earth’s sunlight` : '']
    .filter(Boolean)
    .join(' · ');
}

/** The fetched data as plain-English lines, so the writer and the fact checker work from the same facts. */
function factLines(f: FetchSummary, unknown: { field: string; note: string }[] = []): string {
  const lines = [`Planet: ${f.planet}`, `Distance from Earth: ${f.distance}`, `Width: ${f.radius_earths}× Earth’s`];
  if (f.orbit_days) lines.push(`Orbit (one year): ${f.orbit_days} Earth days`);
  if (f.star) lines.push(`Star spectral type: ${f.star}`);
  for (const [, v] of Object.entries(f.fields)) {
    const extra = [v.source && `source: ${v.source}`, v.note && `note: ${v.note}`].filter(Boolean).join('; ');
    lines.push(`${v.label}: ${String(v.value)}${v.unit ? ` ${v.unit}` : ''}${extra ? ` (${extra})` : ''}`);
  }
  for (const u of unknown) lines.push(`${LABELS[u.field] ?? u.field}: not measured (${u.note})`);
  return lines.join('\n');
}

/** The prepared planet in plain terms (labels instead of field names). */
function summarize(p: Prepared) {
  return {
    planet: p.name,
    distance: formatDistance(p.scale.distance),
    radius_earths: Math.round(p.scale.radiusEarths * 100) / 100,
    orbit_days: p.orbitDays,
    star: p.star,
    fields: Object.fromEntries(
      p.values.map(v => [v.field, { label: LABELS[v.field] ?? v.field, value: v.value, unit: v.unit, status: v.status, source: v.sourceLabel, note: v.note }])
    ),
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

/** Replaces flagged parts with lines that only restate fetched values (always pass the provenance checks). */
function repairCard(card: Card, flagged: Set<string>, f: FetchSummary, reqs: { kind: string; cite_one_of: string[] }[]): Card {
  const v = (k: string) => f.fields[k as keyof typeof f.fields] as { value: unknown; source: string; status: string } | undefined;
  const sun = v('insolation')?.value as number | undefined;
  const pct = sun === undefined ? undefined : sun < 0.1 ? (sun * 100).toFixed(1) : String(Math.round(sun * 100));
  const temp = v('meanTempK')?.value as number | undefined;
  const ice = v('waterIce');

  const safeBecause = (kind: string): { text: string; field: ParamField } => {
    const allowed = reqs.find(r => r.kind === kind)?.cite_one_of ?? [];
    if (kind === 'power' && allowed.includes('insolation') && pct) return { text: `It gets ${pct}% of Earth’s sunlight.`, field: 'insolation' };
    if (kind === 'life_support' && allowed.includes('waterIce')) {
      return ice?.value === true ? { text: `Water ice has been found here, according to ${ice.source}.`, field: 'waterIce' } : { text: 'No water has been detected there yet.', field: 'waterIce' };
    }
    if (allowed.includes('meanTempK') && temp !== undefined) return { text: `It averages about ${Math.round(temp - 273.15)} °C, or ${Math.round(temp)} K.`, field: 'meanTempK' };
    if (allowed.includes('dustStorms')) return { text: `${v('dustStorms')?.source} has recorded global dust storms.`, field: 'dustStorms' };
    const p = v('surfacePressureBar');
    return { text: !p || p.status === 'estimated' ? 'Its atmosphere hasn’t been measured, so plan for radiation.' : 'It has almost no atmosphere to block radiation.', field: allowed[0] as ParamField };
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
