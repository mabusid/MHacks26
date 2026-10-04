// Pure game logic shared by the SpacetimeDB module, the client, and the Node service.
// No runtime dependencies: this package is bundled into the module.

export const SHARED_VERSION = '0.0.3';

export * from './room';
export * from './grid';
export * from './pieces';
export * from './rules';
export * from './evaluate';
export * from './board';
export * from './winnability';
export * from './boardRead';
export * from './requirements';
export * from './params';
export * from './fixtures';
