import { schema, table, t } from 'spacetimedb/server';
import { SHARED_VERSION, nightBand } from '@overburden/shared';

// Phase 0 placeholder: proves the module bundles @overburden/shared and clients can subscribe.
// Replaced by the real schema in Phase 1.
const serverInfo = table(
  { name: 'server_info', public: true },
  {
    id: t.u32().primaryKey(),
    sharedVersion: t.string(),
    moonNightBand: t.u8(),
  }
);

const spacetimedb = schema({ serverInfo });
export default spacetimedb;

export const init = spacetimedb.init(ctx => {
  ctx.db.serverInfo.insert({ id: 0, sharedVersion: SHARED_VERSION, moonNightBand: nightBand(354, false) });
});
