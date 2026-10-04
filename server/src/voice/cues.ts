// Mission Control cues (Plan.md → Cue schedule): fun facts early, then hints that read the grid.
// Scheduled here from round.build_ends_at (re-armed on reconnect), ~1 s early to absorb speech latency.

import {
  BUILD_SECONDS, CUES, boardRead, effectiveMode, rulesFromRound, templateHint, winningBuilds, xy,
  type BoardRead, type Build, type CueMode, type PieceKind, type RequirementKind, type TileKind, type Twist,
} from '@overburden/shared';
import { config } from '../config';
import type { DbConnection } from '../module_bindings';
import { onConnected } from '../spacetime';
import { broadcastAudio, broadcastControl } from './broadcast';
import { GrokVoice } from './grok';

const LEAD_MS = 1000;

type RoundRow = NonNullable<ReturnType<DbConnection['db']['round']['id']['find']>>;

interface RoomVoice {
  roundId: bigint;
  timers: ReturnType<typeof setTimeout>[];
  winners?: Build[];
  prev?: BoardRead;
  lastHintMode?: CueMode;
  grok?: GrokVoice;
  speakingUntil: number;
}

const rooms = new Map<bigint, RoomVoice>();

const MODE_INSTRUCTIONS: Record<CueMode, string> = {
  fact: 'Read the line exactly.',
  nudge: 'Say which system is weak in one short sentence. No numbers, no tile names.',
  direction: 'Name the problem and the researched fact behind it, in at most two short sentences. No tile names.',
  exact: 'Tell the crew the ONE suggested move — which piece on which tile — in one short sentence.',
};

function boardFor(conn: DbConnection, rd: RoundRow) {
  const tiles: TileKind[] = [];
  for (const t of conn.db.tile.iter()) if (t.roundId === rd.id) tiles[t.index] = t.kind as TileKind;
  const board = [...conn.db.piece.iter()]
    .filter(p => p.roundId === rd.id)
    .map(p => ({ kind: p.kind as PieceKind, ...xy(p.index) }));
  const because: Partial<Record<RequirementKind, string>> = {};
  for (const r of conn.db.requirement.iter()) if (r.roundId === rd.id) because[r.kind as RequirementKind] = r.because;
  return { tiles, board, because };
}

function contextFor(rd: RoundRow, mode: CueMode, read: BoardRead, draft: string, because: Partial<Record<RequirementKind, string>>, secondsLeft: number): string {
  const lines = [
    `Mode: ${mode.toUpperCase()}. Time left: ${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, '0')}. Planet: ${rd.planetName}.`,
    read.worst ? `Problem: ${read.worst.reason}.` : 'Problem: none — every requirement passes.',
    read.worst && because[read.worst.kind] ? `Researched fact: ${because[read.worst.kind]}` : '',
    mode === 'exact' && read.suggestion.length ? `Suggested move: ${read.suggestion.slice(0, 1).map(a => `${a.op} ${a.kind.replace('_', ' ')} on ${a.tile}`).join('')}.` : '',
    read.changes.newlyPassing.length ? `Progress since last hint: ${read.changes.newlyPassing.join(', ')} now passing — acknowledge it briefly.` : '',
    `Accurate draft to base your line on: "${draft}"`,
  ];
  return lines.filter(Boolean).join('\n');
}

/** Fire one cue now. `useGrok=false` forces template-only (clients speak it with speechSynthesis). */
export async function fireCue(conn: DbConnection, roomId: bigint, cueIndex: number, useGrok = !!config.xaiApiKey): Promise<{ mode: CueMode; text: string; voiced: boolean }> {
  const room = conn.db.room.id.find(roomId);
  const rd = room?.currentRoundId !== undefined ? conn.db.round.id.find(room.currentRoundId) : undefined;
  if (!room || !rd || rd.status.tag !== 'Active') throw new Error('Room is not building');
  const state = rooms.get(roomId) ?? { roundId: rd.id, timers: [], speakingUntil: 0 };
  rooms.set(roomId, state);

  const cue = CUES[cueIndex];
  const rules = rulesFromRound(rd);
  const { tiles, board, because } = boardFor(conn, rd);
  state.winners ??= winningBuilds(rules, tiles, rd.massBudget);
  const read = boardRead(board, tiles, rules, rd.massBudget, state.winners, state.prev);
  const mode = effectiveMode(cue.mode, read.changes.boardChanged, state.lastHintMode);
  const factIndex = CUES.slice(0, cueIndex + 1).filter(c => c.mode === 'fact').length - 1;
  const draft = templateHint({ mode, factIndex, funFacts: rd.funFacts, read, because, twist: rd.twist as Twist });
  if (mode !== 'fact') {
    state.prev = read;
    state.lastHintMode = mode;
  }

  const key = `${rd.id}:${cueIndex}`;
  const post = (text: string, voiced: boolean) =>
    conn.reducers.postHint({ roomId, roundId: rd.id, cue: cueIndex, mode, text, voiced }).catch(e => console.warn(`[voice] post_hint: ${e.message ?? e}`));

  if (!useGrok) {
    await post(draft, false);
    return { mode, text: draft, voiced: false };
  }

  // Caption appears immediately; it's replaced by the spoken transcript when Grok finishes.
  await post(draft, true);
  state.grok ??= new GrokVoice();
  broadcastControl(roomId, { type: 'start', key });
  const utterance = {
    onAudio: (chunk: Buffer) => broadcastAudio(roomId, chunk),
    onTranscript: (text: string, done: boolean) => {
      if (done && text.trim()) void post(text.trim(), true);
    },
  };
  try {
    const secondsLeft = rd.buildEndsAt ? Math.max(0, Math.round((Number(rd.buildEndsAt.microsSinceUnixEpoch / 1000n) - Date.now()) / 1000)) : cue.secondsLeft;
    const spoken =
      mode === 'fact'
        ? await state.grok.sayVerbatim(draft, utterance)
        : await state.grok.sayHint(contextFor(rd, mode, read, draft, because, secondsLeft), MODE_INSTRUCTIONS[mode], utterance);
    state.speakingUntil = Date.now() + state.grok.lastSeconds * 1000;
    return { mode, text: spoken.trim() || draft, voiced: true };
  } catch (e) {
    console.warn(`[voice] room ${roomId} cue ${cueIndex}: ${e instanceof Error ? e.message : e} — template fallback`);
    await post(draft, false); // clients speak it themselves
    return { mode, text: draft, voiced: false };
  } finally {
    broadcastControl(roomId, { type: 'end', key });
  }
}

/** Dev: stop a room's automatic cues (manual /dev/cue still works). */
export function pauseSchedule(roomId: bigint): void {
  const state = rooms.get(roomId);
  state?.timers.forEach(clearTimeout);
  if (state) state.timers = [];
}

function stop(roomId: bigint) {
  const state = rooms.get(roomId);
  if (!state) return;
  state.timers.forEach(clearTimeout);
  state.grok?.close();
  rooms.delete(roomId);
}

function arm(conn: DbConnection, rd: RoundRow) {
  const existing = rooms.get(rd.roomId);
  if (existing?.roundId === rd.id) return;
  stop(rd.roomId);
  if (!rd.buildEndsAt) return;
  const endsAt = Number(rd.buildEndsAt.microsSinceUnixEpoch / 1000n);
  const state: RoomVoice = { roundId: rd.id, timers: [], speakingUntil: 0 };
  rooms.set(rd.roomId, state);
  CUES.forEach((cue, i) => {
    const at = endsAt - cue.secondsLeft * 1000 - LEAD_MS;
    const delay = at - Date.now();
    if (delay < -2000 || delay > BUILD_SECONDS * 1000) return; // already passed (e.g. after a restart)
    state.timers.push(
      setTimeout(() => {
        // Plan.md: if the previous line is still playing, skip this cue.
        if (Date.now() < state.speakingUntil) return;
        fireCue(conn, rd.roomId, i).catch(e => console.warn(`[voice] cue ${i}: ${e instanceof Error ? e.message : e}`));
      }, Math.max(0, delay))
    );
  });
}

export function startCueScheduler(): void {
  onConnected(conn => {
    const check = (rd: RoundRow) => (rd.status.tag === 'Active' ? arm(conn, rd) : rooms.get(rd.roomId)?.roundId === rd.id && stop(rd.roomId));
    conn.db.round.onInsert((_ctx, rd) => check(rd));
    conn.db.round.onUpdate((_ctx, _old, rd) => check(rd));
    conn.db.round.onDelete((_ctx, rd) => rooms.get(rd.roomId)?.roundId === rd.id && stop(rd.roomId));
    for (const rd of conn.db.round.iter()) check(rd);
  });
}
