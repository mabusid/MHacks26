// Numeric grounding for agent-written text: every number must trace to fetched data (or a simple
// conversion of it). Rejected text goes back to the agent with the offending numbers named.

const NUMBER = /\d[\d,]*(?:\.\d+)?/g;

/** Numbers derivable from a fetched value: the value itself plus the conversions cards naturally use. */
export function expand(field: string, v: number): number[] {
  const out = [v];
  if (field === 'insolation') out.push(v * 100); // "43% of Earth's sunlight"
  if (field === 'meanTempK') out.push(v - 273.15, Math.abs(v - 273.15)); // °C (sign written separately)
  if (field === 'nightHours') out.push(v / 24, (v * 2) / 24, v * 2, Math.abs(v * 2 - 24) * 60); // days of night, day length, minutes vs Earth's day
  if (field === 'gravity') out.push(v / 9.81); // in g
  if (field === 'radiationDoseMSvPerDay') out.push(v * 1000); // µSv/day
  return out;
}

/** Numbers in `text` that don't match any allowed value within 3% (small counts and years always pass). */
export function ungroundedNumbers(text: string, allowed: number[]): string[] {
  const bad: string[] = [];
  for (const raw of text.match(NUMBER) ?? []) {
    const n = Number(raw.replace(/,/g, ''));
    if (!Number.isFinite(n)) continue;
    if (Number.isInteger(n) && n <= 12) continue; // "3 berms", "4 crew", "two weeks" written as digits
    if (Number.isInteger(n) && n >= 1900 && n <= 2100) continue; // years (mission dates come from sources)
    const ok = allowed.some(a => a !== 0 && Math.abs(n - a) / Math.abs(a) <= 0.03) || allowed.some(a => Math.abs(n - a) < 0.051);
    if (!ok) bad.push(raw);
  }
  return bad;
}
