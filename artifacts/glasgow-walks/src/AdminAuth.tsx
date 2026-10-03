import { useState, type FormEvent } from 'react';
import { ArrowLeft } from 'lucide-react';
import { supabase } from './attraction-store';

const base = import.meta.env.BASE_URL;

export function Brand() {
  return (
    <a href={base} className="brand" data-testid="link-home" aria-label="Glasgow Walks home">
      <span className="brand-mark"><span>G</span></span><span className="brand-name">Glasgow Walks</span>
    </a>
  );
}

export function AuthFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="adm-auth">
      <aside className="adm-auth-art">
        <Brand />
        <h2>Keep the city<br />up to <em>date.</em></h2>
        <span className="eyebrow" style={{ color: 'var(--lime)' }}>Attraction administration</span>
      </aside>
      <section className="adm-auth-form">{children}</section>
    </div>
  );
}

export function Recovery({ onDone }: { onDone: () => void }) {
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    if (pw.length < 8) return setErr('Use at least 8 characters.');
    if (pw !== pw2) return setErr('The two passwords do not match.');
    setBusy(true); setErr('');
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) return setErr('Your password could not be changed. The recovery link may have expired; request a new one.');
    setPw(''); setPw2(''); onDone();
  };
  return (
    <AuthFrame>
      <div className="eyebrow">Password recovery</div>
      <h1>Choose a new password</h1>
      <form onSubmit={submit}>
        <div><label className="adm-lab" htmlFor="np">New password</label>
          <input id="np" className="adm-in" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} data-testid="input-new-password" /></div>
        <div><label className="adm-lab" htmlFor="np2">Confirm password</label>
          <input id="np2" className="adm-in" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} data-testid="input-confirm-password" /></div>
        {err && <div className="adm-msg err" role="alert" data-testid="status-recovery-error">{err}</div>}
        <button className="adm-btn pri" disabled={busy} data-testid="button-save-password">{busy ? 'Saving…' : 'Save new password'}</button>
      </form>
    </AuthFrame>
  );
}

export function SignIn({ notice }: { notice?: string }) {
  const [mode, setMode] = useState<'in' | 'forgot'>('in');
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    if (!email.trim()) return setErr('Enter your email address.');
    setBusy(true); setErr(''); setOk('');
    if (mode === 'in') {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: pw });
      setPw('');
      if (error) setErr('Those details were not recognised. Check your email and password and try again.');
    } else {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin + base + 'admin' });
      if (error) setErr('The reset email could not be sent just now. Please try again shortly.');
      else setOk('If that address belongs to an administrator, a reset link is on its way. Open it on this device.');
    }
    setBusy(false);
  };
  return (
    <AuthFrame>
      <div className="eyebrow">Administrators only</div>
      <h1>{mode === 'in' ? 'Sign in' : 'Reset your password'}</h1>
      {notice && <div className="adm-msg ok" data-testid="status-auth-notice">{notice}</div>}
      <form onSubmit={submit} noValidate>
        <div><label className="adm-lab" htmlFor="em">Email</label>
          <input id="em" className="adm-in" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} data-testid="input-email" /></div>
        {mode === 'in' && <div><label className="adm-lab" htmlFor="pw">Password</label>
          <input id="pw" className="adm-in" type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} data-testid="input-password" /></div>}
        <div aria-live="polite">
          {err && <div className="adm-msg err" role="alert" data-testid="status-auth-error">{err}</div>}
          {ok && <div className="adm-msg ok" data-testid="status-auth-ok">{ok}</div>}
        </div>
        <button className="adm-btn pri" disabled={busy} data-testid="button-submit-auth">
          {busy ? 'Working…' : mode === 'in' ? 'Sign in' : 'Email me a reset link'}
        </button>
      </form>
      <button className="adm-btn link" style={{ justifySelf: 'start', alignSelf: 'flex-start' }} onClick={() => { setMode(mode === 'in' ? 'forgot' : 'in'); setErr(''); setOk(''); }} data-testid="button-toggle-forgot">
        {mode === 'in' ? 'Forgot your password?' : <><ArrowLeft size={14} /> Back to sign in</>}
      </button>
      <div className="adm-sub"><a href={base} data-testid="link-visitor-site">Back to Glasgow Walks</a> · <a href={base + 'setup.sql'} data-testid="link-setup-sql">Database setup SQL</a></div>
      <details className="adm-setup" data-testid="details-owner-setup">
        <summary>First-time setup for the project owner</summary>
        <ol>
          <li>In your Supabase project, open SQL Editor. Copy the <a href={base + 'setup.sql'} target="_blank" rel="noreferrer">setup SQL</a> into a new query and run it. This creates the catalogue, seeds 27 sights once, and restricts editing to approved accounts.</li>
          <li>Open Authentication → Users and create your administrator account with your own email and password. Confirm the account in the dashboard.</li>
          <li>Copy the <a href={base + 'grant-admin.sql'} target="_blank" rel="noreferrer" data-testid="link-grant-admin">admin access SQL</a> into SQL Editor, replace <code>REPLACE_WITH_ADMIN_EMAIL</code> with that account’s email, then run it.</li>
          <li>Return here and sign in. Creating an account alone does not grant editing access.</li>
        </ol>
        <p>Already set up the original four-category catalogue? Run the <a href={base + 'categories-upgrade.sql'} target="_blank" rel="noreferrer">category upgrade SQL</a> once to enable custom categories. Your attractions and admin access are preserved.</p>
        <p>Only the Supabase project owner can run these setup steps. No private key or administrator password belongs in the website’s configuration.</p>
      </details>
    </AuthFrame>
  );
}
