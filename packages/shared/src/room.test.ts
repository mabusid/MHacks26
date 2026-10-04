import { describe, expect, it } from 'vitest';
import { normalizeRoomCode, validateName } from './room';

describe('normalizeRoomCode', () => {
  it('uppercases, strips non-letters, and truncates', () => {
    expect(normalizeRoomCode(' ab-c d7e ')).toBe('ABCD');
  });
});

describe('validateName', () => {
  it('trims and collapses whitespace', () => {
    expect(validateName('  Sam   Lee ')).toEqual({ ok: true, name: 'Sam Lee' });
  });
  it('rejects empty and too-long names', () => {
    expect(validateName('   ').ok).toBe(false);
    expect(validateName('x'.repeat(17)).ok).toBe(false);
  });
});
