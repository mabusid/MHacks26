// Mission Control's script (Plan.md → Voice assistant → Cue schedule). Templates are always available:
// they're the captions without a key, and what Grok falls back to.

import type { Action, BoardRead } from './boardRead';
import type { RequirementKind } from './evaluate';
import { PIECES, type PieceKind } from './pieces';
import type { Twist } from './rules';
import { noParens } from './speech';

export type CueMode = 'fact' | 'nudge' | 'direction' | 'exact';

/**
 * Seconds left on the 2:00 build clock when each cue fires, and what it says. Help is capped so the voice
 * confirms the crew's reasoning instead of solving the round: one exact move, at the very end.
 * Evenly spaced ~20 s apart: a two-sentence line takes ~8–10 s to speak, so each one finishes with room to
 * act before the next (15 s gaps made lines run together, and a cue is skipped while the last still plays).
 */
export const CUES: { secondsLeft: number; mode: CueMode }[] = [
  { secondsLeft: 116, mode: 'fact' },
  { secondsLeft: 98, mode: 'fact' },
  { secondsLeft: 78, mode: 'nudge' },
  { secondsLeft: 58, mode: 'direction' },
  { secondsLeft: 38, mode: 'direction' },
  { secondsLeft: 18, mode: 'exact' },
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

/**
 * "Try putting an ice drill on C6." — one placement only. Removals are never spoken: they're budget advice,
 * the mass bar already shows the budget, and the board can change between the read and the voice.
 */
function describe(actions: Action[]): string {
  const add = actions.find(a => a.op === 'add');
  return add ? `Try putting ${article(add.kind)} ${lower(add.kind)} on ${add.tile}.` : '';
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

function draftHint({ mode, factIndex, funFacts, read, because, twist }: HintInput): string {
  if (mode === 'fact') return funFacts[factIndex] ?? funFacts[0] ?? '';
  const ack = read.changes.newlyPassing.length ? `Nice work, ${joinAnd(read.changes.newlyPassing.map(k => ACK[k]))}. ` : '';
  if (!read.worst) return `${ack}Everything checks out from here. Lock in early if you’re confident.`.trim();
  const kind = read.worst.kind;
  // The nudge names the weak system and teaches the planet fact behind it; later cues get more specific.
  if (mode === 'nudge') return `${ack}${weakSpot(kind, twist)} ${remember(because[kind])}`.trim();
  if (mode === 'direction') return `${ack}${read.worst.spoken} ${remember(because[kind])}`.trim();
  const how = describe(read.suggestion);
  return `${ack}${read.worst.spoken} ${how || remember(because[kind])}`.trim();
}
