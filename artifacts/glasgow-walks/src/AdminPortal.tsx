import { useCallback, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { LogOut } from 'lucide-react';
import './admin.css';
import { supabase, checkAdmin, CatalogueError, initialPasswordRecovery } from './attraction-store';
import { AuthFrame, Brand, Recovery, SignIn } from './AdminAuth';
import AdminManager from './AdminManager';
import AdminWalks from './AdminWalks';

type Gate = { state: 'idle' | 'checking' | 'admin' | 'denied' | 'error'; userId?: string; message?: string; setup?: boolean };
const base = import.meta.env.BASE_URL;
const looksLikeRecovery = () => initialPasswordRecovery || /type=recovery/.test(window.location.hash + window.location.search);

function Message({ title, children, testid }: { title: string; children: React.ReactNode; testid: string }) {
  return (
    <AuthFrame>
      <div className="eyebrow">Admin</div>
      <h1>{title}</h1>
      <div data-testid={testid} role="status">{children}</div>
    </AuthFrame>
  );
}

export default function AdminPortal() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [recovery, setRecovery] = useState(looksLikeRecovery);
  const [gate, setGate] = useState<Gate>({ state: 'idle' });
  const [retry, setRetry] = useState(0);
  const [outErr, setOutErr] = useState('');
  const [notice, setNotice] = useState('');
  const [section, setSection] = useState<'attractions' | 'walks'>('attractions');

  useEffect(() => {
    if (!supabase) { setReady(true); return; }
    let active = true;
    supabase.auth.getSession().then(({ data }) => { if (active) { setSession(data.session); setReady(true); } })
      .catch(() => { if (active) setReady(true); });
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      if (event === 'PASSWORD_RECOVERY') setRecovery(true);
      if (event === 'SIGNED_OUT') setRecovery(false);
      setSession(next);
      setOutErr('');
      setReady(true);
    });
    return () => { active = false; data.subscription.unsubscribe(); };
  }, []);

  const userId = session?.user.id ?? null;
  useEffect(() => {
    setGate(current => userId
      ? current.userId === userId && current.state === 'admin' ? current : { state: 'checking', userId }
      : { state: 'idle' });
    if (!userId || recovery) return;
    let active = true;
    checkAdmin().then((ok) => { if (active) setGate({ state: ok ? 'admin' : 'denied', userId }); })
      .catch((e) => {
        if (!active) return;
        const message = e instanceof CatalogueError ? e.message : 'Permissions could not be checked.';
        setGate({ state: 'error', userId, message, setup: message.startsWith('Attraction storage is not set up') });
      });
    return () => { active = false; };
  }, [userId, session?.access_token, recovery, retry]);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    const { error } = await supabase.auth.signOut();
    if (error) setOutErr('Sign-out failed. Check your connection and try again.');
  }, []);

  if (!supabase) return (
    <div className="adm"><Message title="Supabase is not configured" testid="status-not-configured">
      <div className="adm-msg err">Add the project URL and public publishable key, then rebuild the website.</div>
      <a className="adm-btn" href={base} data-testid="link-home-fallback">Back to Wander Glasgow</a></Message></div>
  );
  if (!ready) return <div className="adm"><div className="adm-main"><div className="adm-skel" data-testid="status-auth-loading" /></div></div>;
  if (recovery && session) return <div className="adm"><Recovery onDone={() => { setRecovery(false); setNotice('Password updated.'); }} /></div>;
  if (!session) return <div className="adm"><SignIn notice={notice} /></div>;

  const signOutBtn = (
    <button className="adm-btn" onClick={() => void signOut()} data-testid="button-signout"><LogOut size={15} /> Sign out</button>
  );
  const err = outErr && <div className="adm-msg err" role="alert" data-testid="status-signout-error">{outErr}</div>;

  if (gate.userId !== userId || gate.state === 'idle' || gate.state === 'checking') return (
    <div className="adm"><Message title="Checking your access" testid="status-checking"><div className="adm-skel" /></Message></div>
  );
  if (gate.state === 'denied') return (
    <div className="adm"><Message title="Access denied" testid="status-denied">
      <p style={{ lineHeight: 1.6 }}>Signed in as <strong data-testid="text-denied-email">{session.user.email}</strong>. This account is not authorised to manage attractions or curated walks.</p>
      {err}<div className="adm-acts">{signOutBtn}<a className="adm-btn" href={base}>Visit Wander Glasgow</a></div></Message></div>
  );
  if (gate.state === 'error') return (
    <div className="adm"><Message title={gate.setup ? 'Storage setup needed' : 'Could not verify access'} testid="status-gate-error">
      <div className="adm-msg err" role="alert">{gate.message}</div>
      {gate.setup && <p style={{ lineHeight: 1.6, fontSize: 14 }}>The project owner should run the Supabase setup SQL (<code>setup.sql</code>) in the Supabase SQL editor and authorise an administrator account, then retry.</p>}
      {err}<div className="adm-acts"><button className="adm-btn pri" onClick={() => setRetry((n) => n + 1)} data-testid="button-retry-access">Try again</button>{signOutBtn}</div></Message></div>
  );

  return (
    <div className="adm">
      <header className="adm-top">
        <Brand />
        <div className="adm-top-r">
          <span className="adm-who" data-testid="text-session-email">{session.user.email}</span>
          {signOutBtn}
        </div>
      </header>
      {err && <div style={{ padding: '16px clamp(16px,4vw,56px) 0' }}>{err}</div>}
      <nav className="adm-section-tabs" aria-label="Administration sections">
        <button className={`adm-btn${section === 'attractions' ? ' pri' : ''}`} aria-pressed={section === 'attractions'} onClick={() => setSection('attractions')} data-testid="admin-tab-attractions">Attractions</button>
        <button className={`adm-btn${section === 'walks' ? ' pri' : ''}`} aria-pressed={section === 'walks'} onClick={() => setSection('walks')} data-testid="admin-tab-walks">Curated walks</button>
      </nav>
      {section === 'attractions' ? <AdminManager key={userId} onSignOut={signOut} /> : <div className="adm-main"><AdminWalks key={userId} /></div>}
    </div>
  );
}
