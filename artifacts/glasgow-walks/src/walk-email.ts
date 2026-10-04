import type { PlannedWalk } from './walk-planner';
import type { Tour } from './tours';
import { validEmail, type EmailWalk } from '../supabase/functions/send-walk-email/contract';

export { validEmail };
export type { EmailWalk };
export const emailDeliveryConfigured = Boolean(import.meta.env.VITE_SUPABASE_URL &&
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY && import.meta.env.VITE_TURNSTILE_SITE_KEY);
export const turnstileSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;
export function plannedEmailWalk(plan: PlannedWalk): EmailWalk {
  return { kind: 'planned', origin: { ...plan.origin }, stopIds: plan.stops.map(s => s.id),
    distanceMeters: plan.distanceMeters, durationSeconds: plan.durationSeconds };
}
export function curatedEmailWalk(tour: Tour): EmailWalk { return { kind: 'curated', walkId: tour.id }; }

const messages: Record<string, string> = {
  invalid_request: 'Check your email address and try again.',
  verification_failed: 'The security check expired or failed. Complete a new check, then try again.',
  rate_limited: 'Too many email requests. Please wait an hour before trying again.',
  unavailable_walk: 'This walk or one of its stops is no longer published. Refresh the page and choose a current walk.',
  setup_required: 'Email delivery is not enabled yet. Please try again later.',
  service_unavailable: 'Email delivery is temporarily unavailable. Your walk is still here; try again.',
  provider_rejected: 'The email service declined this request. Check your address and try again.',
  delivery_unconfirmed: 'We could not confirm whether the email service accepted your walk. Check your inbox before retrying; this form reuses the same send reference.',
  walk_changed: 'Walk details changed during this send. Close this form, refresh the walk, and try again.',
};
export class WalkEmailError extends Error {
  constructor(public code: string) { super(messages[code] ?? messages.service_unavailable); }
}
export async function sendWalkEmail(
  walk: EmailWalk, email: string, token: string, requestId: string, signal?: AbortSignal,
): Promise<void> {
  if (!validEmail(email.trim())) throw new WalkEmailError('invalid_request');
  if (!emailDeliveryConfigured) throw new WalkEmailError('setup_required');
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) controller.abort();
  const timeout = setTimeout(abort, 45000);
  try {
    const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL.replace(/\/$/, '')}/functions/v1/send-walk-email`, {
      method: 'POST', signal: controller.signal,
      headers: { 'Content-Type': 'application/json', apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
      body: JSON.stringify({ email: email.trim(), walk, token, requestId, consent: true }),
    });
    if (response.status === 404 || response.status === 401) throw new WalkEmailError('setup_required');
    const result = await response.json().catch(() => null);
    if (!response.ok) throw new WalkEmailError(typeof result?.code === 'string' ? result.code : 'service_unavailable');
    if (result?.status !== 'accepted') throw new WalkEmailError('delivery_unconfirmed');
  } catch (error) {
    if (signal?.aborted) throw new DOMException('Cancelled.', 'AbortError');
    if (error instanceof WalkEmailError) throw error;
    throw new WalkEmailError('delivery_unconfirmed');
  } finally { clearTimeout(timeout); signal?.removeEventListener('abort', abort); }
}