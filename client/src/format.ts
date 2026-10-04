import type { Member, PlanetParameter, Round } from './module_bindings/types';

/** Crew colors by join order (cursors in Phase 5 use the same). */
// Avoids the reserved teal (valid), coral (invalid), green (success), and amber (host) — design.md.
export const CREW_COLORS = ['#60a5fa', '#f472b6', '#facc15', '#a78bfa'];

export function crewColor(members: readonly Member[], m: Member): string {
  const i = members.findIndex(x => x.identity.isEqual(m.identity));
  return CREW_COLORS[Math.max(0, i) % CREW_COLORS.length];
}

const LABELS: Record<string, string> = {
  insolation: 'Sunlight',
  nightHours: 'Night length',
  meanTempK: 'Temperature',
  surfacePressureBar: 'Atmosphere',
  co2Atmosphere: 'CO₂ air',
  waterIce: 'Water ice',
  polarIce: 'Ice in shadowed craters',
  radiationDoseMSvPerDay: 'Surface radiation',
  dustStorms: 'Dust storms',
  gravity: 'Gravity',
};

/** Order the planet card shows facts in. */
export const FACT_ORDER = ['insolation', 'nightHours', 'meanTempK', 'surfacePressureBar', 'radiationDoseMSvPerDay', 'waterIce', 'gravity', 'dustStorms'];

export function paramLabel(field: string): string {
  return LABELS[field] ?? field;
}

export function paramValue(p: PlanetParameter): string {
  if (p.flag !== undefined) return p.flag ? 'Yes' : 'No';
  if (p.num === undefined) return 'Unknown';
  const n = p.num;
  switch (p.field) {
    case 'insolation':
      return `${n < 0.1 ? n.toFixed(3) : n.toFixed(2)}× Earth`;
    case 'nightHours':
      return n === 0 ? 'None (always faces its star)' : n > 48 ? `${(n / 24).toFixed(1)} Earth days` : `${n.toFixed(1)} h`;
    case 'meanTempK':
      return `${Math.round(n)} K (${Math.round(n - 273.15)} °C)`;
    case 'surfacePressureBar':
      return n < 0.001 ? 'None' : `${n < 0.1 ? n.toFixed(3) : n.toFixed(2)} bar`;
    case 'radiationDoseMSvPerDay':
      return `${n.toFixed(2)} mSv/day`;
    case 'gravity':
      return `${n.toFixed(2)} m/s² (${(n / 9.81).toFixed(2)} g)`;
    default:
      return `${n} ${p.unit}`.trim();
  }
}

/** Background tint per kind of world — derived from the round's rules, no extra data needed. */
export function planetTheme(r: Round | undefined): string {
  if (!r) return 'theme-space';
  if (r.twist === 'dust') return 'theme-dust';
  if (r.solarPerArray < 0.5) return 'theme-ice';
  if (r.bermsRequired > 0 && r.iceAvailable) return 'theme-airless';
  return 'theme-exo';
}

export const PHASE_LABEL: Record<string, string> = {
  Lobby: 'Lobby',
  Briefing: 'Briefing',
  Build: 'Build',
  Debrief: 'Debrief',
};

/** Lobby + briefing stat chips: icon + a few characters each, scanned at a glance (numbers over sentences). */
export function factChips(params: readonly PlanetParameter[]): { icon: string; text: string; label: string }[] {
  const get = (f: string) => params.find(p => p.field === f);
  const out: { icon: string; text: string; label: string }[] = [];
  const sun = get('insolation');
  if (sun?.num !== undefined) {
    const pct = sun.num * 100;
    out.push({ icon: '☀', text: `${pct < 10 ? pct.toFixed(1) : Math.round(pct)}%`, label: 'Earth’s sunlight' });
  }
  const night = get('nightHours');
  if (night?.num === 0) out.push({ icon: '☾', text: 'None', label: 'night' });
  else if (night?.num !== undefined) out.push({ icon: '☾', text: night.num > 48 ? `${Math.round(night.num / 24)} d` : `${Math.round(night.num)} h`, label: 'nights' });
  else if (night) out.push({ icon: '☾', text: '?', label: 'night length' });
  const temp = get('meanTempK');
  if (temp?.num !== undefined) out.push({ icon: '🌡', text: `${Math.round(temp.num - 273.15)} °C`.replace('-', '−'), label: 'average' });
  return out;
}
