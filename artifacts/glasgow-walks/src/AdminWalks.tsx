import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { listManagedWalks, deleteWalk, WalkSetupError, type ManagedWalk } from './walk-store';
import { CatalogueError, listManagedAttractions, listAttractionCategories, type ManagedAttraction } from './attraction-store';
import AdminWalkEditor, { useTrap } from './AdminWalkEditor';
import './admin-walks.css';

type Editing = { walk?: ManagedWalk; key: number } | null;

function DeleteDialog({ walk, busy, err, onCancel, onConfirm }: { walk: ManagedWalk; busy: boolean; err: string; onCancel: () => void; onConfirm: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const cancel = useRef(onCancel); cancel.current = onCancel;
  const busyRef = useRef(busy); busyRef.current = busy;
  const esc = useCallback(() => { if (!busyRef.current) cancel.current(); }, []);
  useTrap(ref, esc);
  return (
    <div className="adm-ov center" role="presentation">
      <div ref={ref} data-walk-trap tabIndex={-1} className="adm-dlg walk-ov-trap" role="alertdialog" aria-modal="true" aria-labelledby="walk-dl-t" data-testid="walk-dialog-delete">
        <h2 id="walk-dl-t">Delete {walk.title}?</h2>
        <p>This removes the curated walk permanently. Source attractions are not affected. To hide it instead, save it as a draft.</p>
        {err && <div className="adm-msg err" role="alert" data-testid="walk-status-delete-error">{err}</div>}
        <div className="adm-dlg-acts">
          <button type="button" className="adm-btn" data-autofocus onClick={onCancel} disabled={busy} data-testid="walk-button-cancel-delete">Cancel</button>
          <button type="button" className="adm-btn warn" onClick={onConfirm} disabled={busy} data-testid="walk-button-confirm-delete">{busy ? 'Deleting…' : 'Delete permanently'}</button>
        </div>
      </div>
    </div>
  );
}

export default function AdminWalks() {
  const [items, setItems] = useState<ManagedWalk[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [setup, setSetup] = useState(false);
  const [q, setQ] = useState('');
  const [theme, setTheme] = useState('All');
  const [status, setStatus] = useState('All');
  const [editing, setEditing] = useState<Editing>(null);
  const [del, setDel] = useState<ManagedWalk | null>(null);
  const [delBusy, setDelBusy] = useState(false);
  const [delErr, setDelErr] = useState('');
  const [note, setNote] = useState('');
  const [fresh, setFresh] = useState('');
  const [categories, setCategories] = useState<string[]>([]);
  const [attractions, setAttractions] = useState<ManagedAttraction[]>([]);
  const [srcLoading, setSrcLoading] = useState(true);
  const [srcError, setSrcError] = useState('');
  const alive = useRef(true);
  const seq = useRef(0);
  const srcSeq = useRef(0);
  const keyN = useRef(0);
  const editingRef = useRef<Editing>(null);
  editingRef.current = editing;
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const load = useCallback(async () => {
    const n = ++seq.current;
    setLoading(true); setError(''); setSetup(false);
    try {
      const rows = await listManagedWalks();
      if (alive.current && n === seq.current) setItems(rows);
    } catch (e) {
      if (alive.current && n === seq.current) {
        setError(e instanceof CatalogueError ? e.message : 'The walk list could not be loaded.');
        setSetup(e instanceof WalkSetupError);
      }
    } finally { if (alive.current && n === seq.current) setLoading(false); }
  }, []);
  const loadSources = useCallback(async () => {
    const n = ++srcSeq.current;
    setSrcLoading(true); setSrcError('');
    try {
      const [cats, attrs] = await Promise.all([listAttractionCategories(), listManagedAttractions()]);
      if (alive.current && n === srcSeq.current) { setCategories(cats); setAttractions(attrs); }
    } catch (e) {
      if (alive.current && n === srcSeq.current) setSrcError(e instanceof CatalogueError ? e.message : 'Categories and attractions could not be loaded.');
    } finally { if (alive.current && n === srcSeq.current) setSrcLoading(false); }
  }, []);
  useEffect(() => { void load(); void loadSources(); }, [load, loadSources]);

  const open = (walk?: ManagedWalk) => { setEditing({ walk, key: ++keyN.current }); if (srcError || !categories.length) void loadSources(); };

  const makeSaved = (key: number) => (saved: ManagedWalk, wasNew: boolean) => {
    if (!alive.current) return;
    seq.current++; setLoading(false); setError(''); setSetup(false);
    setItems(l => [...l.filter(i => i.id !== saved.id), saved].sort((a, b) => a.title.localeCompare(b.title)));
    if (editingRef.current?.key === key) { setEditing(null); setQ(''); setTheme('All'); setStatus('All'); }
    setFresh(saved.id);
    setNote(`${saved.title} was ${wasNew ? 'added' : 'updated'} and is ${saved.published ? 'live for visitors' : 'saved as a draft'}.`);
    window.setTimeout(() => alive.current && setFresh(''), 2500);
  };

  const confirmDelete = async () => {
    if (!del || delBusy) return;
    const target = del;
    setDelBusy(true); setDelErr('');
    try {
      await deleteWalk(target);
      if (!alive.current) return;
      seq.current++; setLoading(false);
      setItems(l => l.filter(i => i.id !== target.id));
      setNote(`${target.title} was deleted.`);
      if (editingRef.current?.walk?.id === target.id) setEditing(null);
      setDel(null);
    } catch (e) {
      if (alive.current) setDelErr(e instanceof CatalogueError ? e.message : 'The walk could not be deleted.');
    } finally { if (alive.current) setDelBusy(false); }
  };

  const themeOptions = useMemo(() => ['All', ...Array.from(new Set([...categories, ...items.map(i => i.theme)])).sort((a, b) => a.localeCompare(b))], [categories, items]);
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return items.filter(i => (theme === 'All' || i.theme === theme) && (status === 'All' || (status === 'Published') === i.published)
      && (!s || i.title.toLowerCase().includes(s) || i.subtitle.toLowerCase().includes(s)));
  }, [items, q, theme, status]);
  const sqlHref = `${import.meta.env.BASE_URL}curated-walks-upgrade.sql`;

  return (
    <section className="adm-main" aria-labelledby="walk-h" style={{ padding: 0 }} data-testid="walk-admin">
      <div className="adm-head">
        <div><div className="eyebrow">Curated walks</div><h1 id="walk-h">Routes visitors can follow</h1></div>
        <div className="adm-acts">
          <button className="adm-btn" onClick={() => { void load(); void loadSources(); }} disabled={loading} data-testid="walk-button-refresh"><RefreshCw size={15} /> Refresh</button>
          <button className="adm-btn pri" onClick={() => open()} disabled={setup} data-testid="walk-button-add"><Plus size={15} /> Add walk</button>
        </div>
      </div>
      <div className="adm-tools">
        <input className="adm-in" type="search" placeholder="Search by title or subtitle" aria-label="Search walks" value={q} onChange={e => setQ(e.target.value)} data-testid="walk-input-search" />
        <select className="adm-in" aria-label="Filter by category" value={theme} onChange={e => setTheme(e.target.value)} data-testid="walk-select-theme">
          {themeOptions.map(t => <option key={t}>{t}</option>)}
        </select>
        <select className="adm-in" aria-label="Filter by status" value={status} onChange={e => setStatus(e.target.value)} data-testid="walk-select-status">
          {['All', 'Published', 'Draft'].map(t => <option key={t}>{t}</option>)}
        </select>
      </div>
      <div aria-live="polite">{note && <div className="adm-msg ok" data-testid="walk-status-note">{note}</div>}</div>
      {error && (
        <div className="adm-msg err" role="alert" data-testid="walk-status-list-error">
          <p style={{ margin: '0 0 8px' }}>{error}</p>
          {setup && <p style={{ margin: '0 0 8px' }}>Run the upgrade script once in the Supabase SQL editor, then retry.{' '}
            <a href={sqlHref} download="curated-walks-upgrade.sql" style={{ textDecoration: 'underline' }} data-testid="walk-link-sql"><Download size={13} style={{ verticalAlign: '-2px' }} /> Download curated-walks-upgrade.sql</a></p>}
          <button className="adm-btn" onClick={() => void load()} disabled={loading} data-testid="walk-button-retry-list">Try again</button>
        </div>
      )}
      <p className="adm-count" data-testid="walk-text-count"><span>{shown.length} of {items.length} walks</span><span>Drafts are hidden from visitors</span></p>
      {loading && items.length === 0 ? <div data-testid="walk-status-loading">{[0, 1, 2].map(n => <div className="adm-skel" key={n} />)}</div>
        : shown.length === 0 && !error ? (
          <div className="adm-empty" data-testid="walk-status-empty">
            <h3>{items.length ? 'Nothing matches those filters' : 'No curated walks yet'}</h3>
            <p>{items.length ? 'Try a different search or clear the filters.' : 'Compose the first route from your published attractions.'}</p>
            {items.length ? <button className="adm-btn" onClick={() => { setQ(''); setTheme('All'); setStatus('All'); }} data-testid="walk-button-clear-filters">Clear filters</button>
              : <button className="adm-btn pri" onClick={() => open()} data-testid="walk-button-add-first">Add walk</button>}
          </div>
        ) : (
          <div className="adm-list" data-testid="walk-list" style={{ opacity: loading ? 0.6 : 1, transition: 'opacity .2s' }}>
            {shown.map(i => (
              <article key={i.id} className={`adm-row${fresh === i.id ? ' fresh' : ''}`} data-testid={`walk-row-${i.id}`}>
                <div>
                  <div className="adm-kick"><span>{i.theme}</span><span className={`adm-badge${i.published ? '' : ' draft'}`}>{i.published ? 'Published' : 'Draft'}</span></div>
                  <h3>{i.title}</h3><p>{i.subtitle || 'No subtitle yet'}</p>
                  <div className="walk-grid-meta"><span>{i.stops.length} stops</span><span>{i.minutes > 0 ? `${i.distanceKm.toFixed(1)} km · ${i.minutes} min` : 'Not measured'}</span></div>
                </div>
                <div className="adm-acts">
                  <button className="adm-ibtn" onClick={() => open(i)} aria-label={`Edit ${i.title}`} data-testid={`walk-button-edit-${i.id}`}><Pencil size={16} /></button>
                  <button className="adm-ibtn" onClick={() => { setDelErr(''); setDel(i); }} aria-label={`Delete ${i.title}`} data-testid={`walk-button-delete-${i.id}`}><Trash2 size={16} /></button>
                </div>
              </article>
            ))}
          </div>
        )}

      {editing && (
        <AdminWalkEditor key={editing.key} walk={editing.walk} categories={categories} attractions={attractions}
          attractionsLoading={srcLoading} attractionsError={srcError} onReloadSources={() => void loadSources()}
          onSaved={makeSaved(editing.key)} onClose={() => setEditing(cur => (cur?.key === editing.key ? null : cur))} />
      )}
      {del && <DeleteDialog walk={del} busy={delBusy} err={delErr} onCancel={() => setDel(null)} onConfirm={() => void confirmDelete()} />}
    </section>
  );
}
