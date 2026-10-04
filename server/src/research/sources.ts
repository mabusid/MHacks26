// Research data tiers (Plan.md → Research pipeline): tier 1 = NASA Exoplanet Archive (live TAP),
// tier 2 = curated data/solar_system.json. Every value leaves here with its source attached.

import { readFileSync } from 'node:fs';
import type { ParamField } from '@overburden/shared';

export interface SourcedValue {
  field: ParamField;
  value: number | boolean | null;
  unit: string;
  status: 'sourced' | 'estimated';
  sourceLabel: string;
  sourceUrl: string;
  note: string;
}

export interface ScaleInfo {
  /** Light-years for exoplanets; kilometres for solar-system bodies (label says from where). */
  distance: { value: number; unit: 'ly' | 'km'; label?: string };
  radiusEarths: number;
}

// ── Tier 2: curated solar system ────────────────────────────────────────────────────────────────

export interface CuratedCard {
  twist: 'radiation' | 'thermal' | 'dust';
  headline: string;
  scaleText: string;
  because: Record<'power' | 'life_support' | 'twist', { text: string; field: ParamField }>;
  funFacts: [string, string, string];
}

interface CuratedBody {
  name: string;
  scale: { distanceKm: number; distanceLabel: string; radiusKm: number };
  fields: Record<
    ParamField,
    { value: number | boolean | null; unit: string; sourceLabel: string; sourceUrl: string; note: string; status?: 'sourced' | 'estimated' }
  >;
  card: CuratedCard;
}

const EARTH_RADIUS_KM = 6371;
let curated: Record<string, CuratedBody> | undefined;

function bodies(): Record<string, CuratedBody> {
  curated ??= JSON.parse(readFileSync(new URL('../../../data/solar_system.json', import.meta.url), 'utf8')).bodies;
  return curated!;
}

export function solarSystemKeys(): string[] {
  return Object.keys(bodies());
}

export function curatedCard(key: string): CuratedCard {
  const b = bodies()[key];
  if (!b) throw new Error(`No curated data for "${key}"`);
  return b.card;
}

export function solarSystemBody(key: string): { name: string; values: SourcedValue[]; scale: ScaleInfo } {
  const b = bodies()[key];
  if (!b) throw new Error(`No curated data for "${key}" (have: ${solarSystemKeys().join(', ')})`);
  const values = (Object.entries(b.fields) as [ParamField, CuratedBody['fields'][ParamField]][]).map(([field, f]) => ({
    field,
    value: f.value,
    unit: f.unit,
    status: f.status ?? ('sourced' as const),
    sourceLabel: f.sourceLabel,
    sourceUrl: f.sourceUrl,
    note: f.note,
  }));
  return {
    name: b.name,
    values,
    scale: { distance: { value: b.scale.distanceKm, unit: 'km', label: b.scale.distanceLabel }, radiusEarths: b.scale.radiusKm / EARTH_RADIUS_KM },
  };
}

// ── Tier 1: NASA Exoplanet Archive ──────────────────────────────────────────────────────────────

const TAP = 'https://exoplanetarchive.ipac.caltech.edu/TAP/sync';
const ARCHIVE_LABEL = 'NASA Exoplanet Archive';
const PARSEC_LY = 3.26156;
const EARTH_G = 9.81;
/** Plan.md → Planet pool: likely-rocky, playable sunlight and temperature, known distance. */
const POOL_FILTER = 'pl_rade <= 1.6 and pl_insol between 0.25 and 4 and pl_eqt between 150 and 400 and sy_dist is not null';
const COLUMNS =
  'pl_name,pl_rade,pl_bmasse,pl_bmasselim,pl_bmassprov,pl_insol,pl_eqt,pl_orbper,sy_dist,st_spectype,' +
  'pl_rade_reflink,pl_bmasse_reflink,pl_insol_reflink,pl_eqt_reflink';

export interface ExoplanetRow {
  pl_name: string;
  pl_rade: number;
  pl_bmasse: number | null;
  pl_bmasselim: number | null;
  pl_bmassprov: string | null;
  pl_insol: number;
  pl_eqt: number;
  pl_orbper: number | null;
  sy_dist: number;
  st_spectype: string | null;
  pl_rade_reflink: string | null;
  pl_bmasse_reflink: string | null;
  pl_insol_reflink: string | null;
  pl_eqt_reflink: string | null;
}

async function tap<T>(adql: string, timeoutMs = 10_000): Promise<T[]> {
  const url = `${TAP}?${new URLSearchParams({ query: adql, format: 'json' })}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`Exoplanet Archive HTTP ${res.status}`);
  return (await res.json()) as T[];
}

let poolCache: { at: number; rows: ExoplanetRow[] } | undefined;

/** The eligible exoplanet pool (cached for an hour — the archive changes slowly). */
export async function exoplanetPool(): Promise<ExoplanetRow[]> {
  if (poolCache && Date.now() - poolCache.at < 3_600_000) return poolCache.rows;
  const rows = await tap<ExoplanetRow>(`select ${COLUMNS} from pscomppars where ${POOL_FILTER}`);
  poolCache = { at: Date.now(), rows };
  return rows;
}

export async function exoplanet(name: string): Promise<ExoplanetRow> {
  const safe = name.replace(/'/g, "''");
  const [row] = await tap<ExoplanetRow>(`select ${COLUMNS} from pscomppars where pl_name = '${safe}'`);
  if (!row) throw new Error(`Exoplanet "${name}" not found`);
  return row;
}

/** `<a refstr=… href=URL target=ref>Agol et al. 2021</a>` → { label, url }. */
export function parseReflink(html: string | null): { label: string; url: string } {
  if (!html) return { label: ARCHIVE_LABEL, url: 'https://exoplanetarchive.ipac.caltech.edu/' };
  const href = html.match(/href=([^\s>]+)/)?.[1] ?? '';
  // Some references are site-relative (e.g. "Calculated Value" → /docs/pscp_calc.html).
  const url = href.startsWith('/') ? `https://exoplanetarchive.ipac.caltech.edu${href}` : href || 'https://exoplanetarchive.ipac.caltech.edu/';
  const label = html.replace(/<[^>]*>/g, '').trim();
  return { label: label ? `${label} via ${ARCHIVE_LABEL}` : ARCHIVE_LABEL, url };
}

/** Archive row → sourced values. Gravity is derived; a mass that's only a limit or not measured → estimated. */
export function exoplanetValues(row: ExoplanetRow): { values: SourcedValue[]; scale: ScaleInfo } {
  const ref = (html: string | null) => parseReflink(html);
  const insolRef = ref(row.pl_insol_reflink);
  const eqtRef = ref(row.pl_eqt_reflink);
  const radRef = ref(row.pl_rade_reflink);
  const measuredMass = row.pl_bmasse !== null && row.pl_bmasselim === 0 && row.pl_bmassprov === 'Mass';
  const gravity: SourcedValue = measuredMass
    ? {
        field: 'gravity',
        value: Math.round(((row.pl_bmasse! / row.pl_rade ** 2) * EARTH_G) * 100) / 100,
        unit: 'm/s²',
        status: 'sourced',
        sourceLabel: ref(row.pl_bmasse_reflink).label,
        sourceUrl: ref(row.pl_bmasse_reflink).url,
        note: `Derived from mass ${row.pl_bmasse} and radius ${row.pl_rade} (Earth = 1)`,
      }
    : {
        field: 'gravity',
        value: Math.round(row.pl_rade * EARTH_G * 100) / 100,
        unit: 'm/s²',
        status: 'estimated',
        sourceLabel: radRef.label,
        sourceUrl: radRef.url,
        note: 'Mass not directly measured; assumes Earth-like density from its radius',
      };
  return {
    values: [
      { field: 'insolation', value: row.pl_insol, unit: '× Earth', status: 'sourced', sourceLabel: insolRef.label, sourceUrl: insolRef.url, note: '' },
      { field: 'meanTempK', value: row.pl_eqt, unit: 'K', status: 'sourced', sourceLabel: eqtRef.label, sourceUrl: eqtRef.url, note: 'Equilibrium temperature' },
      gravity,
    ],
    scale: { distance: { value: Math.round(row.sy_dist * PARSEC_LY * 10) / 10, unit: 'ly' }, radiusEarths: row.pl_rade },
  };
}
