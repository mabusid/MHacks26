// Pure game logic shared by the SpacetimeDB module, the client, and the Node service.
// No runtime dependencies: this package is bundled into the module.

export const SHARED_VERSION = '0.0.1';

export * from './room';

/** Night storage multiplier from night length (Plan.md → Evaluation). */
export function nightBand(nightHours: number, dust: boolean): 1 | 2 | 3 {
  const base = nightHours <= 24 ? 1 : nightHours <= 240 ? 2 : 3;
  return Math.min(3, base + (dust ? 1 : 0)) as 1 | 2 | 3;
}
