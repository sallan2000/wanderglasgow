import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { MapPin, Pencil, Plus, RefreshCw, Trash2, X } from 'lucide-react';
import { listStartingAreas, saveStartingArea, deleteStartingArea, StartingAreaError, StartingAreaSetupError, type StartingArea } from './starting-area-store';
import AdminMap from './AdminMap';

type Props = { onClose: () => void; onDirty: (dirty: boolean) => void };
type Form = { name: string; lat: string; lon: string };
const blank: Form = { name: '', lat: '', lon: '' };
const num = (s: string) => (s.trim() === '' ? null : Number(s));

export default function AdminStartingAreas({ onClose, onDirty }: Props) {
  const [items, setItems] = useState<StartingArea[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [needsSetup, setNeedsSetup] = useState(false);
  const [editing, setEditing] = useState<StartingArea | 'new' | null>(null);
  const [form, setForm] = useState<Form>(blank);
  const [base, setBase] = useState<Form>(blank);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [del, setDel] = useState<StartingArea | null>(null);
  const [delBusy, setDelBusy] = useState(false);
  const [delError, setDelError] = useState('');
  const [note, setNote] = useState('');
  const [discard, setDiscard] = useState<(() => void) | null>(null);
  const alive = useRef(true);
  const seq = useRef(0);
  const lock = useRef(false);
  const delLock = useRef(false);
  const abort = useRef<AbortController | null>(null);
  const formRef = useRef<HTMLElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const onDirtyRef = useRef(onDirty);
  onDirtyRef.current = onDirty;

  const dirty = editing !== null && JSON.stringify(form) !== JSON.stringify(base);
  const locked = busy || delBusy;
  useEffect(() => { onDirtyRef.current(dirty || locked); }, [dirty, locked]);
  useEffect(() => () => onDirtyRef.current(false), []);
  useEffect(() => { alive.current = true; return () => { alive.current = false; abort.current?.abort(); }; }, []);
  const dialogOpen = Boolean(discard || del);
  useEffect(() => {
    if (!dialogOpen || !dialogRef.current) return;
    const previous = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    dialog.querySelector<HTMLButtonElement>('button')?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !lock.current && !delLock.current) {
        event.preventDefault(); setDiscard(null); setDel(null);
      }
      if (event.key !== 'Tab') return;
      const buttons = [...dialog.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
      if (!buttons.length) { event.preventDefault(); dialog.focus(); return; }
      const first = buttons[0], last = buttons[buttons.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    dialog.addEventListener('keydown', key);
    return () => { dialog.removeEventListener('keydown', key); if (previous?.isConnected) previous.focus(); };
  }, [dialogOpen]);

  const load = useCallback(async () => {
    const n = ++seq.current;
    abort.current?.abort();
    const ctl = new AbortController(); abort.current = ctl;
    setLoading(true); setLoadError(''); setNeedsSetup(false);
    try {
      const rows = await listStartingAreas(ctl.signal);
      if (alive.current && n === seq.current) setItems(rows);
    } catch (e) {
      if (alive.current && n === seq.current && !ctl.signal.aborted) {
        setLoadError(e instanceof StartingAreaError ? e.message : 'Starting areas could not be loaded. Try again.');
        setNeedsSetup(e instanceof StartingAreaSetupError);
      }
    } finally { if (alive.current && n === seq.current) setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const sortItems = (l: StartingArea[]) => [...l].sort((a, b) => a.name.localeCompare(b.name));
  const guard = (action: () => void) => { if (dirty) setDiscard(() => action); else action(); };
  const begin = (item: StartingArea | 'new') => guard(() => {
    const f = item === 'new' ? blank : { name: item.name, lat: String(item.lat), lon: String(item.lon) };
    setForm(f); setBase(f); setEditing(item); setTried(false); setSaveError(''); setNote('');
    window.setTimeout(() => formRef.current?.querySelector<HTMLInputElement>('input')?.focus(), 0);
  });
  const cancel = () => guard(() => { setEditing(null); setForm(blank); setBase(blank); setSaveError(''); });

  const lat = num(form.lat), lon = num(form.lon);
  const problems: Record<string, string> = {};
  const nm = form.name.trim().length;
  if (nm < 2 || nm > 80) problems.name = 'Enter a name of 2 to 80 characters.';
  if (lat === null || !Number.isFinite(lat) || lat < -90 || lat > 90) problems.lat = 'Latitude must be between -90 and 90.';
  if (lon === null || !Number.isFinite(lon) || lon < -180 || lon > 180) problems.lon = 'Longitude must be between -180 and 180.';
  const show = (k: string) => (tried ? problems[k] : '');
  const set = (k: keyof Form, v: string) => { setForm(p => ({ ...p, [k]: v })); setSaveError(''); };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (lock.current || delLock.current || !editing) return;
    setTried(true); setSaveError('');
    if (Object.keys(problems).length || lat === null || lon === null) { setSaveError('Fix the highlighted fields, then save again.'); return; }
    lock.current = true; setBusy(true);
    const existing = editing === 'new' ? undefined : editing;
    try {
      const saved = await saveStartingArea({ name: form.name.trim(), lat, lon }, existing);
      if (!alive.current) return;
      seq.current++; setLoading(false);
      setItems(l => sortItems([...l.filter(i => i.id !== saved.id), saved]));
      setEditing(null); setForm(blank); setBase(blank);
      setNote(`${saved.name} was ${existing ? 'updated' : 'added'}. Visitors can start walks from it.`);
    } catch (err) {
      if (alive.current) setSaveError(err instanceof StartingAreaError ? err.message : 'The starting area could not be saved. Your entries are kept; try again.');
    } finally { lock.current = false; if (alive.current) setBusy(false); }
  };

  const confirmDelete = async () => {
    if (!del || delLock.current || lock.current) return;
    delLock.current = true; setDelBusy(true); setDelError('');
    const target = del;
    try {
      await deleteStartingArea(target);
      if (!alive.current) return;
      seq.current++; setLoading(false);
      setItems(l => l.filter(i => i.id !== target.id));
      if (editing !== null && editing !== 'new' && editing.id === target.id) { setEditing(null); setForm(blank); setBase(blank); }
      setNote(`${target.name} was deleted.`);
      setDel(null);
    } catch (err) {
      if (alive.current) setDelError(err instanceof StartingAreaError ? err.message : 'The starting area could not be deleted. Try again.');
    } finally { delLock.current = false; if (alive.current) setDelBusy(false); }
  };

  const formDisabled = locked;
  return (
    <section className="adm-category-panel adm-start-panel" id="admin-starting-areas" aria-labelledby="start-heading" data-testid="panel-starting-areas" ref={formRef}>
      <div className="adm-category-head">
        <div><div className="eyebrow">Starting areas</div><h2 id="start-heading">Where visitors can begin a walk</h2></div>
        <div className="adm-acts">
          <button className="adm-btn" onClick={() => void load()} disabled={loading || locked} data-testid="button-refresh-starting-areas"><RefreshCw size={15} /> Refresh</button>
          <button className="adm-btn pri" onClick={() => begin('new')} disabled={locked || loading || !!loadError} data-testid="button-add-starting-area"><Plus size={15} /> Add starting area</button>
          <button className="adm-ibtn" onClick={() => guard(onClose)} disabled={locked} aria-label="Close starting area management" data-testid="button-close-starting-areas"><X size={16} /></button>
        </div>
      </div>
      <p>Choose trustworthy map origins such as stations or squares. Pin each one on the map or type its coordinates.</p>
      <div aria-live="polite">{note && <div className="adm-msg ok" data-testid="status-starting-area-note">{note}</div>}</div>
      {loading && <p role="status" data-testid="status-starting-areas-loading">Loading starting areas…</p>}
      {loadError && (
        <div className="adm-msg err" role="alert" data-testid="status-starting-areas-error">
          {loadError}
          {needsSetup && <p className="adm-category-upgrade">
            The site owner needs to download the <a href={import.meta.env.BASE_URL + 'starting-areas-upgrade.sql'} target="_blank" rel="noreferrer" data-testid="link-starting-areas-upgrade">starting areas upgrade SQL</a>,
            paste the whole script into a new Supabase SQL Editor query, and run it. The existing Supabase setup must already be installed. Then click Refresh.
          </p>}
          <button className="adm-btn link" onClick={() => void load()} disabled={loading} data-testid="button-retry-starting-areas">Try again</button>
        </div>
      )}
      {!loadError && !loading && items.length === 0 && editing === null && (
        <div className="adm-empty" data-testid="status-starting-areas-empty">
          <h3>No starting areas yet</h3><p>Add the first place visitors can start walking from.</p>
          <button className="adm-btn pri" onClick={() => begin('new')} data-testid="button-add-first-starting-area">Add starting area</button>
        </div>
      )}
      {items.length > 0 && (
        <ul className="adm-start-list" aria-label="Starting areas" data-testid="list-starting-areas">
          {items.map(i => (
            <li key={i.id} className="adm-start-row" data-testid={`row-starting-area-${i.id}`}>
              <div><strong><MapPin size={14} aria-hidden="true" /> {i.name}</strong><span>{i.lat.toFixed(5)}, {i.lon.toFixed(5)}</span></div>
              <div className="adm-acts">
                <button className="adm-ibtn" onClick={() => begin(i)} disabled={locked || loading || !!loadError} aria-label={`Edit ${i.name}`} data-testid={`button-edit-starting-area-${i.id}`}><Pencil size={16} /></button>
                <button className="adm-ibtn" onClick={() => { setDelError(''); setDel(i); }} disabled={locked || loading || !!loadError} aria-label={`Delete ${i.name}`} data-testid={`button-delete-starting-area-${i.id}`}><Trash2 size={16} /></button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {editing !== null && (
        <form className="adm-form adm-start-form" onSubmit={submit} noValidate aria-label={editing === 'new' ? 'New starting area' : `Edit ${editing.name}`} data-testid="form-starting-area">
          <fieldset className="adm-fieldset" disabled={formDisabled} style={{ display: 'grid', gap: 20 }}>
            <div>
              <label className="adm-lab" htmlFor="start-name">Name</label>
              <input id="start-name" className={`adm-in${show('name') ? ' bad' : ''}`} value={form.name} maxLength={80} onChange={e => set('name', e.target.value)}
                aria-invalid={!!show('name')} aria-describedby={show('name') ? 'start-name-err' : undefined} data-testid="input-starting-area-name" />
              {show('name') && <p className="adm-err" id="start-name-err" role="alert">{problems.name}</p>}
            </div>
            <div className="adm-coords">
              <div>
                <label className="adm-lab" htmlFor="start-lat">Latitude</label>
                <input id="start-lat" className={`adm-in${show('lat') ? ' bad' : ''}`} inputMode="decimal" value={form.lat} onChange={e => set('lat', e.target.value)}
                  aria-invalid={!!show('lat')} aria-describedby={show('lat') ? 'start-lat-err' : undefined} data-testid="input-starting-area-lat" />
                {show('lat') && <p className="adm-err" id="start-lat-err" role="alert">{problems.lat}</p>}
              </div>
              <div>
                <label className="adm-lab" htmlFor="start-lon">Longitude</label>
                <input id="start-lon" className={`adm-in${show('lon') ? ' bad' : ''}`} inputMode="decimal" value={form.lon} onChange={e => set('lon', e.target.value)}
                  aria-invalid={!!show('lon')} aria-describedby={show('lon') ? 'start-lon-err' : undefined} data-testid="input-starting-area-lon" />
                {show('lon') && <p className="adm-err" id="start-lon-err" role="alert">{problems.lon}</p>}
              </div>
            </div>
            <AdminMap lat={lat !== null && Number.isFinite(lat) ? lat : null} lon={lon !== null && Number.isFinite(lon) ? lon : null} label={form.name.trim() || 'Starting area'}
              onPick={(a, o) => setForm(p => ({ ...p, lat: String(a), lon: String(o) }))} />
          </fieldset>
          <div aria-live="polite">{saveError && <div className="adm-msg err" role="alert" data-testid="status-starting-area-save-error">{saveError}</div>}</div>
          <div className="adm-dlg-acts" style={{ justifyContent: 'flex-start' }}>
            <button className="adm-btn pri" disabled={locked} data-testid="button-save-starting-area">{busy ? 'Saving…' : editing === 'new' ? 'Add starting area' : 'Save changes'}</button>
            <button type="button" className="adm-btn" onClick={cancel} disabled={locked} data-testid="button-cancel-starting-area">Cancel</button>
          </div>
        </form>
      )}
      {discard && (
        <div className="adm-ov center" role="alertdialog" aria-modal="true" aria-labelledby="sd-t" data-testid="dialog-discard-starting-area" ref={dialogRef} tabIndex={-1}>
          <div className="adm-dlg"><h2 id="sd-t">Discard unsaved changes?</h2><p>Your edits to this starting area have not been saved and will be lost.</p>
            <div className="adm-dlg-acts">
              <button className="adm-btn" onClick={() => setDiscard(null)} data-testid="button-keep-editing-starting-area">Keep editing</button>
              <button className="adm-btn warn" onClick={() => { const a = discard; setDiscard(null); setEditing(null); setForm(blank); setBase(blank); onDirtyRef.current(false); a(); }} data-testid="button-confirm-discard-starting-area">Discard changes</button>
            </div></div>
        </div>
      )}
      {del && (
        <div className="adm-ov center" role="alertdialog" aria-modal="true" aria-labelledby="sdl-t" data-testid="dialog-delete-starting-area" ref={dialogRef} tabIndex={-1}>
          <div className="adm-dlg"><h2 id="sdl-t">Delete {del.name}?</h2>
            <p>This removes the starting area permanently. Visitors will no longer be able to choose it as a walk origin.</p>
            {delError && <div className="adm-msg err" role="alert" data-testid="status-delete-starting-area-error">{delError}</div>}
            <div className="adm-dlg-acts">
              <button className="adm-btn" onClick={() => setDel(null)} disabled={delBusy} data-testid="button-cancel-delete-starting-area">Cancel</button>
              <button className="adm-btn warn" onClick={() => void confirmDelete()} disabled={delBusy} data-testid="button-confirm-delete-starting-area">{delBusy ? 'Deleting…' : 'Delete permanently'}</button>
            </div></div>
        </div>
      )}
    </section>
  );
}
