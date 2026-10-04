// Mission Control's script (Plan.md → Voice assistant → Cue schedule). Templates are always available:
// they're the captions without a key, and what Grok falls back to.

import type { Action, BoardRead } from './boardRead';
import type { RequirementKind } from './evaluate';
import { PIECES, type PieceKind } from './pieces';
import type { Twist } from './rules';

export type CueMode = 'fact' | 'nudge' | 'direction' | 'exact';

/** Seconds left on the 2:30 build clock when each cue fires, and what it says. */
export const CUES: { secondsLeft: number; mode: CueMode }[] = [
  { secondsLeft: 145, mode: 'fact' },
  { secondsLeft: 125, mode: 'fact' },
  { secondsLeft: 105, mode: 'fact' },
  { secondsLeft: 90, mode: 'nudge' },
  { secondsLeft: 70, mode: 'direction' },
  { secondsLeft: 50, mode: 'direction' },
  { secondsLeft: 30, mode: 'exact' },
  { secondsLeft: 15, mode: 'exact' },
];

const ESCALATE: Record<CueMode, CueMode> = { fact: 'fact', nudge: 'direction', direction: 'exact', exact: 'exact' };

/** No repeats: if nothing changed since the last hint, say something more specific (Plan.md). */
export function effectiveMode(scheduled: CueMode, boardChanged: boolean, lastHintMode: CueMode | undefined): CueMode {
  if (scheduled === 'fact' || boardChanged || !lastHintMode || lastHintMode === 'fact') return scheduled;
  const rank: CueMode[] = ['nudge', 'direction', 'exact'];
  const bumped = ESCALATE[lastHintMode];
  return rank.indexOf(bumped) > rank.indexOf(scheduled) ? bumped : scheduled;
}

const ACK: Record<RequirementKind, string> = { power: 'power is covered', life_support: 'life support is sorted', twist: 'the twist is handled' };

function nudge(kind: RequirementKind, twist: Twist): string {
  if (kind === 'power') return 'Your power plan won’t hold up yet.';
  if (kind === 'life_support') return 'Your crew is going to run short on water or air.';
  if (twist === 'radiation') return 'The habitat isn’t shielded yet.';
  if (twist === 'thermal') return 'There isn’t enough power for heating yet.';
  return 'The dust storms will starve your solar.';
}

/** "ice drill", but keep chemical symbols: "O₂ tank". */
const lower = (kind: PieceKind) => PIECES[kind].label.replace(/^[A-Z][a-z]/, m => m.toLowerCase());
const article = (kind: PieceKind) => (/^[aeiou]/i.test(PIECES[kind].label) ? 'an' : 'a');

/** "Try a reactor on B2 and a berm on D3." / "Remove the solar array on F1 and …" */
function describe(actions: Action[]): string {
  const parts = actions
    .slice(0, 2)
    .map(a => (a.op === 'add' ? `${article(a.kind)} ${lower(a.kind)} on ${a.tile}` : `remove the ${lower(a.kind)} on ${a.tile}`));
  if (!parts.length) return '';
  const joined = parts.join(' and ');
  return parts[0].startsWith('remove') ? `${joined[0].toUpperCase()}${joined.slice(1)}.` : `Try ${joined}.`;
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

export function templateHint({ mode, factIndex, funFacts, read, because, twist }: HintInput): string {
  if (mode === 'fact') return funFacts[factIndex] ?? funFacts[0] ?? '';
  const ack = read.changes.newlyPassing.length ? `Nice — ${read.changes.newlyPassing.map(k => ACK[k]).join(' and ')}. ` : '';
  if (!read.worst) return `${ack}Everything checks out — lock in early if you’re confident.`.trim();
  const kind = read.worst.kind;
  if (mode === 'nudge') return `${ack}${nudge(kind, twist)}`;
  if (mode === 'direction') return `${ack}${read.worst.reason}. ${because[kind] ?? ''}`.trim();
  const how = describe(read.suggestion);
  return `${ack}${read.worst.reason}. ${how || (because[kind] ?? '')}`.trim();
}
