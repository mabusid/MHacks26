export const config = {
  port: Number(process.env.PORT ?? 8787),
  xaiApiKey: process.env.XAI_API_KEY || undefined,
  spacetimeUri: process.env.SPACETIME_URI ?? 'ws://localhost:3000',
  spacetimeDb: process.env.SPACETIME_DB ?? 'overburden',
  spacetimeToken: process.env.SPACETIME_TOKEN || undefined,
};
