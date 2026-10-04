import { describe, expect, it } from 'vitest';
import { FIXTURES } from './fixtures';
import { deriveRules, nightBand, rulesFromRound, thermalLoadFor, triggeredTwists } from './rules';

describe('nightBand', () => {
  it('maps night length to bands, unknown → 2', () => {
    expect(nightBand(12, false)).toBe(1);
    expect(nightBand(200, false)).toBe(2);
    expect(nightBand(354, false)).toBe(3);
    expect(nightBand(null, false)).toBe(2);
  });
  it('adds one for dust storms, capped at 3', () => {
    expect(nightBand(12, true)).toBe(2);
    expect(nightBand(354, true)).toBe(3);
  });
});

describe('thermalLoadFor', () => {
  it('scales with distance from a comfortable band', () => {
    expect(thermalLoadFor(290)).toBe(0);
    expect(thermalLoadFor(220)).toBe(1);
    expect(thermalLoadFor(94)).toBe(2);
    expect(thermalLoadFor(350)).toBe(1);
    expect(thermalLoadFor(450)).toBe(2);
  });
});

describe('triggeredTwists', () => {
  it('follows the research', () => {
    expect(triggeredTwists(FIXTURES.mars.profile)).toEqual(['radiation', 'thermal', 'dust']);
    expect(triggeredTwists(FIXTURES.titan.profile)).toEqual(['thermal']);
    expect(triggeredTwists(FIXTURES.brightExoplanet.profile)).toEqual(['radiation']);
  });
});

describe('deriveRules', () => {
  it('applies a twist effect only when chosen', () => {
    const dust = deriveRules(FIXTURES.mars.profile, 'dust');
    expect(dust.solarPerArray).toBeCloseTo(3 * 0.43 * 0.5);
    expect(dust.nightBand).toBe(2);
    expect(dust.thermalLoad).toBe(0);
    const thermal = deriveRules(FIXTURES.mars.profile, 'thermal');
    expect(thermal.thermalLoad).toBe(1);
    expect(thermal.nightBand).toBe(1);
  });
  it('sets berm count from measured dose', () => {
    expect(deriveRules(FIXTURES.moon.profile, 'radiation').bermsRequired).toBe(4);
    expect(deriveRules({ ...FIXTURES.moon.profile, radiationDoseMSvPerDay: 5000 }, 'radiation').bermsRequired).toBe(6);
  });
  it('rejects a twist the data does not support', () => {
    expect(() => deriveRules(FIXTURES.titan.profile, 'radiation')).toThrow(/not supported/);
  });
});

describe('rulesFromRound', () => {
  it('round-trips derived rules through round columns', () => {
    const rules = deriveRules(FIXTURES.mars.profile, 'dust');
    expect(rulesFromRound(rules)).toEqual(rules);
  });
});

describe('estimated values cannot set a twist', () => {
  it('drops thermal when the temperature is only estimated; radiation from an unknown atmosphere stays', () => {
    const p = { ...FIXTURES.titan.profile, meanTempK: 167, surfacePressureBar: null };
    expect(triggeredTwists(p)).toEqual(['radiation', 'thermal']);
    expect(triggeredTwists(p, new Set(['meanTempK']))).toEqual(['radiation']);
    expect(() => deriveRules(p, 'thermal', new Set(['meanTempK']))).toThrow(/not supported/);
  });
});
