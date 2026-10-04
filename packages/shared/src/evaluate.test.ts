import { describe, expect, it } from 'vitest';
import { evaluate } from './evaluate';
import { FIXTURES } from './fixtures';
import { emptyCounts, type Counts } from './pieces';
import { deriveRules } from './rules';

const moon = deriveRules(FIXTURES.moon.profile, 'radiation');
const counts = (c: Partial<Counts>): Counts => ({ ...emptyCounts(), ...c });

describe('evaluate', () => {
  it('a reactor build meets the Moon requirements (the budget is what rules it out)', () => {
    expect(evaluate(counts({ reactor: 1, ice_drill: 1, o2_tank: 2, berm: 4 }), moon).allPass).toBe(true);
  });

  it('explains each failure and names the responsible fact', () => {
    const e = evaluate(counts({ solar: 2, o2_tank: 2, berm: 1 }), moon);
    expect(e.requirements.power).toMatchObject({ pass: false, fact: 'nightHours' });
    // 4 power through a very long night (×3) at 3 per battery → 4 batteries.
    expect(e.requirements.power.reason).toBe('Night storage short by 4 batteries: 4 power through a very long night needs 4');
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

  it('thermal twist needs thermal units by the habitat, failing on its own line even when power passes', () => {
    const titan = deriveRules(FIXTURES.titan.profile, 'thermal');
    const without = evaluate(counts({ reactor: 1, water_tank: 2, o2_tank: 2 }), titan);
    expect(without.requirements.power.pass).toBe(true);
    expect(without.requirements.twist).toMatchObject({ pass: false, fact: 'meanTempK', reason: 'Thermal control short by 2 units next to the habitat' });
    const withUnits = evaluate(counts({ reactor: 1, water_tank: 2, o2_tank: 2, thermal_unit: 2 }), titan);
    expect(withUnits.load).toBe(6);
    expect(withUnits.allPass).toBe(true);
  });

  it('dust storm reserve fails separately from night power', () => {
    const mars = deriveRules(FIXTURES.mars.profile, 'dust');
    // Night band 1 on Mars: 2 batteries cover the night, but a storm needs ×2.
    const e = evaluate(counts({ solar: 8, battery: 2, water_tank: 2, o2_unit: 1 }), mars);
    expect(e.requirements.power.pass).toBe(true);
    expect(e.requirements.twist).toMatchObject({ pass: false, fact: 'dustStorms' });
    expect(e.requirements.twist.reason).toMatch(/^Storm reserve short by 2 batteries/);
    expect(evaluate(counts({ solar: 8, battery: 4, water_tank: 2, o2_unit: 1 }), mars).requirements.twist.pass).toBe(true);
  });

  it('a reactor rides out dust storms with no batteries (Curiosity vs Opportunity)', () => {
    const mars = deriveRules(FIXTURES.mars.profile, 'dust');
    const e = evaluate(counts({ reactor: 1, water_tank: 2, o2_unit: 1 }), mars);
    expect(e.requirements.twist).toMatchObject({ pass: true, reason: 'Storm-proof: the reactor never needs the sun' });
  });

  it('spoken lines never give away counts', () => {
    const e = evaluate(counts({ solar: 2, o2_tank: 2, berm: 1 }), moon);
    for (const r of Object.values(e.requirements)) expect(r.spoken).not.toMatch(/\d/);
  });
});
