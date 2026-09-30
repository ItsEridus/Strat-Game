// Uniform action results. Every action validates first and returns a reason
// the UI can show (missing level, location, authority, money, energy, material).
export type Result = { ok: true; msg: string; data?: any } | { ok: false; msg: string };

export const ok = (msg: string, data?: any): Result => ({ ok: true, msg, data });
export const fail = (msg: string): Result => ({ ok: false, msg });

/** Helper: run checks in order and return the first failure message, or null. */
export function firstFail(...checks: (string | null | false | undefined)[]): string | null {
  for (const c of checks) if (c) return c;
  return null;
}
