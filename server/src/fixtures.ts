import { FIXTURES, fixtureParams, type Fixture } from '@overburden/shared';
import { db } from './spacetime';

export type FixtureKey = keyof typeof FIXTURES;
export const FIXTURE_KEYS = Object.keys(FIXTURES) as FixtureKey[];

/** Phase 3 dev path: commits a test planet the way the research agent will (Phase 7–8). */
export async function commitFixture(roomId: bigint, key: FixtureKey): Promise<void> {
  const f: Fixture = FIXTURES[key];
  const { reducers } = db();
  await reducers.logResearch({ roomId, text: `Loading test planet: ${f.profile.name}…` });
  await reducers.commitRound({
    roomId,
    planetName: f.profile.name,
    params: fixtureParams(f).map(p => ({ ...p, num: p.num ?? undefined, flag: p.flag ?? undefined })),
    twist: f.twist,
    headline: f.card.headline,
    scaleText: f.card.scaleText,
    because: (['power', 'life_support', 'twist'] as const).map(kind => ({ kind, ...f.card.because[kind] })),
    funFacts: [...f.card.funFacts],
  });
  await reducers.logResearch({ roomId, text: `${f.profile.name} ready.` });
}
