import { validateEmailRequest, EmailRequestError, MAX_EMAIL_REQUEST_BYTES } from './contract.ts';
import { resolveItinerary, renderItinerary, DeliveryError } from './itinerary.ts';

type Dependencies = { env: (name: string) => string | undefined; fetch: typeof fetch };
const required = (env: Dependencies['env'], name: string) => {
  const value = env(name);
  if (!value) throw new DeliveryError('setup_required');
  return value;
};
async function hmac(secret: string, value: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return [...new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(value)))].map(x => x.toString(16).padStart(2, '0')).join('');
}
async function readBody(request: Request): Promise<unknown> {
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') throw new EmailRequestError();
  if (Number(request.headers.get('content-length')) > MAX_EMAIL_REQUEST_BYTES) throw new EmailRequestError();
  const reader = request.body?.getReader();
  if (!reader) throw new EmailRequestError();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_EMAIL_REQUEST_BYTES) { await reader.cancel(); throw new EmailRequestError(); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch { throw new EmailRequestError(); } finally { reader.releaseLock(); }
}

export function createEmailHandler(deps: Dependencies): (request: Request) => Promise<Response> {
  return async request => {
    const origin = request.headers.get('origin') ?? '';
    const allowed = (deps.env('WALK_EMAIL_ALLOWED_ORIGINS') ?? '').split(',').map(x => x.trim()).filter(Boolean);
    const cors: Record<string, string> = { 'Vary': 'Origin', 'Cache-Control': 'no-store',
      'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'content-type, apikey' };
    const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), {
      status, headers: { ...cors, 'Content-Type': 'application/json' },
    });
    // An origin allow-list is a browser boundary, not proof of identity.
    // Turnstile and private atomic rate counters provide the abuse controls.
    if (!allowed.includes(origin)) return reply(403, { code: 'forbidden_origin' });
    cors['Access-Control-Allow-Origin'] = origin;
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'POST') return reply(405, { code: 'invalid_request' });
    try {
      const input = validateEmailRequest(await readBody(request));
      const dbUrl = required(deps.env, 'SUPABASE_URL').replace(/\/$/, '');
      const serviceKey = required(deps.env, 'SUPABASE_SERVICE_ROLE_KEY');
      const resendKey = required(deps.env, 'RESEND_API_KEY');
      const sender = required(deps.env, 'WALK_EMAIL_FROM');
      const captchaSecret = required(deps.env, 'TURNSTILE_SECRET_KEY');
      const pepper = required(deps.env, 'WALK_EMAIL_HASH_SECRET');
      if (pepper.length < 32 || /[\r\n]/.test(sender)) throw new DeliveryError('setup_required');
      const getJson = async (url: string, init: RequestInit, timeout = 8000) => {
        const response = await deps.fetch(url, { ...init, signal: AbortSignal.timeout(timeout) });
        const value = await response.json().catch(() => null);
        return { response, value };
      };
      const captcha = await getJson('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret: captchaSecret, response: input.token }),
      });
      if (!captcha.response.ok) throw new DeliveryError('service_unavailable');
      if (captcha.value?.success !== true || captcha.value.action !== 'walk-email' || captcha.value.hostname !== new URL(origin).hostname)
        throw new DeliveryError('verification_failed', 400);
      const dbHeaders = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' };
      // A one-way keyed digest is used only for short-lived abuse counters.
      // No recipient, token, origin, itinerary or provider response is logged/stored.
      const hash = await hmac(pepper, `recipient:${input.email.toLowerCase()}`);
      const limit = await getJson(`${dbUrl}/rest/v1/rpc/claim_walk_email_send`, {
        method: 'POST', headers: dbHeaders, body: JSON.stringify({ recipient_hash: hash }),
      });
      if (!limit.response.ok) throw new DeliveryError('setup_required');
      if (limit.value !== true) throw new DeliveryError('rate_limited', 429);
      const itinerary = await resolveItinerary(input.walk, async (table, params) => {
        const result = await getJson(`${dbUrl}/rest/v1/${table}?${params}`, { headers: dbHeaders });
        if (!result.response.ok || !Array.isArray(result.value)) throw new DeliveryError('service_unavailable');
        return result.value;
      });
      const content = renderItinerary(itinerary);
      const idem = await hmac(pepper, JSON.stringify([input.requestId, input.email, input.walk]));
      let sent;
      try {
        sent = await getJson('https://api.resend.com/emails', {
          method: 'POST', headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': idem },
          body: JSON.stringify({ from: sender, to: [input.email], ...content }),
        }, 12000);
      } catch { throw new DeliveryError('delivery_unconfirmed', 502); }
      if (!sent.response.ok) {
        if (sent.response.status === 409) throw new DeliveryError('walk_changed', 409);
        if (sent.response.status >= 500) throw new DeliveryError('delivery_unconfirmed', 502);
        throw new DeliveryError('provider_rejected', 502);
      }
      if (typeof sent.value?.id !== 'string' || !sent.value.id) throw new DeliveryError('delivery_unconfirmed', 502);
      return reply(200, { status: 'accepted' });
    } catch (error) {
      if (error instanceof EmailRequestError) return reply(400, { code: 'invalid_request' });
      if (error instanceof DeliveryError) return reply(error.status, { code: error.code });
      // Never return or log upstream exception text (it can contain credentials or PII).
      return reply(503, { code: 'service_unavailable' });
    }
  };
}