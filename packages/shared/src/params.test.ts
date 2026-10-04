import { describe, expect, it } from 'vitest';
import { FIXTURES, fixtureParams } from './fixtures';
import { profileFromParams } from './params';
import { describeRequirements } from './requirements';
import { deriveRules } from './rules';

describe('profileFromParams', () => {
  it('round-trips every fixture', () => {
    for (const f of Object.values(FIXTURES)) {
      expect(profileFromParams(f.profile.name, fixtureParams(f))).toEqual(f.profile);
    }
  });

  it('enforces provenance and ranges', () => {
    const rows = fixtureParams(FIXTURES.moon);
    const edit = (field: string, patch: object) => rows.map(r => (r.field === field ? { ...r, ...patch } : r));
    expect(() => profileFromParams('x', rows.slice(1))).toThrow(/Missing parameter "insolation"/);
    expect(() => profileFromParams('x', edit('insolation', { sourceLabel: ' ' }))).toThrow(/no source/);
    expect(() => profileFromParams('x', edit('insolation', { num: 99 }))).toThrow(/outside/);
    expect(() => profileFromParams('x', edit('gravity', { num: null, status: 'estimated', note: 'n/a' }))).toThrow(/can't be unknown/);
    expect(() => profileFromParams('x', edit('nightHours', { num: null }))).toThrow(/must be marked estimated/);
    expect(() => profileFromParams('x', [...rows, rows[0]])).toThrow(/Duplicate/);
  });
});

describe('fixture cards', () => {
  it('reference fields their requirement is derived from', () => {
    for (const f of Object.values(FIXTURES)) {
      const specs = describeRequirements(deriveRules(f.profile, f.twist));
      for (const spec of specs) expect(spec.derivedFrom).toContain(f.card.because[spec.kind].field);
    }
  });

  it('states the planet’s conditions, never the piece counts', () => {
    const moon = FIXTURES.moon.profile;
    const [power, life, twist] = describeRequirements(deriveRules(moon, 'radiation'), moon);
    expect(power.summary).toBe('Power through 15-day nights');
    expect(life.summary).toBe('Water and air for 4 crew, 30 sols');
    expect(twist.summary).toMatch(/^Shield from 1\.\d mSv a day$/);
    const titan = FIXTURES.titan.profile;
    expect(describeRequirements(deriveRules(titan, 'thermal'), titan)[2].summary).toMatch(/^Keep the habitat livable at −\d+ °C$/);
    // No "N batteries", "12 water", "4 berms": the card is facts, the palette has the per-piece stats.
    for (const f of Object.values(FIXTURES)) {
      for (const spec of describeRequirements(deriveRules(f.profile, f.twist), f.profile)) {
        expect(`${spec.summary} ${spec.threshold}`).not.toMatch(/\d+ (batter|berm|thermal unit|water unit|O₂ unit|solar|tank)/i);
      }
    }
  });
});
