// Shared, dependency-free wire contract. No browser-provided prose or URLs.
export type PlannedEmailWalk = {
  kind: 'planned';
  origin: { lat: number; lon: number };
  stopIds: string[];
  distanceMeters: number;
  durationSeconds: number;
};
export type EmailWalk = PlannedEmailWalk | { kind: 'curated'; walkId: string };
export type WalkEmailRequest = {
  email: string; requestId: string; token: string; consent: true; walk: EmailWalk;
};
export const MAX_EMAIL_REQUEST_BYTES = 8192;
export const validEmail = (email: string) => email.length <= 254 &&
  /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/.test(email) &&
  email.split('@')[0].length <= 64 && !email.split('@')[0].startsWith('.') &&
  !email.split('@')[0].endsWith('.') && !email.includes('..');
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const keys = (v: Record<string, unknown>, allowed: string[]) => Object.keys(v).every(k => allowed.includes(k));
const id = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_-]{1,200}$/.test(v);
const number = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
export class EmailRequestError extends Error {}

export function validateEmailRequest(input: unknown): WalkEmailRequest {
  const bad = () => { throw new EmailRequestError('Invalid email request'); };
  if (!record(input) || !keys(input, ['email', 'requestId', 'token', 'consent', 'walk'])) return bad();
  if (typeof input.email !== 'string' || !validEmail(input.email.trim()) ||
    typeof input.requestId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.requestId) ||
    typeof input.token !== 'string' || input.token.length < 1 || input.token.length > 2048 || input.consent !== true) return bad();
  const w = input.walk;
  if (!record(w)) return bad();
  let walk: EmailWalk;
  if (w.kind === 'curated' && keys(w, ['kind', 'walkId']) && id(w.walkId)) {
    walk = { kind: 'curated', walkId: w.walkId };
  } else if (w.kind === 'planned' && keys(w, ['kind', 'origin', 'stopIds', 'distanceMeters', 'durationSeconds']) &&
    record(w.origin) && keys(w.origin, ['lat', 'lon']) && number(w.origin.lat, -90, 90) && number(w.origin.lon, -180, 180) &&
    Array.isArray(w.stopIds) && w.stopIds.length >= 1 && w.stopIds.length <= 6 && w.stopIds.every(id) &&
    new Set(w.stopIds).size === w.stopIds.length && number(w.distanceMeters, 0, 15050) && number(w.durationSeconds, 0, 600000)) {
    walk = { kind: 'planned', origin: { lat: w.origin.lat, lon: w.origin.lon },
      stopIds: [...w.stopIds], distanceMeters: w.distanceMeters, durationSeconds: w.durationSeconds };
  } else return bad();
  return { email: input.email.trim(), requestId: input.requestId, token: input.token, consent: true, walk };
}