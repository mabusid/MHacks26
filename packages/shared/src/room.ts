// Room rules shared by the module (enforcement) and the client (input hints).

export const MAX_MEMBERS = 4;
export const ROOM_CODE_LENGTH = 4;
/** No I or O, so codes read unambiguously when said out loud. */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
export const NAME_MAX_LENGTH = 16;

export function normalizeRoomCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z]/g, '').slice(0, ROOM_CODE_LENGTH);
}

/** Returns the cleaned name, or an error message. */
export function validateName(input: string): { ok: true; name: string } | { ok: false; error: string } {
  const name = input.trim().replace(/\s+/g, ' ');
  if (!name) return { ok: false, error: 'Enter a name' };
  if (name.length > NAME_MAX_LENGTH) return { ok: false, error: `Name must be ${NAME_MAX_LENGTH} characters or fewer` };
  return { ok: true, name };
}

/** An empty room (everyone offline) is deleted after this long. */
export const ROOM_TTL_SECONDS = 300;
