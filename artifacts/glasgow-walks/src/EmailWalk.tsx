import { useCallback, useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Mail, X } from 'lucide-react';
import { emailDeliveryConfigured, sendWalkEmail, validEmail, WalkEmailError, type EmailWalk as EmailWalkData } from './walk-email';
import EmailSecurityCheck from './EmailSecurityCheck';
import './email-walk.css';

export default function EmailWalk({ walk, title }: { walk: EmailWalkData; title: string }) {
  const formId = useId();
  const walkKey = JSON.stringify(walk);
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [token, setToken] = useState('');
  const [resetKey, setResetKey] = useState(0);
  const [pending, setPending] = useState(false);
  const [fieldError, setFieldError] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const lock = useRef(false);
  const abort = useRef<AbortController | null>(null);
  const run = useRef(0);
  const reference = useRef<{ key: string; id: string } | null>(null);
  const walkRef = useRef(walkKey);
  const onToken = useCallback((value: string) => setToken(value), []);

  const cancelRun = () => { run.current++; abort.current?.abort(); abort.current = null; lock.current = false; };

  useEffect(() => cancelRun, []);
  useEffect(() => {
    if (walkRef.current === walkKey) return;
    walkRef.current = walkKey;
    cancelRun();
    reference.current = null;
    setOpen(false); setPending(false); setError(''); setFieldError(''); setSuccess(false);
    setEmail(''); setConsent(false); setToken(''); setResetKey(n => n + 1);
  }, [walkKey]);
  useEffect(() => { if (open && !success) input.current?.focus(); }, [open, success]);

  const close = () => {
    if (lock.current) return;
    setOpen(false); setError(''); setFieldError('');
    requestAnimationFrame(() => opener.current?.focus());
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && !pending) { event.stopPropagation(); event.preventDefault(); close(); }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (lock.current) return;
    const address = email.trim();
    if (!validEmail(address)) { setFieldError('Enter a valid email address, such as name@example.com.'); input.current?.focus(); return; }
    if (!consent) { setFieldError('Tick the box to confirm this is your address and you want the itinerary shared.'); return; }
    if (!token) { setFieldError('Complete the security check below, then send.'); return; }
    lock.current = true;
    setFieldError(''); setError(''); setSuccess(false); setPending(true);
    const key = `${walkKey}|${address}`;
    if (reference.current?.key !== key) reference.current = { key, id: crypto.randomUUID() };
    const id = reference.current.id;
    const mine = ++run.current;
    const controller = new AbortController();
    abort.current = controller;
    try {
      await sendWalkEmail(walk, address, token, id, controller.signal);
      if (mine !== run.current) return;
      setSuccess(true); setEmail(''); setConsent(false); reference.current = null;
    } catch (err) {
      if (mine !== run.current || controller.signal.aborted) return;
      setError(err instanceof WalkEmailError ? err.message : 'Email delivery is temporarily unavailable. Your walk is still here; try again.');
    } finally {
      if (mine === run.current) {
        lock.current = false; abort.current = null;
        setPending(false); setToken(''); setResetKey(n => n + 1);
      }
    }
  };

  const planned = walk.kind === 'planned';
  return (
    <div className="email-walk">
      {!open && (
        <button ref={opener} type="button" className="email-walk-open" data-testid="button-email-walk"
          aria-expanded={false} onClick={() => { setOpen(true); setSuccess(false); }}>
          <Mail size={16} aria-hidden="true" /> Email this walk
        </button>
      )}
      {success && !open && <p className="email-walk-ok" role="status" data-testid="status-email-success">The email service accepted your walk. Delivery is not guaranteed, so check spam if it does not arrive.</p>}
      {open && !emailDeliveryConfigured && (
        <div className="email-walk-panel" onKeyDown={onKeyDown} data-testid="form-email-walk">
          <div className="email-walk-head"><strong>Emailing is unavailable</strong>
            <button type="button" className="email-walk-x" onClick={close} aria-label="Close email form" autoFocus>
              <X size={16} aria-hidden="true" /></button></div>
          <p className="email-walk-note" role="status" data-testid="status-email-unavailable">Emailing walks is not switched on for this guide right now. Your walk is unaffected; you can keep browsing, or come back later.</p>
        </div>
      )}
      {open && emailDeliveryConfigured && (
        <form className="email-walk-panel" onSubmit={submit} onKeyDown={onKeyDown} noValidate
          aria-labelledby={`${formId}-title`} data-testid="form-email-walk" aria-busy={pending}>
          <div className="email-walk-head">
            <strong id={`${formId}-title`}>Email me: {title}</strong>
            <button type="button" className="email-walk-x" onClick={close} disabled={pending} aria-label="Close email form" data-testid="button-email-cancel">
              <X size={16} aria-hidden="true" /></button>
          </div>
          {success ? (
            <p className="email-walk-ok" role="status" data-testid="status-email-success">The email service accepted your walk. Check your inbox and spam folder; acceptance does not guarantee delivery.</p>
          ) : null}
          <label className="field-label" htmlFor={`${formId}-input`}>Your email address</label>
          <input ref={input} id={`${formId}-input`} className="email-walk-input" type="email" inputMode="email" autoComplete="email" maxLength={254}
            value={email} disabled={pending} onChange={e => { setEmail(e.target.value); setFieldError(''); setSuccess(false); }}
            aria-invalid={Boolean(fieldError)} aria-describedby={`${formId}-disclosure ${formId}-field-error`} data-testid="input-email-walk" />
          <p id={`${formId}-field-error`} className="email-walk-err" role="alert" data-testid="error-email-field">{fieldError}</p>
          <div id={`${formId}-disclosure`} className="email-walk-note">
            <p>{planned
              ? 'This email includes your stops, distance and time, and the precise start coordinates you used for planning.'
              : 'This email includes only the published itinerary for this walk. It does not include a GPS connector route or your location.'}</p>
            <p><a href="https://resend.com/legal/privacy-policy" target="_blank" rel="noreferrer">Resend</a>, our email provider, receives your address and the email content and may retain them under its own policy. <a href="https://www.cloudflare.com/privacypolicy/" target="_blank" rel="noreferrer">Cloudflare</a> processes the security check. This app does not save your address or route; only keyed rate-limit counters are kept temporarily.</p>
          </div>
          <label className="email-walk-consent">
            <input type="checkbox" checked={consent} disabled={pending} onChange={e => { setConsent(e.target.checked); setFieldError(''); }} data-testid="checkbox-email-consent" />
            <span>This is my own email address. I agree to send this itinerary to Resend and use Cloudflare’s security check as described above.</span>
          </label>
          <EmailSecurityCheck resetKey={resetKey} onToken={onToken} />
          {error && <p className="email-walk-err" role="alert" data-testid="error-email-send">{error}</p>}
          {pending && <p className="email-walk-note" role="status">Sending. Please keep this page open; leaving now means we cannot confirm whether the email was accepted.</p>}
          <div className="email-walk-actions">
            <button type="submit" className="button-primary" disabled={pending} data-testid="button-email-send">
              <Mail size={16} aria-hidden="true" /> {pending ? 'Sending…' : 'Send email'}</button>
            <button type="button" className="button-secondary" onClick={close} disabled={pending}>Cancel</button>
          </div>
        </form>
      )}
    </div>
  );
}
