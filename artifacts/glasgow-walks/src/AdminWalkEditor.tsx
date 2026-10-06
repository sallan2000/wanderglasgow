import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { ArrowDown, ArrowUp, Eye, Plus, Ruler, Save, Send, Trash2, X } from 'lucide-react';
import { saveWalk, measureCuratedWalk, type ManagedWalk, type WalkGeometry } from './walk-store';
import AdminWalkMap from './AdminWalkMap';
import { CatalogueError, type ManagedAttraction } from './attraction-store';
import type { Stop } from './tours';
import './admin-walks.css';

const FOCUSABLE = 'a[href],button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex]:not([tabindex="-1"])';

/** Traps Tab inside `ref`, handles Escape, restores focus on unmount. */
export function useTrap(ref: RefObject<HTMLElement | null>, onEscape: () => void) {
  const esc = useRef(onEscape);
  esc.current = onEscape;
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const el = ref.current;
    if (el) (el.querySelector<HTMLElement>('[data-autofocus]') ?? el.querySelector<HTMLElement>(FOCUSABLE) ?? el).focus();
    const onKey = (e: KeyboardEvent) => {
      const root = ref.current;
      if (!root) return;
      // Only the top-most trap reacts.
      const traps = document.querySelectorAll('[data-walk-trap]');
      if (traps[traps.length - 1] !== root) return;
      if (e.key === 'Escape') { e.preventDefault(); esc.current(); return; }
      if (e.key !== 'Tab') return;
      const items = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(n => n.offsetParent !== null);
      if (!items.length) { e.preventDefault(); root.focus(); return; }
      const first = items[0], last = items[items.length - 1];
      if (!root.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
      else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); if (prev && document.contains(prev)) prev.focus(); };
  }, [ref]);
}

type Row = Stop & { uid: number };
type Props = {
  walk?: ManagedWalk;
  categories: string[];
  attractions: ManagedAttraction[];
  attractionsLoading: boolean;
  attractionsError: string;
  onReloadSources: () => void;
  onSaved: (saved: ManagedWalk, wasNew: boolean) => void;
  onClose: () => void;
};
const stopKey = (s: { name: string; lat: number; lon: number }) => `${s.name.trim().toLowerCase()}|${s.lat}|${s.lon}`;
const snap = (s: Stop) => ({ name: s.name, place: s.place, lat: s.lat, lon: s.lon, story: s.story, ...(s.access ? { access: { ...s.access } } : {}) });

export default function AdminWalkEditor({ walk, categories, attractions, attractionsLoading, attractionsError, onReloadSources, onSaved, onClose }: Props) {
  const uid = useRef(0);
  const init = useRef({
    title: walk?.title ?? '', subtitle: walk?.subtitle ?? '', theme: walk?.theme ?? '',
    stops: (walk?.stops ?? []).map(snap),
  }).current;
  const [title, setTitle] = useState(init.title);
  const [subtitle, setSubtitle] = useState(init.subtitle);
  const [theme, setTheme] = useState(init.theme);
  const [stops, setStops] = useState<Row[]>(() => init.stops.map(s => ({ ...s, uid: ++uid.current })));
  const [metrics, setMetrics] = useState({ km: walk?.distanceKm ?? 0, min: walk?.minutes ?? 0 });
  const [metricsOk, setMetricsOk] = useState(!!walk && walk.stops.length >= 2 && walk.minutes > 0 && walk.distanceKm > 0);
  const [measuring, setMeasuring] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [tried, setTried] = useState(false);
  const [q, setQ] = useState('');
  const [preview, setPreview] = useState(false);
  const [route, setRoute] = useState<{ key: string; geometry: WalkGeometry } | null>(null);
  const [routeError, setRouteError] = useState('');
  const routeKey = JSON.stringify(stops.map(s => [s.uid, s.lat, s.lon]));
  const currentRouteKey = useRef(routeKey);
  currentRouteKey.current = routeKey;
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const mounted = useRef(true);
  const ctrl = useRef<AbortController | null>(null);
  const measureSeq = useRef(0);
  const panel = useRef<HTMLElement>(null);
  const discard = useRef<HTMLDivElement>(null);

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; ctrl.current?.abort(); }; }, []);

  const dirty = title !== init.title || subtitle !== init.subtitle || theme !== init.theme
    || JSON.stringify(stops.map(({ uid: _u, ...s }) => s)) !== JSON.stringify(init.stops)
    || metrics.km !== (walk?.distanceKm ?? 0) || metrics.min !== (walk?.minutes ?? 0);
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);
  useEffect(() => { const o = document.body.style.overflow; document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = o; }; }, []);

  const requestClose = useCallback(() => { if (busy) return; if (dirty) setConfirmDiscard(true); else onClose(); }, [busy, dirty, onClose]);
  const reqRef = useRef(requestClose); reqRef.current = requestClose;
  const onEsc = useCallback(() => reqRef.current(), []);
  useTrap(panel, onEsc);
  const closeDiscard = useCallback(() => setConfirmDiscard(false), []);

  const invalidate = () => {
    ctrl.current?.abort(); measureSeq.current++; setMeasuring(false);
    setMetrics({ km: 0, min: 0 }); setMetricsOk(false);
    setRoute(null); setRouteError('');
  };
  // Guard coordinate changes as well as add/remove/reorder actions.
  const previousRouteKey = useRef(routeKey);
  useEffect(() => {
    if (previousRouteKey.current !== routeKey) {
      previousRouteKey.current = routeKey;
      invalidate();
    }
  }, [routeKey]);
  const changeStops = (fn: (s: Row[]) => Row[]) => { setStops(fn); invalidate(); };
  const add = (a: ManagedAttraction) => {
    if (stops.length >= 30 || stops.some(s => stopKey(s) === stopKey(a))) return;
    changeStops(s => [...s, { uid: ++uid.current, name: a.name, place: a.place, lat: a.lat, lon: a.lon, story: a.description, ...(a.access ? { access: { ...a.access } } : {}) }]);
  };
  const move = (i: number, d: number) => changeStops(s => { const n = [...s]; const j = i + d; if (j < 0 || j >= n.length) return s; [n[i], n[j]] = [n[j], n[i]]; return n; });
  const remove = (i: number) => changeStops(s => s.filter((_, k) => k !== i));
  const setStory = (id: number, story: string) => setStops(s => s.map(r => r.uid === id ? { ...r, story } : r));

  const plain = (): Stop[] => stops.map(({ uid: _u, ...s }) => s);
  const measure = async (): Promise<{ distanceKm: number; minutes: number } | null> => {
    ctrl.current?.abort();
    const c = new AbortController(); ctrl.current = c;
    const n = ++measureSeq.current;
    const key = routeKey;
    setMeasuring(true); setErr(''); setRouteError('');
    try {
      const r = await measureCuratedWalk(plain(), c.signal);
      if (!mounted.current || c.signal.aborted || n !== measureSeq.current || key !== currentRouteKey.current) return null;
      setMetrics({ km: r.distanceKm, min: r.minutes }); setMetricsOk(true);
      setRoute({ key, geometry: r.geometry });
      return r;
    } catch (e) {
      if (mounted.current && n === measureSeq.current && key === currentRouteKey.current && !c.signal.aborted) {
        const message = e instanceof CatalogueError ? e.message : 'The walking route could not be measured. Try again.';
        setErr(message); setRouteError(message); setRoute(null);
      }
      return null;
    } finally { if (mounted.current && n === measureSeq.current) setMeasuring(false); }
  };

  const t = title.trim().length, sub = subtitle.trim().length;
  const problems = (publish: boolean) => {
    const p: Record<string, string> = {};
    if (t < 3 || t > 200) p.title = 'Enter a title of 3 to 200 characters.';
    if (subtitle.length > 1000) p.subtitle = 'Keep the subtitle under 1,000 characters.';
    else if (publish && sub < 10) p.subtitle = 'Write at least 10 characters to publish.';
    if (!theme || !categories.includes(theme)) p.theme = 'Choose a category.';
    if (stops.length > 30) p.stops = 'A walk can have at most 30 stops.';
    else if (publish && stops.length < 2) p.stops = 'Add at least 2 stops to publish.';
    if (stops.some(s => s.story.trim().length < 10 || s.story.trim().length > 5000)) p.stories = 'Every stop needs a story of 10 to 5,000 characters.';
    return p;
  };
  const live = problems(true);
  const show = (k: string) => tried && live[k];

  const submit = async (publish: boolean) => {
    if (busy || measuring) return;
    setTried(true); setErr('');
    const p = problems(publish);
    if (Object.keys(p).length) { setErr('Fix the highlighted fields, then save again.'); return; }
    setBusy(true);
    try {
      let km = metrics.km, min = metrics.min;
      if (publish && !metricsOk) {
        const r = await measure();
        if (!r) { if (mounted.current) setErr(e => e || 'Publishing needs a successful walking measurement. Try again.'); return; }
        km = r.distanceKm; min = r.minutes;
      }
      if (!metricsOk && !publish) { km = 0; min = 0; }
      const saved = await saveWalk({ title: title.trim(), subtitle: subtitle.trim(), theme, distanceKm: km, minutes: min, stops: plain().map(s => ({ ...s, story: s.story.trim() })), published: publish }, walk);
      onSaved(saved, !walk);
    } catch (e) {
      if (mounted.current) setErr(e instanceof CatalogueError ? e.message : 'The walk could not be saved. Your changes are still here; try again.');
    } finally { if (mounted.current) setBusy(false); }
  };

  const used = useMemo(() => new Set(stops.map(stopKey)), [stops]);
  const matches = useMemo(() => {
    const s = q.trim().toLowerCase();
    return attractions.filter(a => a.published && (!s || a.name.toLowerCase().includes(s) || a.place.toLowerCase().includes(s))).slice(0, 40);
  }, [attractions, q]);
  const locked = busy;
  const hasPublished = attractions.some(a => a.published);

  return (
    <div className="adm-ov" onMouseDown={e => { if (e.target === e.currentTarget) requestClose(); }} data-testid="walk-overlay-editor">
      <section ref={panel} data-walk-trap className="adm-drawer walk-ov-trap" role="dialog" aria-modal="true" aria-labelledby="walk-ed-t" tabIndex={-1}>
        <div className="drawer-top" style={{ marginBottom: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="eyebrow">{walk ? 'Edit curated walk' : 'New curated walk'}</div>
          <button type="button" className="adm-ibtn" onClick={requestClose} disabled={busy} aria-label="Close editor" data-testid="walk-button-close"><X size={18} /></button>
        </div>
        <h2 id="walk-ed-t" style={{ font: '600 clamp(30px,5vw,44px)/1 var(--app-font-serif)', letterSpacing: '-.05em', margin: 0 }}>{walk ? walk.title : 'Compose a walk'}</h2>
        <form className="adm-form" noValidate onSubmit={e => { e.preventDefault(); void submit(false); }} data-testid="walk-form">
          <fieldset className="adm-fieldset adm-form" disabled={locked} style={{ marginTop: 0 }}>
            <div><label className="adm-lab" htmlFor="walk-title">Title</label>
              <input id="walk-title" className={`adm-in${show('title') ? ' bad' : ''}`} value={title} maxLength={200} onChange={e => setTitle(e.target.value)} data-testid="walk-input-title" />
              {show('title') && <p className="adm-err">{live.title}</p>}</div>
            <div><label className="adm-lab" htmlFor="walk-sub">Subtitle</label>
              <textarea id="walk-sub" className={`adm-in${show('subtitle') ? ' bad' : ''}`} style={{ minHeight: 90 }} value={subtitle} onChange={e => setSubtitle(e.target.value)} data-testid="walk-input-subtitle" />
              <p className="adm-hint">{sub.toLocaleString()} / 1,000 characters (minimum 10 to publish)</p>
              {show('subtitle') && <p className="adm-err">{live.subtitle}</p>}</div>
            <div><span className="adm-lab" id="walk-cat">Category</span>
              {categories.length === 0 ? <div className="adm-msg err" role="alert" data-testid="walk-status-no-categories">No categories are available, so a walk cannot be created yet. <button type="button" className="adm-btn link" onClick={onReloadSources} data-testid="walk-button-retry-categories">Reload categories</button></div> : (
                <div className="adm-themes" role="radiogroup" aria-labelledby="walk-cat">
                  {categories.map(c => <button key={c} type="button" role="radio" aria-checked={theme === c} className="adm-theme" onClick={() => setTheme(c)} data-testid={`walk-radio-category-${c.toLowerCase().replace(/\s+/g, '-')}`}>{c}</button>)}
                </div>)}
              {theme && !categories.includes(theme) && <p className="adm-hint">The saved category "{theme}" no longer exists. Choose another.</p>}
              {show('theme') && <p className="adm-err">{live.theme}</p>}</div>

            <div>
              <span className="adm-lab">Stops ({stops.length} / 30)</span>
              <p className="adm-hint" style={{ marginTop: 0 }}>Stops are copied from published attractions as snapshots. Later edits or deletions of an attraction never rewrite this walk; edit the stories here instead.</p>
              <input className="adm-in" type="search" style={{ marginTop: 10 }} placeholder="Search published attractions" aria-label="Search published attractions" value={q} onChange={e => setQ(e.target.value)} data-testid="walk-input-attraction-search" />
              {attractionsError ? <div className="adm-msg err" role="alert" style={{ marginTop: 8 }} data-testid="walk-status-attractions-error">{attractionsError} <button type="button" className="adm-btn link" onClick={onReloadSources} data-testid="walk-button-retry-attractions">Try again</button></div>
                : attractionsLoading && !attractions.length ? <div className="adm-skel" data-testid="walk-status-attractions-loading" />
                : !hasPublished ? <div className="adm-msg" style={{ marginTop: 8 }} data-testid="walk-status-no-attractions">No published attractions exist yet. Publish some attractions, then refresh. <button type="button" className="adm-btn link" onClick={onReloadSources}>Refresh</button></div>
                : (
                  <div className="walk-pick" data-testid="walk-list-attraction-results">
                    {matches.length === 0 && <p className="adm-hint" style={{ padding: 8 }}>No published attractions match.</p>}
                    {matches.map(a => {
                      const dup = used.has(stopKey(a));
                      return (
                        <div className="walk-pick-row" key={a.id}>
                          <div><strong>{a.name}</strong><span className="adm-hint">{a.theme}{a.place ? ` · ${a.place}` : ''}</span></div>
                          <button type="button" className="adm-btn" disabled={dup || stops.length >= 30} onClick={() => add(a)} aria-label={`Add ${a.name}`} data-testid={`walk-button-add-stop-${a.id}`}><Plus size={15} /> {dup ? 'Added' : 'Add'}</button>
                        </div>
                      );
                    })}
                  </div>)}
              {show('stops') && <p className="adm-err">{live.stops}</p>}
              {show('stories') && <p className="adm-err">{live.stories}</p>}
            </div>

            {stops.length === 0 ? <div className="adm-empty" style={{ padding: 28 }} data-testid="walk-status-no-stops"><p style={{ margin: 0 }}>No stops yet. Drafts may be saved empty; publishing needs 2 to 30.</p></div> : (
              <ol className="walk-stops" data-testid="walk-list-stops">
                {stops.map((s, i) => (
                  <li key={s.uid} className="walk-stop" data-testid={`walk-stop-${i}`}>
                    <div className="walk-stop-h">
                      <div><div className="adm-kick">Stop {i + 1}</div><h4>{s.name}</h4><span className="adm-hint">{s.place || 'No address given'}</span></div>
                      <div className="adm-acts">
                        <button type="button" className="adm-ibtn" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Move ${s.name} up`} data-testid={`walk-button-up-${i}`}><ArrowUp size={16} /></button>
                        <button type="button" className="adm-ibtn" disabled={i === stops.length - 1} onClick={() => move(i, 1)} aria-label={`Move ${s.name} down`} data-testid={`walk-button-down-${i}`}><ArrowDown size={16} /></button>
                        <button type="button" className="adm-ibtn" onClick={() => remove(i)} aria-label={`Remove ${s.name}`} data-testid={`walk-button-remove-${i}`}><Trash2 size={16} /></button>
                      </div>
                    </div>
                    <label className="adm-lab" htmlFor={`walk-story-${s.uid}`}>Story</label>
                    <textarea id={`walk-story-${s.uid}`} className={`adm-in${tried && (s.story.trim().length < 10 || s.story.trim().length > 5000) ? ' bad' : ''}`} value={s.story} onChange={e => setStory(s.uid, e.target.value)} data-testid={`walk-input-story-${i}`} />
                    <p className="adm-hint" style={{ margin: 0 }}>{s.story.trim().length.toLocaleString()} / 5,000 characters (minimum 10)</p>
                  </li>
                ))}
              </ol>
            )}

            <div className="walk-metrics" data-testid="walk-status-metrics">
              <button type="button" className="adm-btn" disabled={stops.length < 2 || measuring} onClick={() => void measure()} data-testid="walk-button-measure"><Ruler size={15} /> {measuring ? 'Measuring…' : 'Measure walk'}</button>
              <span className="adm-sub" aria-live="polite">{metricsOk ? `${metrics.km.toFixed(1)} km · ${metrics.min} min walking` : stops.length < 2 ? 'Add 2 stops to measure.' : 'Not measured for this order.'}</span>
              <p className="adm-hint" style={{ flexBasis: '100%', margin: 0 }}>Walking-network distance and time between stops, in order, starting at the first stop with no GPS and no return loop. Time spent at stops is excluded. Changing the stops resets the measurement; publishing requires a current one.</p>
            </div>

            {(stops.length > 0 || preview) && <button type="button" className="adm-btn" aria-expanded={preview} aria-controls="walk-preview" onClick={() => {
              setPreview(p => !p);
              if (!preview && stops.length >= 2 && route?.key !== routeKey && !measuring) void measure();
            }} data-testid="walk-button-preview"><Eye size={15} /> {preview ? 'Hide preview' : 'Preview map & stops'}</button>}
            {preview && <section id="walk-preview" className="walk-preview-section" aria-label="Walk preview">
              <h3>Map preview</h3>
              <AdminWalkMap stops={stops} geometry={route?.key === routeKey ? route.geometry : null} />
              <div aria-live="polite" data-testid="walk-status-route-preview">
                {measuring ? <p className="adm-hint" role="status">Calculating the walking-network route…</p>
                  : routeError ? <div className="adm-msg err" role="alert">{routeError}</div>
                  : route?.key === routeKey ? <p className="adm-hint">Walking route shown in stop order · {metrics.km.toFixed(1)} km · {metrics.min} min.</p>
                  : <p className="adm-hint">{stops.length < 2 ? 'Add at least 2 stops to preview a walking route.' : 'Stops changed or no route has been loaded. Measure the walk to show the current walking route. Saved distance alone does not include a map route.'}</p>}
              </div>
              {stops.length >= 2 && !measuring && route?.key !== routeKey && <button type="button" className="adm-btn" onClick={() => void measure()} data-testid="walk-button-preview-route">{routeError ? 'Retry walking route' : 'Calculate walking route'}</button>}
              <h3>Ordered stops</h3>
              <ol className="walk-preview" data-testid="walk-list-preview">{stops.map(s => <li key={s.uid}><strong>{s.name}</strong><br />{s.story}</li>)}</ol>
            </section>}

            <div aria-live="polite">{err && <div className="adm-msg err" role="alert" data-testid="walk-status-save-error">{err}</div>}</div>
            <div className="adm-bar">
              <button type="button" className="adm-btn pri" disabled={busy || measuring || !categories.length} onClick={() => void submit(true)} data-testid="walk-button-publish"><Send size={15} /> {busy ? 'Saving…' : walk?.published ? 'Update published' : 'Publish'}</button>
              <button type="submit" className="adm-btn" disabled={busy || measuring || !categories.length} data-testid="walk-button-save-draft"><Save size={15} /> {walk?.published ? 'Unpublish as draft' : 'Save draft'}</button>
              <button type="button" className="adm-btn" onClick={requestClose} disabled={busy} data-testid="walk-button-cancel">{dirty ? 'Discard' : 'Close'}</button>
              {dirty && <span className="adm-sub" style={{ alignSelf: 'center' }} data-testid="walk-status-unsaved">Unsaved changes</span>}
            </div>
          </fieldset>
        </form>
      </section>
      {confirmDiscard && (
        <div className="adm-ov center" role="presentation">
          <div ref={discard} data-walk-trap className="adm-dlg walk-ov-trap" role="alertdialog" aria-modal="true" aria-labelledby="walk-dd-t" tabIndex={-1} data-testid="walk-dialog-discard">
            <DiscardTrap target={discard} onEscape={closeDiscard} />
            <h2 id="walk-dd-t">Discard unsaved changes?</h2><p>Your edits to this walk have not been saved and will be lost.</p>
            <div className="adm-dlg-acts">
              <button type="button" className="adm-btn" data-autofocus onClick={closeDiscard} data-testid="walk-button-keep-editing">Keep editing</button>
              <button type="button" className="adm-btn warn" onClick={onClose} data-testid="walk-button-confirm-discard">Discard changes</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DiscardTrap({ target, onEscape }: { target: RefObject<HTMLElement | null>; onEscape: () => void }) {
  useTrap(target, onEscape);
  return null;
}
