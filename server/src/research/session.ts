// One research run for one room, enforcing the provenance rule (Plan.md → Research pipeline):
// numbers come from fetches, never from the caller. Phase 8's LLM agent drives the same methods as tools.

import {
  PARAM_FIELDS, deriveRules, describeRequirements, profileFromParams, triggeredTwists,
  type ParamField, type ParamRow, type PlanetProfile, type RequirementKind, type Twist,
} from '@overburden/shared';
import {
  exoplanet, exoplanetPool, exoplanetValues, solarSystemBody, solarSystemKeys, type ScaleInfo, type SourcedValue,
} from './sources';
import { expand } from './grounding';

/** The only values `markEstimated` may apply: "unknown" for nullable fields, "not present" for yes/no fields. */
const ESTIMATE_DEFAULTS: Partial<Record<ParamField, null | false>> = {
  nightHours: null,
  surfacePressureBar: null,
  radiationDoseMSvPerDay: null,
  co2Atmosphere: false,
  waterIce: false,
  polarIce: false,
  dustStorms: false,
};

export interface Card {
  headline: string;
  scaleText: string;
  because: Record<RequirementKind, { text: string; field: ParamField }>;
  funFacts: [string, string, string];
}

export interface CommitArgs {
  planetName: string;
  params: ParamRow[];
  twist: Twist;
  headline: string;
  scaleText: string;
  because: { kind: RequirementKind; text: string; field: ParamField }[];
  funFacts: string[];
}

/** Where a session's side effects go: Spacetime in production, an array in tests. */
export interface Sink {
  log(text: string): Promise<void>;
  commit(args: CommitArgs): Promise<void>;
}

interface Fetched {
  name: string;
  scale: ScaleInfo;
  values: Map<ParamField, SourcedValue>;
}

export class ResearchError extends Error {}

export class ResearchSession {
  private fetches = new Map<string, Fetched>();
  private params = new Map<ParamField, ParamRow>();
  private planetName?: string;
  private twist?: Twist;
  private card?: Card;
  private nextId = 1;

  constructor(private sink: Sink) {}

  log(text: string): Promise<void> {
    return this.sink.log(text);
  }

  async listCandidates() {
    const exo = await exoplanetPool();
    return {
      solarSystem: solarSystemKeys(),
      exoplanets: exo.map(r => ({ name: r.pl_name, distanceLy: Math.round(r.sy_dist * 3.26156), star: r.st_spectype ?? 'unknown' })),
    };
  }

  private record(name: string, values: SourcedValue[], scale: ScaleInfo) {
    const fetchId = `f${this.nextId++}`;
    this.fetches.set(fetchId, { name, scale, values: new Map(values.map(v => [v.field, v])) });
    return { fetchId, name, scale, values };
  }

  fetchSolarSystemBody(key: string) {
    const b = solarSystemBody(key);
    return this.record(b.name, b.values, b.scale);
  }

  async fetchExoplanet(name: string) {
    const row = await exoplanet(name);
    const { values, scale } = exoplanetValues(row);
    return { ...this.record(row.pl_name, values, scale), orbitDays: row.pl_orbper, star: row.st_spectype };
  }

  /** Copies a fetched value into the round. The value can't be supplied by the caller. */
  setParameter(fetchId: string, field: ParamField): void {
    const f = this.fetches.get(fetchId);
    if (!f) throw new ResearchError(`Unknown fetch_id "${fetchId}"`);
    const v = f.values.get(field);
    if (!v) throw new ResearchError(`Fetch ${fetchId} has no "${field}"`);
    if (this.planetName && this.planetName !== f.name) throw new ResearchError(`Fetch ${fetchId} is for ${f.name}, not ${this.planetName}`);
    this.planetName = f.name;
    const flag = typeof v.value === 'boolean';
    this.params.set(field, {
      field,
      num: flag || v.value === null ? null : (v.value as number),
      flag: flag ? (v.value as boolean) : null,
      unit: v.unit,
      status: v.status,
      sourceLabel: v.sourceLabel,
      sourceUrl: v.sourceUrl,
      note: v.note,
    });
  }

  /** Marks a field unknown: applies its fixed default and records why (shown as "what we don't know yet"). */
  markEstimated(field: ParamField, note: string): void {
    if (!(field in ESTIMATE_DEFAULTS)) throw new ResearchError(`"${field}" can't be estimated — it must come from a fetch`);
    if (!note.trim()) throw new ResearchError('An estimate needs a note explaining why the value is unknown');
    const value = ESTIMATE_DEFAULTS[field]!;
    this.params.set(field, {
      field,
      num: null,
      flag: value === false ? false : null,
      unit: '',
      status: 'estimated',
      sourceLabel: '',
      sourceUrl: '',
      note: note.trim(),
    });
  }

  missingFields(): ParamField[] {
    return PARAM_FIELDS.filter(f => !this.params.has(f));
  }

  profile(): PlanetProfile {
    if (!this.planetName) throw new ResearchError('No planet chosen yet');
    const missing = this.missingFields();
    if (missing.length) throw new ResearchError(`Still missing: ${missing.join(', ')}`);
    try {
      return profileFromParams(this.planetName, [...this.params.values()]);
    } catch (e) {
      throw new ResearchError(e instanceof Error ? e.message : String(e));
    }
  }

  /** Fields marked estimated — they can't set a twist (Plan.md → Data integrity). */
  private estimated(): Set<ParamField> {
    return new Set([...this.params.values()].filter(p => p.status === 'estimated').map(p => p.field));
  }

  triggeredTwists(): Twist[] {
    return triggeredTwists(this.profile(), this.estimated());
  }

  chooseTwist(kind: Twist): void {
    const allowed = this.triggeredTwists();
    if (!allowed.includes(kind)) throw new ResearchError(`"${kind}" isn't supported by the data (allowed: ${allowed.join(', ')})`);
    this.twist = kind;
  }

  /** Because-lines must cite a field the requirement's threshold is derived from. */
  writeCard(card: Card): void {
    if (!this.twist) throw new ResearchError('Choose a twist before writing the card');
    const specs = describeRequirements(deriveRules(this.profile(), this.twist, this.estimated()));
    for (const spec of specs) {
      const line = card.because[spec.kind];
      if (!line?.text.trim()) throw new ResearchError(`Missing because-line for ${spec.kind}`);
      if (!spec.derivedFrom.includes(line.field)) {
        throw new ResearchError(`Because-line for ${spec.kind} must cite one of: ${spec.derivedFrom.join(', ')}`);
      }
    }
    if (card.funFacts.length !== 3 || card.funFacts.some(f => !f.trim())) throw new ResearchError('Exactly 3 fun facts required');
    this.card = card;
  }

  /** Every number the chosen planet's fetches support, for checking agent-written text. */
  groundingNumbers(extra: number[] = []): number[] {
    const out = [...extra];
    for (const f of this.fetches.values()) {
      if (this.planetName && f.name !== this.planetName) continue;
      const d = f.scale.distance.value;
      out.push(d, d / 1e9, d / 1e6, d / 1e3, f.scale.radiusEarths, 1 / f.scale.radiusEarths); // "1.4 billion km", "225 million km", "1/13 of Earth's width"
      for (const v of f.values.values()) {
        if (typeof v.value === 'number') out.push(...expand(v.field, v.value));
        for (const m of `${v.note} ${v.sourceLabel}`.match(/\d[\d,]*(?:\.\d+)?/g) ?? []) out.push(Number(m.replace(/,/g, '')));
      }
    }
    return out;
  }

  /** The card's thresholds once a twist is chosen — tells the agent which field each because-line must cite. */
  requirementsPreview() {
    if (!this.twist) throw new ResearchError('Choose a twist first');
    return describeRequirements(deriveRules(this.profile(), this.twist, this.estimated())).map(r => ({
      kind: r.kind,
      title: r.title,
      threshold: r.threshold,
      cite_one_of: r.derivedFrom,
    }));
  }

  scaleOf(fetchId: string): ScaleInfo | undefined {
    return this.fetches.get(fetchId)?.scale;
  }

  async commit(): Promise<void> {
    const profile = this.profile();
    if (!this.twist || !this.card) throw new ResearchError('Choose a twist and write the card before committing');
    await this.sink.commit({
      planetName: profile.name,
      params: [...this.params.values()],
      twist: this.twist,
      headline: this.card.headline,
      scaleText: this.card.scaleText,
      because: (['power', 'life_support', 'twist'] as const).map(kind => ({ kind, ...this.card!.because[kind] })),
      funFacts: [...this.card.funFacts],
    });
  }
}
