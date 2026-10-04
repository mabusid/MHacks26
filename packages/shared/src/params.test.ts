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

  it('describes thresholds from the rules', () => {
    const [power, life, twist] = describeRequirements(deriveRules(FIXTURES.moon.profile, 'radiation'));
    expect(power.threshold).toMatch(/×3 storage/);
    expect(life.threshold).toMatch(/Ice drills work here/);
    expect(twist.threshold).toBe('4 berms next to the habitat');
  });
});
