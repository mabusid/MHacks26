import { describe, expect, it } from 'vitest';
import { nightBand } from './index';

describe('nightBand', () => {
  it('maps night length to bands', () => {
    expect(nightBand(12, false)).toBe(1); // Mars
    expect(nightBand(200, false)).toBe(2);
    expect(nightBand(354, false)).toBe(3); // Moon
  });
  it('adds one for dust storms, capped at 3', () => {
    expect(nightBand(12, true)).toBe(2);
    expect(nightBand(354, true)).toBe(3);
  });
});
