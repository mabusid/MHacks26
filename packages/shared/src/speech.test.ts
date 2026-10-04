import { describe, expect, it } from 'vitest';
import { speakable } from './speech';

describe('speakable (text-to-speech cleanup)', () => {
  it('turns parenthetical sources and conversions into spoken phrases', () => {
    expect(speakable('Water ice sits in permanently shadowed craters (LCROSS).')).toBe('Water ice sits in permanently shadowed craters, according to LCROSS.');
    expect(speakable('The surface sits around −179 °C (94 K).')).toBe('The surface sits around minus 179 degrees Celsius, or 94 kelvin.');
  });
  it('reads symbols as words', () => {
    expect(speakable('No atmosphere: surface dose is ~1.4 mSv/day (Chang’e 4).')).toBe(
      'No atmosphere: surface dose is about 1.4 millisieverts a day, according to Chang’e 4.'
    );
    expect(speakable('Nights last about 88 Earth days, despite 6.7× Earth’s sunlight.')).toBe('Nights last about 88 Earth days, despite 6.7 times Earth’s sunlight.');
    expect(speakable('The air is 95% CO₂. Try putting an O₂ unit on C6.')).toBe('The air is 95% C O 2. Try putting an oxygen unit on C6.');
  });
  it('never leaves parentheses behind', () => {
    expect(speakable('Odd (nested (text)) here ()')).not.toMatch(/[()]/);
  });
});
