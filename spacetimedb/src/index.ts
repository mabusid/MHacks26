import { schema, table, t, SenderError, type InferSchema, type ReducerCtx } from 'spacetimedb/server';
import { ScheduleAt, Timestamp, type Identity } from 'spacetimedb';
import {
  BRIEFING_SECONDS, BUILD_SECONDS, GRID_SIZE, MAX_MEMBERS, PIECES, PIECE_KINDS, ROOM_TTL_SECONDS, PARAM_FIELDS, ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH, TWISTS,
  countBoard, deriveRules, describeRequirements, evaluate, generateTiles, normalizeRoomCode, placementError, profileFromParams,
  rulesFromRound, solveRound, validateName, xy, type ParamRow, type PieceKind, type RequirementKind, type TileKind, type Twist,
} from '@mission-control/shared';

const Phase = t.enum('Phase', ['Lobby', 'Briefing', 'Build', 'Debrief']);
const RoundStatus = t.enum('RoundStatus', ['Researching', 'Ready', 'Active', 'Done']);

// Private: publisher identity (set in init) and the Node service identity (set once by the owner).
const serverConfig = table(
  { name: 'server_config' },
  {
    id: t.u32().primaryKey(),
    owner: t.identity(),
    server: t.option(t.identity()),
  }
);

// Private: one row per live connection. An identity can hold several (tabs, reconnect races),
// so a member is online while any session exists.
const session = table(
  { name: 'session' },
  {
    connectionId: t.connectionId().primaryKey(),
    identity: t.identity().index('btree'),
  }
);

const room = table(
  { name: 'room', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    code: t.string().unique(),
    host: t.identity(),
    phase: Phase,
    currentRoundId: t.option(t.u64()),
    nextRoundId: t.option(t.u64()),
    createdAt: t.timestamp(),
  }
);

// One room per identity; the row persists while offline so a player keeps their seat.
const member = table(
  { name: 'member', public: true },
  {
    identity: t.identity().primaryKey(),
    roomId: t.u64().index('btree'),
    name: t.string(),
    joinedAt: t.timestamp(),
    online: t.bool(),
  }
);

// A researched round. Rules columns are derived server-side from planet_parameter rows (never sent by the agent).
const round = table(
  { name: 'round', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    roomId: t.u64().index('btree'),
    status: RoundStatus,
    planetName: t.string(),
    twist: t.string(),
    massBudget: t.u32(),
    cheapestMass: t.u32(),
    solarPerArray: t.f64(),
    nightBand: t.u8(),
    thermalLoad: t.u8(),
    co2Atmosphere: t.bool(),
    iceAvailable: t.bool(),
    bermsRequired: t.u8(),
    gravity: t.f64(),
    headline: t.string(),
    scaleText: t.string(),
    funFacts: t.array(t.string()),
    briefingEndsAt: t.option(t.timestamp()),
    buildEndsAt: t.option(t.timestamp()),
    /** Set when the build ends: did every requirement pass? */
    success: t.option(t.bool()),
  }
);

const planetParameter = table(
  { name: 'planet_parameter', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    roundId: t.u64().index('btree'),
    field: t.string(),
    num: t.option(t.f64()),
    flag: t.option(t.bool()),
    unit: t.string(),
    status: t.string(),
    sourceLabel: t.string(),
    sourceUrl: t.string(),
    note: t.string(),
  }
);

// The Mission Requirements Card: server-computed threshold + the agent's because-line.
const requirement = table(
  { name: 'requirement', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    roundId: t.u64().index('btree'),
    kind: t.string(),
    title: t.string(),
    summary: t.string(),
    threshold: t.string(),
    derivedFrom: t.array(t.string()),
    because: t.string(),
    becauseField: t.string(),
  }
);

const tile = table(
  { name: 'tile', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    roundId: t.u64().index('btree'),
    index: t.u8(),
    kind: t.string(),
  }
);

const researchLog = table(
  { name: 'research_log', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    roomId: t.u64().index('btree'),
    text: t.string(),
    at: t.timestamp(),
  }
);

// Placed pieces. Shared by the whole crew: anyone can place or remove anything (Plan.md → Shared everything).
const piece = table(
  { name: 'piece', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    roundId: t.u64().index('btree'),
    kind: t.string(),
    index: t.u8(),
    placedBy: t.identity(),
  }
);

// Mission Control's lines (captions). One row per cue; the server may update it as speech transcribes.
const hint = table(
  { name: 'hint', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    key: t.string().unique(),
    roomId: t.u64().index('btree'),
    roundId: t.u64().index('btree'),
    cue: t.u8(),
    mode: t.string(),
    text: t.string(),
    /** true: audio is streamed from the server (Grok); false: clients speak it themselves. */
    voiced: t.bool(),
    at: t.timestamp(),
  }
);

// Per-requirement outcome, written once when the build ends (debrief).
const result = table(
  { name: 'result', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    roundId: t.u64().index('btree'),
    kind: t.string(),
    pass: t.bool(),
    reason: t.string(),
    /** Researched field most responsible for a failure ('' when passed). */
    fact: t.string(),
  }
);

// Deletes a room ROOM_TTL_SECONDS after its last member goes offline (cancelled if someone returns).
const roomCleanup = table(
  { name: 'room_cleanup' },
  {
    scheduledId: t.u64().primaryKey().autoInc(),
    scheduledAt: t.scheduleAt(),
    roomId: t.u64(),
  }
);

// Live cursors in grid units (0–8 on each axis); one row per member.
const cursor = table(
  { name: 'cursor', public: true },
  {
    identity: t.identity().primaryKey(),
    roomId: t.u64().index('btree'),
    x: t.f32(),
    y: t.f32(),
    visible: t.bool(),
  }
);

// One-shot schedule that starts the build when the briefing countdown runs out.
const buildStart = table(
  { name: 'build_start' },
  {
    scheduledId: t.u64().primaryKey().autoInc(),
    scheduledAt: t.scheduleAt(),
    roundId: t.u64(),
  }
);

// One-shot schedule that ends the build phase.
const buildEnd = table(
  { name: 'build_end' },
  {
    scheduledId: t.u64().primaryKey().autoInc(),
    scheduledAt: t.scheduleAt(),
    roundId: t.u64(),
  }
);

const ParamInput = t.object('ParamInput', {
  field: t.string(),
  num: t.option(t.f64()),
  flag: t.option(t.bool()),
  unit: t.string(),
  status: t.string(),
  sourceLabel: t.string(),
  sourceUrl: t.string(),
  note: t.string(),
});

const BecauseInput = t.object('BecauseInput', { kind: t.string(), text: t.string(), field: t.string() });

const spacetimedb = schema({
  serverConfig, session, room, member, round, planetParameter, requirement, tile, researchLog, piece, hint, result, cursor, buildStart, buildEnd, roomCleanup,
});
export default spacetimedb;

type Ctx = ReducerCtx<InferSchema<typeof spacetimedb>>;
type RoomRow = NonNullable<ReturnType<Ctx['db']['room']['id']['find']>>;

function cleanName(input: string): string {
  const result = validateName(input);
  if (!result.ok) throw new SenderError(result.error);
  return result.name;
}

function generateCode(ctx: Ctx): string {
  for (let attempt = 0; attempt < 50; attempt++) {
    let code = '';
    for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
      code += ROOM_CODE_ALPHABET[ctx.random.integerInRange(0, ROOM_CODE_ALPHABET.length - 1)];
    }
    if (!ctx.db.room.code.find(code)) return code;
  }
  throw new SenderError('Could not allocate a room code, try again');
}

function membersOf(ctx: Ctx, roomId: bigint) {
  return [...ctx.db.member.roomId.filter(roomId)].sort((a, b) =>
    a.joinedAt.microsSinceUnixEpoch < b.joinedAt.microsSinceUnixEpoch ? -1 : 1
  );
}

/** Keep an online host when possible: longest-joined online member wins (Plan.md → Host migration). */
function ensureOnlineHost(ctx: Ctx, r: RoomRow) {
  const members = membersOf(ctx, r.id);
  const current = members.find(m => m.identity.equals(r.host));
  if (current?.online) return;
  const next = members.find(m => m.online) ?? (current ? undefined : members[0]);
  if (next && !next.identity.equals(r.host)) ctx.db.room.id.update({ ...r, host: next.identity });
}

function deleteRound(ctx: Ctx, roundId: bigint) {
  for (const pc of [...ctx.db.piece.roundId.filter(roundId)]) ctx.db.piece.id.delete(pc.id);
  for (const res of [...ctx.db.result.roundId.filter(roundId)]) ctx.db.result.id.delete(res.id);
  for (const h of [...ctx.db.hint.roundId.filter(roundId)]) ctx.db.hint.id.delete(h.id);
  for (const p of [...ctx.db.planetParameter.roundId.filter(roundId)]) ctx.db.planetParameter.id.delete(p.id);
  for (const r of [...ctx.db.requirement.roundId.filter(roundId)]) ctx.db.requirement.id.delete(r.id);
  for (const tl of [...ctx.db.tile.roundId.filter(roundId)]) ctx.db.tile.id.delete(tl.id);
  ctx.db.round.id.delete(roundId);
}

function deleteRoom(ctx: Ctx, roomId: bigint) {
  for (const rd of [...ctx.db.round.roomId.filter(roomId)]) deleteRound(ctx, rd.id);
  for (const l of [...ctx.db.researchLog.roomId.filter(roomId)]) ctx.db.researchLog.id.delete(l.id);
  for (const c of [...ctx.db.cursor.roomId.filter(roomId)]) ctx.db.cursor.identity.delete(c.identity);
  ctx.db.room.id.delete(roomId);
}

/** Owner (publisher; used by the Node service in dev) or the registered server identity. */
function requireServer(ctx: Ctx) {
  const cfg = ctx.db.serverConfig.id.find(0);
  const ok = cfg && (cfg.owner.equals(ctx.sender) || (cfg.server !== undefined && cfg.server.equals(ctx.sender)));
  if (!ok) throw new SenderError('Server only');
}

function requireHost(ctx: Ctx): RoomRow {
  const me = ctx.db.member.identity.find(ctx.sender);
  const r = me && ctx.db.room.id.find(me.roomId);
  if (!r) throw new SenderError('You are not in a room');
  if (!r.host.equals(ctx.sender)) throw new SenderError('Only the host can do that');
  return r;
}

function leaveCurrentRoom(ctx: Ctx, identity: Identity) {
  const me = ctx.db.member.identity.find(identity);
  if (!me) return;
  ctx.db.member.identity.delete(identity);
  ctx.db.cursor.identity.delete(identity);
  const r = ctx.db.room.id.find(me.roomId);
  if (!r) return;
  if (membersOf(ctx, r.id).length === 0) deleteRoom(ctx, r.id);
  else {
    ensureOnlineHost(ctx, r);
    scheduleCleanupIfEmpty(ctx, r.id);
  }
}

function isOnline(ctx: Ctx, identity: Identity): boolean {
  for (const _ of ctx.db.session.identity.filter(identity)) return true;
  return false;
}

function setOnline(ctx: Ctx, identity: Identity) {
  const me = ctx.db.member.identity.find(identity);
  if (!me) return;
  const online = isOnline(ctx, identity);
  if (me.online !== online) ctx.db.member.identity.update({ ...me, online });
  const r = ctx.db.room.id.find(me.roomId);
  if (r) {
    ensureOnlineHost(ctx, r);
    scheduleCleanupIfEmpty(ctx, r.id);
  }
}

/** Schedule deletion when nobody in the room is online; cancel it as soon as someone is. */
function scheduleCleanupIfEmpty(ctx: Ctx, roomId: bigint) {
  const anyoneOnline = [...ctx.db.member.roomId.filter(roomId)].some(m => m.online);
  const pending = [...ctx.db.roomCleanup.iter()].filter(j => j.roomId === roomId);
  if (anyoneOnline) {
    for (const j of pending) ctx.db.roomCleanup.scheduledId.delete(j.scheduledId);
  } else if (pending.length === 0) {
    const at = ctx.timestamp.microsSinceUnixEpoch + BigInt(ROOM_TTL_SECONDS) * 1_000_000n;
    ctx.db.roomCleanup.insert({ scheduledId: 0n, scheduledAt: ScheduleAt.time(at), roomId });
  }
}

export const init = spacetimedb.init(ctx => {
  ctx.db.serverConfig.insert({ id: 0, owner: ctx.sender, server: undefined });
});

export const onConnect = spacetimedb.clientConnected(ctx => {
  if (ctx.connectionId) ctx.db.session.insert({ connectionId: ctx.connectionId, identity: ctx.sender });
  setOnline(ctx, ctx.sender);
});

export const onDisconnect = spacetimedb.clientDisconnected(ctx => {
  if (ctx.connectionId) ctx.db.session.connectionId.delete(ctx.connectionId);
  setOnline(ctx, ctx.sender);
});

/** Owner-only, run once via `spacetime call`: registers the Node service identity. */
export const setServerIdentity = spacetimedb.reducer({ identity: t.identity() }, (ctx, { identity }) => {
  const cfg = ctx.db.serverConfig.id.find(0);
  if (!cfg || !cfg.owner.equals(ctx.sender)) throw new SenderError('Owner only');
  ctx.db.serverConfig.id.update({ ...cfg, server: identity });
});

export const createRoom = spacetimedb.reducer({ name: t.string() }, (ctx, { name }) => {
  const clean = cleanName(name);
  leaveCurrentRoom(ctx, ctx.sender);
  const r = ctx.db.room.insert({
    id: 0n,
    code: generateCode(ctx),
    host: ctx.sender,
    phase: { tag: 'Lobby' },
    currentRoundId: undefined,
    nextRoundId: undefined,
    createdAt: ctx.timestamp,
  });
  ctx.db.member.insert({ identity: ctx.sender, roomId: r.id, name: clean, joinedAt: ctx.timestamp, online: true });
});

export const joinRoom = spacetimedb.reducer({ code: t.string(), name: t.string() }, (ctx, { code, name }) => {
  const clean = cleanName(name);
  const r = ctx.db.room.code.find(normalizeRoomCode(code));
  if (!r) throw new SenderError('No room with that code');

  const existing = ctx.db.member.identity.find(ctx.sender);
  if (existing?.roomId === r.id) {
    if (existing.name !== clean) ctx.db.member.identity.update({ ...existing, name: clean });
    return;
  }
  // Joins are open in the lobby and the debrief, so late friends get in before the next planet.
  if (r.phase.tag !== 'Lobby' && r.phase.tag !== 'Debrief') throw new SenderError('Round in progress — join at the debrief');
  if (membersOf(ctx, r.id).length >= MAX_MEMBERS) throw new SenderError(`Room is full (${MAX_MEMBERS} players)`);

  leaveCurrentRoom(ctx, ctx.sender);
  ctx.db.member.insert({ identity: ctx.sender, roomId: r.id, name: clean, joinedAt: ctx.timestamp, online: true });
});

export const leaveRoom = spacetimedb.reducer(ctx => {
  leaveCurrentRoom(ctx, ctx.sender);
});

// ── Research → round ────────────────────────────────────────────────────────────────────────────

export const logResearch = spacetimedb.reducer({ roomId: t.u64(), text: t.string() }, (ctx, { roomId, text }) => {
  requireServer(ctx);
  if (!ctx.db.room.id.find(roomId)) throw new SenderError('No such room');
  ctx.db.researchLog.insert({ id: 0n, roomId, text: text.slice(0, 280), at: ctx.timestamp });
});

/**
 * Commits a researched planet as the room's next round. Validates provenance, derives every threshold
 * from the parameters, generates tiles, and sets the budget from the winnability check. Never changes phase.
 */
export const commitRound = spacetimedb.reducer(
  {
    roomId: t.u64(),
    planetName: t.string(),
    params: t.array(ParamInput),
    twist: t.string(),
    headline: t.string(),
    scaleText: t.string(),
    because: t.array(BecauseInput),
    funFacts: t.array(t.string()),
  },
  (ctx, args) => {
    requireServer(ctx);
    const r = ctx.db.room.id.find(args.roomId);
    if (!r) throw new SenderError('No such room');
    if (!(TWISTS as readonly string[]).includes(args.twist)) throw new SenderError(`Unknown twist "${args.twist}"`);
    const twist = args.twist as Twist;

    const rows: ParamRow[] = args.params.map(p => {
      if (p.status !== 'sourced' && p.status !== 'estimated') throw new SenderError(`"${p.field}" has unknown status "${p.status}"`);
      return {
        field: p.field as ParamRow['field'], // checked by profileFromParams
        num: p.num ?? null,
        flag: p.flag ?? null,
        unit: p.unit,
        status: p.status,
        sourceLabel: p.sourceLabel,
        sourceUrl: p.sourceUrl,
        note: p.note,
      };
    });

    let profile, rules;
    try {
      profile = profileFromParams(args.planetName, rows);
      // Estimated values can't set a twist (Plan.md → Data integrity).
      rules = deriveRules(profile, twist, new Set(rows.filter(r => r.status === 'estimated').map(r => r.field)));
    } catch (e) {
      throw new SenderError(e instanceof Error ? e.message : String(e));
    }

    const specs = describeRequirements(rules, profile);
    const because = new Map<string, { text: string; field: string }>();
    for (const b of args.because) because.set(b.kind, b);
    for (const spec of specs) {
      const line = because.get(spec.kind);
      if (!line || !line.text.trim()) throw new SenderError(`Missing because-line for ${spec.kind}`);
      if (!(PARAM_FIELDS as string[]).includes(line.field)) throw new SenderError(`Because-line for ${spec.kind} cites unknown field "${line.field}"`);
    }
    if (args.funFacts.length !== 3 || args.funFacts.some(f => !f.trim())) throw new SenderError('Exactly 3 fun facts required');

    const tiles = generateTiles(() => ctx.random(), { ice: profile.waterIce, polarIce: profile.polarIce });
    const solved = solveRound(rules, tiles);
    if (!solved.ok) throw new SenderError(`Not winnable: ${solved.reason}`);

    // Replace an unused prepared round.
    if (r.nextRoundId !== undefined) {
      const old = ctx.db.round.id.find(r.nextRoundId);
      if (old && old.status.tag === 'Ready') deleteRound(ctx, old.id);
    }

    const rd = ctx.db.round.insert({
      id: 0n,
      roomId: r.id,
      status: { tag: 'Ready' },
      planetName: profile.name,
      twist,
      massBudget: solved.budget,
      cheapestMass: solved.cheapest.mass,
      solarPerArray: rules.solarPerArray,
      nightBand: rules.nightBand,
      thermalLoad: rules.thermalLoad,
      co2Atmosphere: rules.co2Atmosphere,
      iceAvailable: rules.iceAvailable,
      bermsRequired: rules.bermsRequired,
      gravity: profile.gravity,
      headline: args.headline,
      scaleText: args.scaleText,
      funFacts: args.funFacts,
      briefingEndsAt: undefined,
      buildEndsAt: undefined,
      success: undefined,
    });
    for (const p of rows) ctx.db.planetParameter.insert({ id: 0n, roundId: rd.id, ...p, num: p.num ?? undefined, flag: p.flag ?? undefined });
    for (const spec of specs) {
      const line = because.get(spec.kind)!;
      ctx.db.requirement.insert({
        id: 0n,
        roundId: rd.id,
        kind: spec.kind satisfies RequirementKind,
        title: spec.title,
        summary: spec.summary,
        threshold: spec.threshold,
        derivedFrom: spec.derivedFrom,
        because: line.text,
        becauseField: line.field,
      });
    }
    tiles.forEach((kind, index) => ctx.db.tile.insert({ id: 0n, roundId: rd.id, index, kind }));
    ctx.db.room.id.update({ ...ctx.db.room.id.find(r.id)!, nextRoundId: rd.id });
  }
);

// ── Phases ──────────────────────────────────────────────────────────────────────────────────────

const MICROS = 1_000_000n;

/** Briefing → build. Shared by the scheduled auto-start and the host's Skip; no-op if already started. */
function startBuild(ctx: Ctx, roundId: bigint, runningJobId?: bigint) {
  const rd = ctx.db.round.id.find(roundId);
  const r = rd && ctx.db.room.id.find(rd.roomId);
  if (!rd || !r || r.currentRoundId !== rd.id || r.phase.tag !== 'Briefing' || rd.status.tag !== 'Ready') return;
  // Cancel the pending auto-start (the running job's own row is removed by the scheduler).
  for (const job of [...ctx.db.buildStart.iter()]) {
    if (job.roundId === rd.id && job.scheduledId !== runningJobId) ctx.db.buildStart.scheduledId.delete(job.scheduledId);
  }
  const endsAt = ctx.timestamp.microsSinceUnixEpoch + BigInt(BUILD_SECONDS) * MICROS;
  ctx.db.round.id.update({ ...rd, status: { tag: 'Active' }, briefingEndsAt: undefined, buildEndsAt: new Timestamp(endsAt) });
  ctx.db.buildEnd.insert({ scheduledId: 0n, scheduledAt: ScheduleAt.time(endsAt), roundId: rd.id });
  ctx.db.room.id.update({ ...r, phase: { tag: 'Build' } });
}

/** The room's prepared round, if it's ready to play. */
function readyNext(ctx: Ctx, r: RoomRow) {
  const next = r.nextRoundId !== undefined ? ctx.db.round.id.find(r.nextRoundId) : undefined;
  return next && next.status.tag === 'Ready' ? next : undefined;
}

/** → briefing with a countdown; the build starts automatically when it ends. */
function enterBriefing(ctx: Ctx, r: RoomRow, next: NonNullable<ReturnType<typeof readyNext>>) {
  const at = ctx.timestamp.microsSinceUnixEpoch + BigInt(BRIEFING_SECONDS) * MICROS;
  ctx.db.round.id.update({ ...next, briefingEndsAt: new Timestamp(at) });
  ctx.db.buildStart.insert({ scheduledId: 0n, scheduledAt: ScheduleAt.time(at), roundId: next.id });
  ctx.db.room.id.update({ ...r, phase: { tag: 'Briefing' }, currentRoundId: next.id, nextRoundId: undefined });
}

/** Host: lobby → briefing. */
export const startRound = spacetimedb.reducer(ctx => {
  const r = requireHost(ctx);
  if (r.phase.tag !== 'Lobby') throw new SenderError('The game has already started');
  const next = readyNext(ctx, r);
  if (!next) throw new SenderError('No planet is ready yet');
  enterBriefing(ctx, r, next);
});

/** Host: skip the rest of the briefing countdown. */
export const beginBuild = spacetimedb.reducer(ctx => {
  const r = requireHost(ctx);
  if (r.phase.tag !== 'Briefing' || r.currentRoundId === undefined) throw new SenderError('Not in the briefing');
  startBuild(ctx, r.currentRoundId);
});

export const autoStartBuild = spacetimedb.reducer({ onSchedule: buildStart }, { job: buildStart.rowType }, (ctx, { job }) => {
  if (!ctx.sender.equals(ctx.databaseIdentity)) throw new SenderError('Scheduled only');
  startBuild(ctx, job.roundId, job.scheduledId);
});

/**
 * Build → debrief. Shared by the timer and the host's Lock in: cancels the pending timer, scores the board,
 * and writes one result row per requirement. No-op if already finished.
 */
function finishBuild(ctx: Ctx, roundId: bigint, runningJobId?: bigint) {
  const rd = ctx.db.round.id.find(roundId);
  if (!rd || rd.status.tag !== 'Active') return;
  for (const job of [...ctx.db.buildEnd.iter()]) {
    if (job.roundId === rd.id && job.scheduledId !== runningJobId) ctx.db.buildEnd.scheduledId.delete(job.scheduledId);
  }
  const board = [...ctx.db.piece.roundId.filter(rd.id)];
  const counts = countBoard(board.map(p => ({ kind: p.kind as PieceKind, ...xy(p.index) })));
  const evaluation = evaluate(counts, rulesFromRound(rd));
  for (const req of Object.values(evaluation.requirements)) {
    ctx.db.result.insert({ id: 0n, roundId: rd.id, kind: req.kind, pass: req.pass, reason: req.reason, fact: req.fact ?? '' });
  }
  ctx.db.round.id.update({ ...rd, status: { tag: 'Done' }, success: evaluation.allPass });
  const r = ctx.db.room.id.find(rd.roomId);
  if (r && r.currentRoundId === rd.id && r.phase.tag === 'Build') ctx.db.room.id.update({ ...r, phase: { tag: 'Debrief' } });
}

export const endBuild = spacetimedb.reducer({ onSchedule: buildEnd }, { job: buildEnd.rowType }, (ctx, { job }) => {
  if (!ctx.sender.equals(ctx.databaseIdentity)) throw new SenderError('Scheduled only');
  finishBuild(ctx, job.roundId, job.scheduledId);
});

/** Host: end the build early and score it now. */
export const lockBuild = spacetimedb.reducer(ctx => {
  const r = requireHost(ctx);
  if (r.phase.tag !== 'Build' || r.currentRoundId === undefined) throw new SenderError('Not in the build phase');
  finishBuild(ctx, r.currentRoundId);
});

/** Host, from the debrief: clear the finished round, then the next planet's briefing if one is ready, else the lobby. */
export const rematch = spacetimedb.reducer(ctx => {
  const r = requireHost(ctx);
  if (r.phase.tag !== 'Debrief') throw new SenderError('Finish this round first');
  if (r.currentRoundId !== undefined) deleteRound(ctx, r.currentRoundId);
  for (const c of [...ctx.db.cursor.roomId.filter(r.id)]) ctx.db.cursor.identity.update({ ...c, visible: false });
  const cleared = { ...r, currentRoundId: undefined };
  const next = readyNext(ctx, cleared);
  if (next) enterBriefing(ctx, cleared, next);
  else ctx.db.room.id.update({ ...cleared, phase: { tag: 'Lobby' } });
});

export const cleanupRoom = spacetimedb.reducer({ onSchedule: roomCleanup }, { job: roomCleanup.rowType }, (ctx, { job }) => {
  if (!ctx.sender.equals(ctx.databaseIdentity)) throw new SenderError('Scheduled only');
  if (!ctx.db.room.id.find(job.roomId)) return;
  if ([...ctx.db.member.roomId.filter(job.roomId)].some(m => m.online)) return;
  for (const m of [...ctx.db.member.roomId.filter(job.roomId)]) ctx.db.member.identity.delete(m.identity);
  deleteRoom(ctx, job.roomId);
});

// ── Build: placement, berms, cursors ────────────────────────────────────────────────────────────

/** The caller's room and active round, or a readable error. */
function requireBuilding(ctx: Ctx) {
  const me = ctx.db.member.identity.find(ctx.sender);
  const r = me && ctx.db.room.id.find(me.roomId);
  if (!r) throw new SenderError('You are not in a room');
  const rd = r.currentRoundId !== undefined ? ctx.db.round.id.find(r.currentRoundId) : undefined;
  if (r.phase.tag !== 'Build' || !rd || rd.status.tag !== 'Active') throw new SenderError('Not in the build phase');
  return rd;
}

function boardOf(ctx: Ctx, roundId: bigint) {
  return [...ctx.db.piece.roundId.filter(roundId)];
}

function tilesOf(ctx: Ctx, roundId: bigint): TileKind[] {
  const tiles: TileKind[] = [];
  for (const tl of ctx.db.tile.roundId.filter(roundId)) tiles[tl.index] = tl.kind as TileKind;
  return tiles;
}

function checkPlacement(ctx: Ctx, roundId: bigint, budget: number, kind: PieceKind, index: number) {
  if (!Number.isInteger(index) || index < 0 || index >= GRID_SIZE * GRID_SIZE) throw new SenderError('Off the grid');
  const board = boardOf(ctx, roundId);
  const { x, y } = xy(index);
  const err = placementError(kind, x, y, tilesOf(ctx, roundId), new Set(board.map(p => p.index)));
  if (err) throw new SenderError(err);
  const used = board.reduce((m, p) => m + PIECES[p.kind as PieceKind].mass, 0);
  if (used + PIECES[kind].mass > budget) throw new SenderError(`Over budget: ${used + PIECES[kind].mass}/${budget} CU`);
}

export const placePiece = spacetimedb.reducer({ kind: t.string(), index: t.u8() }, (ctx, { kind, index }) => {
  const rd = requireBuilding(ctx);
  if (!(PIECE_KINDS as readonly string[]).includes(kind)) throw new SenderError(`Unknown piece "${kind}"`);
  if (kind === 'ice_drill' && !rd.iceAvailable) throw new SenderError('No ice on this planet');
  if (kind === 'thermal_unit' && rd.twist !== 'thermal') throw new SenderError('No thermal control needed on this mission');
  if (kind === 'berm' && rd.twist !== 'radiation') throw new SenderError('No radiation shielding needed on this mission');
  checkPlacement(ctx, rd.id, rd.massBudget, kind as PieceKind, index);
  ctx.db.piece.insert({ id: 0n, roundId: rd.id, kind, index, placedBy: ctx.sender });
});

export const removePiece = spacetimedb.reducer({ index: t.u8() }, (ctx, { index }) => {
  const rd = requireBuilding(ctx);
  const target = boardOf(ctx, rd.id).find(p => p.index === index);
  if (!target) throw new SenderError('Nothing to remove there');
  ctx.db.piece.id.delete(target.id);
});

/** Throttled by the client (~15/s). x, y in grid units; visible=false when the pointer leaves the grid. */
export const moveCursor = spacetimedb.reducer({ x: t.f32(), y: t.f32(), visible: t.bool() }, (ctx, { x, y, visible }) => {
  const me = ctx.db.member.identity.find(ctx.sender);
  if (!me) return;
  const clamp = (v: number) => (Number.isFinite(v) ? Math.min(GRID_SIZE, Math.max(0, v)) : 0);
  const row = { identity: ctx.sender, roomId: me.roomId, x: clamp(x), y: clamp(y), visible };
  if (ctx.db.cursor.identity.find(ctx.sender)) ctx.db.cursor.identity.update(row);
  else ctx.db.cursor.insert(row);
});

// ── Mission Control ─────────────────────────────────────────────────────────────────────────────

/** Server only: create or update the caption for one cue. */
export const postHint = spacetimedb.reducer(
  { roomId: t.u64(), roundId: t.u64(), cue: t.u8(), mode: t.string(), text: t.string(), voiced: t.bool() },
  (ctx, { roomId, roundId, cue, mode, text, voiced }) => {
    requireServer(ctx);
    const rd = ctx.db.round.id.find(roundId);
    if (!rd || rd.roomId !== roomId) throw new SenderError('No such round in that room');
    const key = `${roundId}:${cue}`;
    const existing = ctx.db.hint.key.find(key);
    const row = { roomId, roundId, cue, mode, text: text.slice(0, 400), voiced, key };
    if (existing) ctx.db.hint.id.update({ ...existing, ...row });
    else ctx.db.hint.insert({ id: 0n, ...row, at: ctx.timestamp });
  }
);
