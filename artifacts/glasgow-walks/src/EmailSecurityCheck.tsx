import { useEffect, useRef, useState } from 'react';
import { turnstileSiteKey } from './walk-email';

type Turnstile = {
  render: (node: HTMLElement, options: Record<string, unknown>) => string;
  remove: (id: string) => void;
};
declare global { interface Window { turnstile?: Turnstile } }
let loading: Promise<Turnstile> | null = null;
function loadTurnstile(): Promise<Turnstile> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (loading) return loading;
  loading = new Promise<Turnstile>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    const fail = () => { clearTimeout(timeout); script.remove(); loading = null; reject(new Error('Verification unavailable')); };
    const timeout = setTimeout(fail, 15000);
    script.onerror = fail;
    script.onload = () => {
      clearTimeout(timeout);
      if (window.turnstile) resolve(window.turnstile); else fail();
    };
    document.head.appendChild(script);
  });
  return loading;
}

export default function EmailSecurityCheck({ resetKey, onToken }: { resetKey: number; onToken: (token: string) => void }) {
  const container = useRef<HTMLDivElement>(null);
  const callback = useRef(onToken);
  callback.current = onToken;
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    let widget: string | undefined;
    let api: Turnstile | undefined;
    callback.current(''); setError(false);
    loadTurnstile().then(value => {
      if (!active || !container.current) return;
      api = value;
      widget = api.render(container.current, {
        sitekey: turnstileSiteKey, action: 'walk-email', size: 'flexible',
        callback: (token: string) => { if (active) callback.current(token); },
        'expired-callback': () => { if (active) callback.current(''); },
        'error-callback': () => { if (active) { callback.current(''); setError(true); } },
      });
    }).catch(() => { if (active) setError(true); });
    return () => { active = false; if (widget !== undefined) api?.remove(widget); };
  }, [resetKey, retry]);
  return <div className="email-security">
    <div ref={container} aria-label="Email security verification" />
    {error && <p role="alert">The security check could not load. Check your connection. <button type="button" className="chip" onClick={() => setRetry(n => n + 1)}>Retry security check</button></p>}
  </div>;
}