import { describe, expect, it } from 'vitest';
import { boardRead } from './boardRead';
import { FIXTURES } from './fixtures';
import { generateTiles, mulberry32 } from './grid';
import { effectiveMode, templateHint, CUES } from './hints';
import { deriveRules } from './rules';
import { solveRound, winningBuilds } from './winnability';

const { profile, twist, card } = FIXTURES.moon;
const tiles = generateTiles(mulberry32(42), { ice: true, polarIce: true });
const rules = deriveRules(profile, twist);
const solved = solveRound(rules, tiles);
if (!solved.ok) throw new Error('unsolvable');
const winners = winningBuilds(rules, tiles, solved.budget);
const because = { power: card.because.power.text, life_support: card.because.life_support.text, twist: card.because.twist.text };
const input = (mode: Parameters<typeof templateHint>[0]['mode'], read = boardRead([], tiles, rules, solved.budget, winners)) => ({
  mode, factIndex: 0, funFacts: card.funFacts, read, because, twist,
});

describe('cue schedule', () => {
  it('runs facts first, then nudge → direction → exact, inside 2:30', () => {
    expect(CUES.map(c => c.mode)).toEqual(['fact', 'fact', 'fact', 'nudge', 'direction', 'direction', 'exact', 'exact']);
    expect(CUES.every(c => c.secondsLeft > 0 && c.secondsLeft < 150)).toBe(true);
  });
});

describe('templateHint', () => {
  it('fact cues speak the researched fun facts verbatim', () => {
    expect(templateHint(input('fact'))).toBe(card.funFacts[0]);
  });
  it('nudge names the weak system without numbers; direction gives the reason and the researched fact', () => {
    expect(templateHint(input('nudge'))).toBe('Your power plan won’t hold up yet.');
    expect(templateHint(input('direction'))).toMatch(/^Daytime power short by 4.*lunar night/);
  });
  it('exact names pieces and tiles from the suggestion', () => {
    expect(templateHint(input('exact'))).toMatch(/Try a reactor on [A-H][1-8]/);
    expect(templateHint(input('exact'))).not.toMatch(/o₂/);
  });
  it('acknowledges progress, and says lock in when everything passes', () => {
    const first = boardRead([], tiles, rules, solved.budget, winners);
    const shielded = first.suggestion.filter(a => a.kind === 'berm').map(a => ({ kind: 'berm' as const, x: 'ABCDEFGH'.indexOf(a.tile[0]), y: Number(a.tile.slice(1)) - 1 }));
    const next = boardRead(shielded, tiles, rules, solved.budget, winners, first);
    expect(templateHint(input('nudge', next))).toMatch(/^Nice — the twist is handled\./);
    const all = first.suggestion.filter(a => a.op === 'add').map(a => ({ kind: a.kind, x: 'ABCDEFGH'.indexOf(a.tile[0]), y: Number(a.tile.slice(1)) - 1 }));
    expect(templateHint(input('exact', boardRead(all, tiles, rules, solved.budget, winners)))).toMatch(/lock in early/);
  });
});

describe('effectiveMode', () => {
  it('escalates when the board has not changed since the last hint', () => {
    expect(effectiveMode('nudge', false, 'nudge')).toBe('direction');
    expect(effectiveMode('direction', false, 'direction')).toBe('exact');
    expect(effectiveMode('direction', true, 'direction')).toBe('direction');
    expect(effectiveMode('fact', false, 'exact')).toBe('fact');
    expect(effectiveMode('nudge', false, 'fact')).toBe('nudge');
  });
});
