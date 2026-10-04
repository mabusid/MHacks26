// Researched parameter rows ↔ PlanetProfile, with the provenance rules commit_round enforces.

import type { PlanetProfile } from './rules';

export type ParamField = Exclude<keyof PlanetProfile, 'name'>;
export type ParamStatus = 'sourced' | 'estimated';

export interface ParamRow {
  field: ParamField;
  /** Numeric fields; null = unknown (only allowed where the profile allows null). */
  num: number | null;
  /** Boolean fields. */
  flag: boolean | null;
  unit: string;
  status: ParamStatus;
  sourceLabel: string;
  sourceUrl: string;
  /** Required for estimated values: why it's unknown, shown in the briefing and debrief. */
  note: string;
}

type Spec = { type: 'num'; nullable: boolean; min: number; max: number } | { type: 'flag' };

export const PARAM_SPECS: Record<ParamField, Spec> = {
  insolation: { type: 'num', nullable: false, min: 0, max: 10 },
  nightHours: { type: 'num', nullable: true, min: 0, max: 10_000 },
  meanTempK: { type: 'num', nullable: false, min: 10, max: 1000 },
  surfacePressureBar: { type: 'num', nullable: true, min: 0, max: 200 },
  co2Atmosphere: { type: 'flag' },
  waterIce: { type: 'flag' },
  polarIce: { type: 'flag' },
  radiationDoseMSvPerDay: { type: 'num', nullable: true, min: 0, max: 100_000 },
  dustStorms: { type: 'flag' },
  gravity: { type: 'num', nullable: false, min: 0, max: 30 },
};

export const PARAM_FIELDS = Object.keys(PARAM_SPECS) as ParamField[];

/** Validates provenance and ranges, then builds the profile. Throws with a readable message. */
export function profileFromParams(name: string, rows: readonly ParamRow[]): PlanetProfile {
  const byField = new Map<ParamField, ParamRow>();
  for (const row of rows) {
    if (!(row.field in PARAM_SPECS)) throw new Error(`Unknown parameter "${row.field}"`);
    if (byField.has(row.field)) throw new Error(`Duplicate parameter "${row.field}"`);
    if (row.status === 'sourced' && !row.sourceLabel.trim()) throw new Error(`"${row.field}" is marked sourced but has no source`);
    if (row.status === 'estimated' && !row.note.trim()) throw new Error(`"${row.field}" is estimated but has no note explaining why`);
    byField.set(row.field, row);
  }
  const out: Record<string, unknown> = { name };
  for (const field of PARAM_FIELDS) {
    const row = byField.get(field);
    if (!row) throw new Error(`Missing parameter "${field}"`);
    const spec = PARAM_SPECS[field];
    if (spec.type === 'flag') {
      if (row.flag === null) throw new Error(`"${field}" needs a true/false value`);
      out[field] = row.flag;
    } else if (row.num === null) {
      if (!spec.nullable) throw new Error(`"${field}" can't be unknown`);
      if (row.status !== 'estimated') throw new Error(`Unknown "${field}" must be marked estimated`);
      out[field] = null;
    } else {
      if (!Number.isFinite(row.num) || row.num < spec.min || row.num > spec.max) {
        throw new Error(`"${field}" = ${row.num} is outside ${spec.min}–${spec.max}`);
      }
      out[field] = row.num;
    }
  }
  return out as unknown as PlanetProfile;
}
