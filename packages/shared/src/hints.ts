// Mission Control's script (Plan.md → Voice assistant → Cue schedule). Templates are always available:
// they're the captions without a key, and what Grok falls back to.

import type { Action, BoardRead } from './boardRead';
import type { RequirementKind } from './evaluate';
import { PIECES, type PieceKind } from './pieces';
import type { Twist } from './rules';
import { noParens } from './speech';

export type CueMode = 'fact' | 'nudge' | 'direction' | 'exact';

/**
 * Seconds left on the 1:30 build clock when each cue fires, and what it says. Help is capped so the voice
 * confirms the crew's reasoning instead of solving the round: one exact move, at the very end.
 */
export const CUES: { secondsLeft: number; mode: CueMode }[] = [
  { secondsLeft: 85, mode: 'fact' },
  { secondsLeft: 72, mode: 'fact' },
  { secondsLeft: 60, mode: 'nudge' },
  { secondsLeft: 45, mode: 'direction' },
  { secondsLeft: 30, mode: 'direction' },
  { secondsLeft: 15, mode: 'exact' },
];

const ESCALATE: Record<CueMode, CueMode> = { fact: 'fact', nudge: 'direction', direction: 'exact', exact: 'exact' };

/**
 * No repeats: if nothing changed since the last hint, say something more specific (Plan.md) — but never
 * escalate into an exact move; only the scheduled final cue names a piece and tile.
 */
export function effectiveMode(scheduled: CueMode, boardChanged: boolean, lastHintMode: CueMode | undefined): CueMode {
  if (scheduled === 'fact' || boardChanged || !lastHintMode || lastHintMode === 'fact') return scheduled;
  const rank: CueMode[] = ['nudge', 'direction', 'exact'];
  const bumped = ESCALATE[lastHintMode] === 'exact' ? 'direction' : ESCALATE[lastHintMode];
  return rank.indexOf(bumped) > rank.indexOf(scheduled) ? bumped : scheduled;
}

const ACK: Record<RequirementKind, string> = { power: 'power’s covered', life_support: 'life support’s sorted', twist: 'that twist is handled' };
const joinAnd = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

/** Which system is weak, said the way a flight controller would — no numbers (players reason those out). */
function weakSpot(kind: RequirementKind, twist: Twist): string {
  if (kind === 'power') return 'Heads up, crew. I don’t think your power will hold.';
  if (kind === 'life_support') return 'Heads up, crew. Your people are going to run short on water or air.';
  if (twist === 'radiation') return 'Heads up, crew. That habitat isn’t shielded yet.';
  if (twist === 'thermal') return 'Heads up, crew. Nothing is keeping the habitat at a livable temperature.';
  return 'Heads up, crew. A dust storm would leave you in the dark.';
}

/** The researched fact as a spoken aside: "Remember, a lunar night lasts about 15 Earth days." */
function remember(fact: string | undefined): string {
  if (!fact) return '';
  // Lowercase ordinary sentence starts only — names and acronyms ("LCROSS", "Phoenix") keep their capitals.
  const ordinary = /^(A|An|The|It|Its|This|There|Here|No|Nights?|Water|Dust|Global|Sunlight|With|Only|One|Days?)\b/.test(fact);
  return `Remember, ${ordinary ? fact[0].toLowerCase() + fact.slice(1) : fact}`;
}

/** "ice drill", but keep chemical symbols: "O₂ tank". */
const lower = (kind: PieceKind) => PIECES[kind].label.replace(/^[A-Z][a-z]/, m => m.toLowerCase());
const article = (kind: PieceKind) => (/^[aeiou]/i.test(PIECES[kind].label) ? 'an' : 'a');

/** "Try a reactor on B2." / "Remove the solar array on F1." — one move only. */
function describe(actions: Action[]): string {
  const parts = actions
    .slice(0, 1)
    .map(a => (a.op === 'add' ? `${article(a.kind)} ${lower(a.kind)} on ${a.tile}` : `remove the ${lower(a.kind)} on ${a.tile}`));
  if (!parts.length) return '';
  const joined = parts.join(' and ');
  return parts[0].startsWith('remove') ? `I’d ${joined}.` : `Try putting ${joined}.`;
}

export interface HintInput {
  mode: CueMode;
  /** Index into the 3 fun facts for fact cues. */
  factIndex: number;
  funFacts: readonly string[];
  read: BoardRead;
  /** Because-line per requirement (the researched fact behind it). */
  because: Partial<Record<RequirementKind, string>>;
  twist: Twist;
}

/** What Mission Control says, as the caption. Never has parentheses; speak it through `speakable`. */
export function templateHint(input: HintInput): string {
  return noParens(draftHint(input));
}

/** A question that points at the lighter alternative without giving it away. */
const HEAVY: Partial<Record<PieceKind, string>> = {
  reactor: 'A reactor is heavy to fly in. Could sunlight and batteries do that job for less?',
  water_tank: 'Shipping water is heavy. Is there any way to get it here instead?',
  o2_tank: 'Shipping oxygen is heavy. Could you make it here instead?',
  battery: 'That’s a lot of batteries. Is there a lighter way through the night?',
  solar: 'That’s a lot of solar arrays for this little sunlight.',
};

/**
 * Out of cargo mass with no way to add a win: say so, and question the heavy choice. The exact cue adds
 * the swap itself. Replaces the per-requirement hint, so the advice and the problem always match.
 */
function budgetHint(mode: CueMode, read: BoardRead): string | null {
  const swap = read.suggestion.find(a => a.op === 'remove');
  if (!read.overCommitted || !swap) return null;
  const lead = `This plan won’t fit in the cargo budget. ${HEAVY[swap.kind] ?? `The ${lower(swap.kind)} is weighing it down.`}`;
  return mode === 'exact' ? `${lead} ${describe([swap])}` : lead;
}

function draftHint({ mode, factIndex, funFacts, read, because, twist }: HintInput): string {
  if (mode === 'fact') return funFacts[factIndex] ?? funFacts[0] ?? '';
  const ack = read.changes.newlyPassing.length ? `Nice work, ${joinAnd(read.changes.newlyPassing.map(k => ACK[k]))}. ` : '';
  if (!read.worst) return `${ack}Everything checks out from here. Lock in early if you’re confident.`.trim();
  const kind = read.worst.kind;
  // The nudge names the weak system and teaches the planet fact behind it; later cues get more specific.
  if (mode === 'nudge') return `${ack}${weakSpot(kind, twist)} ${remember(because[kind])}`.trim();
  const budget = budgetHint(mode, read);
  if (budget) return `${ack}${budget}`;
  if (mode === 'direction') return `${ack}${read.worst.spoken} ${remember(because[kind])}`.trim();
  const how = describe(read.suggestion);
  return `${ack}${read.worst.spoken} ${how || remember(because[kind])}`.trim();
}
