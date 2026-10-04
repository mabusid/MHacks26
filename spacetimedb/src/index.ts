import { schema, table, t, SenderError, type InferSchema, type ReducerCtx } from 'spacetimedb/server';
import { ScheduleAt, Timestamp, type Identity } from 'spacetimedb';
import {
  BRIEFING_SECONDS, BUILD_SECONDS, MAX_MEMBERS, PARAM_FIELDS, ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH, TWISTS,
  deriveRules, describeRequirements, generateTiles, normalizeRoomCode, profileFromParams, solveRound, validateName,
  type ParamRow, type RequirementKind, type Twist,
} from '@overburden/shared';

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
  serverConfig, session, room, member, round, planetParameter, requirement, tile, researchLog, buildStart, buildEnd,
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
  for (const p of [...ctx.db.planetParameter.roundId.filter(roundId)]) ctx.db.planetParameter.id.delete(p.id);
  for (const r of [...ctx.db.requirement.roundId.filter(roundId)]) ctx.db.requirement.id.delete(r.id);
  for (const tl of [...ctx.db.tile.roundId.filter(roundId)]) ctx.db.tile.id.delete(tl.id);
  ctx.db.round.id.delete(roundId);
}

function deleteRoom(ctx: Ctx, roomId: bigint) {
  for (const rd of [...ctx.db.round.roomId.filter(roomId)]) deleteRound(ctx, rd.id);
  for (const l of [...ctx.db.researchLog.roomId.filter(roomId)]) ctx.db.researchLog.id.delete(l.id);
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
  const r = ctx.db.room.id.find(me.roomId);
  if (!r) return;
  if (membersOf(ctx, r.id).length === 0) deleteRoom(ctx, r.id);
  else ensureOnlineHost(ctx, r);
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
  if (r) ensureOnlineHost(ctx, r);
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
  if (r.phase.tag !== 'Lobby') throw new SenderError('That game has already started');
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
      rules = deriveRules(profile, twist);
    } catch (e) {
      throw new SenderError(e instanceof Error ? e.message : String(e));
    }

    const specs = describeRequirements(rules);
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

/** Host: lobby → briefing. The build starts automatically when the briefing countdown ends. */
export const startRound = spacetimedb.reducer(ctx => {
  const r = requireHost(ctx);
  if (r.phase.tag !== 'Lobby') throw new SenderError('The game has already started');
  const next = r.nextRoundId !== undefined ? ctx.db.round.id.find(r.nextRoundId) : undefined;
  if (!next || next.status.tag !== 'Ready') throw new SenderError('No planet is ready yet');
  const at = ctx.timestamp.microsSinceUnixEpoch + BigInt(BRIEFING_SECONDS) * MICROS;
  ctx.db.round.id.update({ ...next, briefingEndsAt: new Timestamp(at) });
  ctx.db.buildStart.insert({ scheduledId: 0n, scheduledAt: ScheduleAt.time(at), roundId: next.id });
  ctx.db.room.id.update({ ...r, phase: { tag: 'Briefing' }, currentRoundId: next.id, nextRoundId: undefined });
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

/** Scheduled at build start. Evaluation is added in Phase 6. */
export const endBuild = spacetimedb.reducer({ onSchedule: buildEnd }, { job: buildEnd.rowType }, (ctx, { job }) => {
  if (!ctx.sender.equals(ctx.databaseIdentity)) throw new SenderError('Scheduled only');
  const rd = ctx.db.round.id.find(job.roundId);
  if (!rd || rd.status.tag !== 'Active') return;
  ctx.db.round.id.update({ ...rd, status: { tag: 'Done' } });
  const r = ctx.db.room.id.find(rd.roomId);
  if (r && r.currentRoundId === rd.id && r.phase.tag === 'Build') ctx.db.room.id.update({ ...r, phase: { tag: 'Debrief' } });
});
