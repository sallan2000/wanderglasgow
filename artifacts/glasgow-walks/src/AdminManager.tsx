import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MapPin, Pencil, Plus, RefreshCw, Tags, Trash2 } from 'lucide-react';
import { listManagedAttractions, deleteAttraction, listAttractionCategories, sortCategoryNames, CategorySetupError, CatalogueError, type ManagedAttraction } from './attraction-store';
import AdminEditor from './AdminEditor';
import AdminCategories from './AdminCategories';
import AdminStartingAreas from './AdminStartingAreas';
import { DEFAULT_CATEGORIES } from './tours';

type Editing = { item?: ManagedAttraction; key: number } | null;
type Props = { onSignOut: () => void };

export default function AdminManager({ onSignOut }: Props) {
  void onSignOut;
  const [items, setItems] = useState<ManagedAttraction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [theme, setTheme] = useState('All');
  const [status, setStatus] = useState('All');
  const [editing, setEditing] = useState<Editing>(null);
  const [dirty, setDirty] = useState(false);
  const [pending, setPending] = useState<(() => void) | null>(null);
  const [del, setDel] = useState<ManagedAttraction | null>(null);
  const [delBusy, setDelBusy] = useState(false);
  const [delErr, setDelErr] = useState('');
  const [note, setNote] = useState('');
  const [fresh, setFresh] = useState('');
  const [categories, setCategories] = useState<string[]>(DEFAULT_CATEGORIES);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [categoryError, setCategoryError] = useState('');
  const [categoryNeedsSetup, setCategoryNeedsSetup] = useState(false);
  const [startOpen, setStartOpen] = useState(false);
  const [startDirty, setStartDirty] = useState(false);
  const categorySeq = useRef(0);
  const alive = useRef(true);
  const seq = useRef(0);
  const keyN = useRef(0);
  const currentEditing = useRef(editing);
  currentEditing.current = editing;
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const load = useCallback(async () => {
    const n = ++seq.current;
    setLoading(true); setError('');
    try {
      const rows = await listManagedAttractions();
      if (alive.current && n === seq.current) setItems(rows);
    } catch (e) {
      if (alive.current && n === seq.current) setError(e instanceof CatalogueError ? e.message : 'The attraction list could not be loaded.');
    } finally { if (alive.current && n === seq.current) setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const loadCategories = useCallback(async () => {
    const n = ++categorySeq.current;
    setCategoriesLoading(true);
    try {
      const names = await listAttractionCategories();
      if (alive.current && n === categorySeq.current) {
        setCategories(names); setCategoryError(''); setCategoryNeedsSetup(false);
      }
    } catch (e) {
      if (alive.current && n === categorySeq.current) {
        setCategoryError(e instanceof CatalogueError ? e.message : 'Categories could not be loaded. Try again.');
        setCategoryNeedsSetup(e instanceof CategorySetupError);
      }
    } finally { if (alive.current && n === categorySeq.current) setCategoriesLoading(false); }
  }, []);
  useEffect(() => { void loadCategories(); }, [loadCategories]);

  const categoryAdded = (name: string) => {
    if (!alive.current) return;
    categorySeq.current++;
    setCategoriesLoading(false);
    setCategoryError(''); setCategoryNeedsSetup(false);
    setCategories(current => sortCategoryNames([...current, name]));
  };
  const categoryOptions = useMemo(() => sortCategoryNames([...categories, ...items.map(item => item.theme)]), [categories, items]);

  useEffect(() => {
    if (!dirty && !startDirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty, startDirty]);
  useEffect(() => {
    if (!editing) return;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, [editing]);

  const guard = (action: () => void) => { if (dirty) setPending(() => action); else action(); };
  const open = (item?: ManagedAttraction) => guard(() => { setDirty(false); setEditing({ item, key: ++keyN.current }); });
  const close = () => guard(() => { setDirty(false); setEditing(null); });
  const onDirty = useCallback((d: boolean) => setDirty(d), []);

  const onSaved = (saved: ManagedAttraction, wasNew: boolean) => {
    if (!alive.current) return;
    // An older refresh must not overwrite a successful mutation.
    seq.current++; setLoading(false);
    setItems((list) => [...list.filter(i => i.id !== saved.id), saved].sort((a, b) => a.name.localeCompare(b.name)));
    // A late save can update the list, but must never dismiss a different editor.
    if (editing?.key === currentEditing.current?.key) {
      setDirty(false); setEditing(null);
      setQ(''); setTheme('All'); setStatus('All');
    }
    setFresh(saved.id);
    setNote(`${saved.name} was ${wasNew ? 'added' : 'updated'} and is ${saved.published ? 'live for visitors' : 'saved as a draft'}.`);
    window.setTimeout(() => alive.current && setFresh(''), 2500);
  };

  const confirmDelete = async () => {
    if (!del) return;
    setDelBusy(true); setDelErr('');
    try {
      await deleteAttraction(del);
      if (!alive.current) return;
      setItems((l) => l.filter((i) => i.id !== del.id));
      setNote(`${del.name} was deleted.`);
      if (editing?.item?.id === del.id) { setDirty(false); setEditing(null); }
      setDel(null);
    } catch (e) {
      if (alive.current) setDelErr(e instanceof CatalogueError ? e.message : 'The attraction could not be deleted.');
    } finally { if (alive.current) setDelBusy(false); }
  };

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return items.filter((i) => (theme === 'All' || i.theme === theme) && (status === 'All' || (status === 'Published') === i.published)
      && (!s || i.name.toLowerCase().includes(s) || i.place.toLowerCase().includes(s)));
  }, [items, q, theme, status]);

  return (
    <main className="adm-main">
      <div className="adm-head">
        <div><div className="eyebrow">Attraction catalogue</div><h1>Places on the map</h1></div>
        <div className="adm-acts">
          <button className="adm-btn" onClick={() => { void load(); void loadCategories(); }} disabled={loading} data-testid="button-refresh"><RefreshCw size={15} /> Refresh</button>
          <button className="adm-btn" aria-expanded={categoriesOpen} aria-controls="admin-categories" onClick={() => {
            setCategoriesOpen(!categoriesOpen);
            if (!categoriesOpen) void loadCategories();
          }} data-testid="button-manage-categories"><Tags size={15} /> Manage categories</button>
          <button className="adm-btn" aria-expanded={startOpen} aria-controls="admin-starting-areas" disabled={startOpen} onClick={() => setStartOpen(true)} data-testid="button-manage-starting-areas"><MapPin size={15} /> Manage starting areas</button>
          <button className="adm-btn pri" onClick={() => open()} data-testid="button-add-attraction"><Plus size={15} /> Add attraction</button>
        </div>
      </div>
      {categoriesOpen && <AdminCategories categories={categories} loading={categoriesLoading} error={categoryError}
        needsSetup={categoryNeedsSetup} onAdded={categoryAdded} onRefresh={() => void loadCategories()} onClose={() => setCategoriesOpen(false)} />}
      {startOpen && <AdminStartingAreas onClose={() => setStartOpen(false)} onDirty={setStartDirty} />}
      <div className="adm-tools">
        <input className="adm-in" type="search" placeholder="Search by name or address" aria-label="Search attractions" value={q} onChange={(e) => setQ(e.target.value)} data-testid="input-search" />
        <select className="adm-in" aria-label="Filter by category" value={theme} onChange={(e) => setTheme(e.target.value)} data-testid="select-theme-filter">
          {['All', ...categoryOptions].map((t) => <option key={t}>{t}</option>)}
        </select>
        <select className="adm-in" aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)} data-testid="select-status-filter">
          {['All', 'Published', 'Draft'].map((t) => <option key={t}>{t}</option>)}
        </select>
      </div>
      <div aria-live="polite">{note && <div className="adm-msg ok" data-testid="status-admin-note">{note}</div>}</div>
      {error && <div className="adm-msg err" role="alert" data-testid="status-list-error">{error} <button className="adm-btn link" onClick={() => void load()} data-testid="button-retry-list">Try again</button></div>}
      <p className="adm-count" data-testid="text-attraction-count"><span>{shown.length} of {items.length} attractions</span><span>Drafts are hidden from visitors</span></p>
      {loading && items.length === 0 ? <div data-testid="status-list-loading">{[0, 1, 2, 3].map((n) => <div className="adm-skel" key={n} />)}</div>
        : shown.length === 0 && !error ? (
          <div className="adm-empty" data-testid="status-empty">
            <h3>{items.length ? 'Nothing matches those filters' : 'No attractions yet'}</h3>
            <p>{items.length ? 'Try a different search or clear the filters.' : 'Add the first place visitors can discover on a walk.'}</p>
            {items.length ? <button className="adm-btn" onClick={() => { setQ(''); setTheme('All'); setStatus('All'); }} data-testid="button-clear-filters">Clear filters</button>
              : <button className="adm-btn pri" onClick={() => open()} data-testid="button-add-first">Add attraction</button>}
          </div>
        ) : (
          <div className="adm-list" data-testid="list-attractions" style={{ opacity: loading ? 0.6 : 1, transition: 'opacity .2s' }}>
            {shown.map((i) => (
              <article key={i.id} className={`adm-row${fresh === i.id ? ' fresh' : ''}`} data-testid={`row-attraction-${i.id}`}>
                <div>
                  <div className="adm-kick"><span>{i.theme}</span><span className={`adm-badge${i.published ? '' : ' draft'}`}>{i.published ? 'Published' : 'Draft'}</span></div>
                  <h3>{i.name}</h3><p>{i.place || 'No address given'}</p>
                </div>
                <div className="adm-acts">
                  <button className="adm-ibtn" onClick={() => open(i)} aria-label={`Edit ${i.name}`} data-testid={`button-edit-${i.id}`}><Pencil size={16} /></button>
                  <button className="adm-ibtn" onClick={() => { setDelErr(''); setDel(i); }} aria-label={`Delete ${i.name}`} data-testid={`button-delete-${i.id}`}><Trash2 size={16} /></button>
                </div>
              </article>
            ))}
          </div>
        )}

      {editing && (
        <div className="adm-ov" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }} data-testid="overlay-editor">
          <section className="adm-drawer" role="dialog" aria-modal="true" aria-label="Attraction editor">
            <AdminEditor key={editing.key} item={editing.item} categories={categoryOptions} onSaved={onSaved} onRequestClose={close} onDirty={onDirty} />
          </section>
        </div>
      )}
      {pending && (
        <div className="adm-ov center" role="alertdialog" aria-modal="true" aria-labelledby="dd-t" data-testid="dialog-discard">
          <div className="adm-dlg"><h2 id="dd-t">Discard unsaved changes?</h2><p>Your edits to this attraction have not been saved and will be lost.</p>
            <div className="adm-dlg-acts">
              <button className="adm-btn" onClick={() => setPending(null)} data-testid="button-keep-editing">Keep editing</button>
              <button className="adm-btn warn" onClick={() => { const a = pending; setPending(null); setDirty(false); a(); }} data-testid="button-confirm-discard">Discard changes</button></div></div>
        </div>
      )}
      {del && (
        <div className="adm-ov center" role="alertdialog" aria-modal="true" aria-labelledby="dl-t" data-testid="dialog-delete">
          <div className="adm-dlg"><h2 id="dl-t">Delete {del.name}?</h2>
            <p>This removes the attraction permanently. It will be excluded from every planned walk and can no longer be recommended to visitors. If you only want it hidden for now, set it to draft instead.</p>
            {delErr && <div className="adm-msg err" role="alert" data-testid="status-delete-error">{delErr}</div>}
            <div className="adm-dlg-acts">
              <button className="adm-btn" onClick={() => setDel(null)} disabled={delBusy} data-testid="button-cancel-delete">Cancel</button>
              <button className="adm-btn warn" onClick={() => void confirmDelete()} disabled={delBusy} data-testid="button-confirm-delete">{delBusy ? 'Deleting…' : 'Delete permanently'}</button></div></div>
        </div>
      )}
    </main>
  );
}
