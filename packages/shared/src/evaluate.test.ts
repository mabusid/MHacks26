import { describe, expect, it } from 'vitest';
import { evaluate } from './evaluate';
import { FIXTURES } from './fixtures';
import { emptyCounts, type Counts } from './pieces';
import { deriveRules } from './rules';

const moon = deriveRules(FIXTURES.moon.profile, 'radiation');
const counts = (c: Partial<Counts>): Counts => ({ ...emptyCounts(), ...c });

describe('evaluate', () => {
  it('passes the Moon cheapest build', () => {
    expect(evaluate(counts({ reactor: 1, ice_drill: 1, o2_tank: 2, berm: 4 }), moon).allPass).toBe(true);
  });

  it('explains each failure and names the responsible fact', () => {
    const e = evaluate(counts({ solar: 2, o2_tank: 2, berm: 1 }), moon);
    expect(e.requirements.power).toMatchObject({ pass: false, fact: 'nightHours' });
    expect(e.requirements.power.reason).toMatch(/Night storage short by 6 batteries/);
    expect(e.requirements.life_support).toMatchObject({ pass: false, fact: 'waterIce', reason: 'Water short by 12 units' });
    expect(e.requirements.twist).toMatchObject({ pass: false, fact: 'radiationDoseMSvPerDay' });
  });

  it("doesn't count batteries with nothing to charge them", () => {
    const e = evaluate(counts({ reactor: 1, battery: 3, ice_drill: 1, o2_unit: 1 }), moon);
    expect(e.batteriesEffective).toBe(0);
    expect(e.requirements.power.pass).toBe(false);
  });

  it('O₂ units use water unless the air is CO₂', () => {
    const mars = deriveRules(FIXTURES.mars.profile, 'dust');
    expect(evaluate(counts({ water_tank: 2, o2_unit: 1 }), mars).water).toBe(12);
    expect(evaluate(counts({ water_tank: 2, o2_unit: 1 }), moon).water).toBe(6);
  });

  it('thermal twist mirrors power with its own wording', () => {
    const titan = deriveRules(FIXTURES.titan.profile, 'thermal');
    const e = evaluate(counts({ water_tank: 2, o2_tank: 2 }), titan);
    expect(e.load).toBe(6);
    expect(e.requirements.twist).toMatchObject({ pass: false, fact: 'meanTempK' });
    expect(e.requirements.twist.reason).toMatch(/^Heating:/);
  });
});
