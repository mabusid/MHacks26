import { describe, expect, it } from 'vitest';
import { FIXTURES } from '@overburden/shared';
import { ResearchSession, type CommitArgs } from './session';
import { exoplanetValues, parseReflink, type ExoplanetRow } from './sources';

function session() {
  const logs: string[] = [];
  const commits: CommitArgs[] = [];
  const s = new ResearchSession({ log: async t => void logs.push(t), commit: async a => void commits.push(a) });
  return { s, logs, commits };
}

describe('ResearchSession provenance', () => {
  it('commits curated Moon data: every value sourced, or estimated with a reason', async () => {
    const { s, commits } = session();
    const f = s.fetchSolarSystemBody('moon');
    for (const v of f.values) s.setParameter(f.fetchId, v.field);
    s.chooseTwist('radiation');
    s.writeCard(FIXTURES.moon.card);
    await s.commit();
    expect(commits).toHaveLength(1);
    expect(commits[0].params.every(p => (p.status === 'sourced' ? p.sourceUrl.startsWith('https://') : p.note.length > 0))).toBe(true);
    expect(commits[0].params.find(p => p.field === 'radiationDoseMSvPerDay')?.num).toBe(1.369);
    // The equatorial-midpoint temperature isn't a measured site value, so it's estimated (and can't set a twist).
    expect(commits[0].params.find(p => p.field === 'meanTempK')?.status).toBe('estimated');
  });

  it('only accepts values that came from a fetch', () => {
    const { s } = session();
    expect(() => s.setParameter('f99', 'insolation')).toThrow(/Unknown fetch_id/);
    const f = s.fetchSolarSystemBody('moon');
    const m = s.fetchSolarSystemBody('mars');
    s.setParameter(f.fetchId, 'insolation');
    expect(() => s.setParameter(m.fetchId, 'gravity')).toThrow(/is for Mars, not Moon/);
  });

  it('allows estimates only for unknowable fields, with a reason, at a fixed default', () => {
    const { s } = session();
    expect(() => s.markEstimated('insolation', 'guess')).toThrow(/must come from a fetch/);
    expect(() => s.markEstimated('nightHours', ' ')).toThrow(/needs a note/);
    s.markEstimated('waterIce', 'Not detected');
    expect(s.missingFields()).not.toContain('waterIce');
  });

  it("rejects a twist the data doesn't support and because-lines citing the wrong field", () => {
    const { s } = session();
    const f = s.fetchSolarSystemBody('mars');
    for (const v of f.values) s.setParameter(f.fetchId, v.field);
    expect(() => s.chooseTwist('thermal')).not.toThrow(); // 214 K triggers thermal
    s.chooseTwist('dust');
    const bad = { ...FIXTURES.mars.card, because: { ...FIXTURES.mars.card.because, twist: { text: 'x', field: 'gravity' as const } } };
    expect(() => s.writeCard(bad)).toThrow(/must cite one of: dustStorms/);
  });

  it("won't commit before every field is set", async () => {
    const { s } = session();
    const f = s.fetchSolarSystemBody('moon');
    s.setParameter(f.fetchId, 'insolation');
    await expect(s.commit()).rejects.toThrow(/Still missing/);
  });
});

describe('Exoplanet Archive mapping', () => {
  const row: ExoplanetRow = {
    pl_name: 'TRAPPIST-1 e', pl_rade: 0.92, pl_bmasse: 0.692, pl_bmasselim: 0, pl_bmassprov: 'Mass',
    pl_insol: 0.646, pl_eqt: 249.7, pl_orbper: 6.101, sy_dist: 12.43, st_spectype: 'M8.0 V',
    pl_rade_reflink: '<a refstr=AGOL_ET_AL__2021 href=https://ui.adsabs.harvard.edu/abs/2021PSJ.....2....1A/abstract target=ref>Agol et al. 2021</a>',
    pl_bmasse_reflink: null, pl_insol_reflink: null, pl_eqt_reflink: null,
  };

  it('makes site-relative archive links absolute', () => {
    expect(parseReflink('<a refstr=CALCULATED_VALUE href=/docs/pscp_calc.html target=ref>Calculated Value</a>').url).toBe(
      'https://exoplanetarchive.ipac.caltech.edu/docs/pscp_calc.html'
    );
  });

  it('parses reflink HTML into a label and URL', () => {
    expect(parseReflink(row.pl_rade_reflink)).toEqual({
      label: 'Agol et al. 2021 via NASA Exoplanet Archive',
      url: 'https://ui.adsabs.harvard.edu/abs/2021PSJ.....2....1A/abstract',
    });
  });

  it('derives gravity from a measured mass; estimates it from radius when mass is only a limit', () => {
    const g = (r: ExoplanetRow) => exoplanetValues(r).values.find(v => v.field === 'gravity')!;
    expect(g(row)).toMatchObject({ status: 'sourced', value: 8.02 });
    expect(g({ ...row, pl_bmasse: 35, pl_bmasselim: 1 })).toMatchObject({ status: 'estimated', value: 9.03 });
    expect(exoplanetValues(row).scale.distance).toEqual({ value: 40.5, unit: 'ly' });
  });

  it('a short orbit is likely tidally locked → no night (estimated); a wide orbit leaves the night unmeasured', () => {
    const night = (r: ExoplanetRow) => exoplanetValues(r).values.find(v => v.field === 'nightHours');
    expect(night(row)).toMatchObject({ status: 'estimated', value: 0 });
    expect(night(row)!.note).toMatch(/6\.1 days.*tidally locked/);
    expect(night({ ...row, pl_orbper: 53.6 })).toBeUndefined();
    expect(night({ ...row, pl_orbper: null })).toBeUndefined();
  });
});

describe('numeric grounding', async () => {
  const { ungroundedNumbers } = await import('./grounding');
  it('accepts fetched numbers and their conversions, rejects invented ones', () => {
    const { s } = session();
    const f = s.fetchSolarSystemBody('mars');
    for (const v of f.values) s.setParameter(f.fetchId, v.field);
    const allowed = s.groundingNumbers();
    expect(ungroundedNumbers('Mars gets 43% of Earth’s sunlight and averages −59 °C (214 K).', allowed)).toEqual([]);
    expect(ungroundedNumbers('In 2018 a dust storm covered the planet; air is 95.1% CO₂.', allowed)).toEqual([]);
    expect(ungroundedNumbers('Olympus Mons is 21.9 km tall and nights last 37 hours.', allowed)).toEqual(['21.9', '37']);
    // 99 is within 6% of the 95.1% CO₂ figure but not within 3%: invented values close to real ones still fail.
    expect(ungroundedNumbers('Dust storms block 99% of sunlight.', allowed)).toEqual(['99']);
  });
});

describe('curated bodies', async () => {
  const { solarSystemKeys, curatedCard } = await import('./sources');
  const { ungroundedNumbers } = await import('./grounding');
  for (const key of solarSystemKeys()) {
    it(`${key}: passes provenance, twist, citation, and numeric-grounding checks`, async () => {
      const { s, commits } = session();
      const f = s.fetchSolarSystemBody(key);
      for (const v of f.values) s.setParameter(f.fetchId, v.field);
      const { twist, ...card } = curatedCard(key);
      s.chooseTwist(twist);
      s.writeCard(card);
      const text = [card.headline, card.scaleText, ...card.funFacts, ...Object.values(card.because).map(b => b.text)].join(' ');
      expect(ungroundedNumbers(text, s.groundingNumbers())).toEqual([]);
      await s.commit();
      expect(commits[0].params.every(p => (p.status === 'sourced' ? p.sourceUrl.startsWith('https://') : p.note.length > 0))).toBe(true);
    });
  }
});

describe('scripted research (prepare → card → commit)', async () => {
  process.env.RESEARCH_PACE_MS = '0';
  const { pickTwist, prepare, scriptedCard, commitCard } = await import('./scripted');

  it('prefers a twist the room did not just play', () => {
    for (let i = 0; i < 20; i++) expect(pickTwist(['radiation', 'thermal'], 'radiation')).toBe('thermal');
    expect(pickTwist(['radiation'], 'radiation')).toBe('radiation');
  });

  it('prepares a curated body with no model calls, then commits its card', async () => {
    const { s, commits } = session();
    const p = await prepare(s, 'mars');
    expect(s.missingFields()).toEqual([]);
    const name = await commitCard(s, scriptedCard(s, p));
    expect(commits).toHaveLength(1);
    expect(commits[0]).toMatchObject({ planetName: name, twist: s.chosenTwist });
  });
});
