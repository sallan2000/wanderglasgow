import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Save, X } from 'lucide-react';
import { saveAttraction, CatalogueError, type ManagedAttraction } from './attraction-store';
import { ACCESS_FIELDS, unknownAccess, type AccessState } from './access-details';
import AdminMap from './AdminMap';

type Theme = ManagedAttraction['theme'];
type Props = {
  item?: ManagedAttraction;
  categories: string[];
  onSaved: (saved: ManagedAttraction, wasNew: boolean) => void;
  onRequestClose: () => void;
  onDirty: (dirty: boolean) => void;
};
const num = (s: string) => (s.trim() === '' ? null : Number(s));

export default function AdminEditor({ item, categories, onSaved, onRequestClose, onDirty }: Props) {
  const init = useRef({
    name: item?.name ?? '', description: item?.description ?? '', place: item?.place ?? '',
    theme: (item?.theme ?? '') as Theme | '', lat: item ? String(item.lat) : '', lon: item ? String(item.lon) : '',
    published: item?.published ?? true,
    access: { ...unknownAccess(), ...(item?.access ?? {}) },
  }).current;
  const [f, setF] = useState(init);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [tried, setTried] = useState(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));
  const dirty = JSON.stringify(f) !== JSON.stringify(init);
  useEffect(() => { onDirty(dirty); }, [dirty, onDirty]);
  useEffect(() => () => onDirty(false), [onDirty]);

  const lat = num(f.lat), lon = num(f.lon);
  const desc = f.description.trim().length;
  const problems: Record<string, string> = {};
  if (f.name.trim().length < 2 || f.name.trim().length > 200) problems.name = 'Enter a name of 2 to 200 characters.';
  if (desc < 10 || desc > 5000) problems.description = 'Write between 10 and 5,000 characters.';
  if (f.place.trim().length > 300) problems.place = 'Keep this under 300 characters.';
  if (!f.theme || !categories.includes(f.theme)) problems.theme = 'Choose the one category that fits best.';
  if (lat === null || !Number.isFinite(lat) || lat < -90 || lat > 90) problems.lat = 'Latitude must be between -90 and 90.';
  if (lon === null || !Number.isFinite(lon) || lon < -180 || lon > 180) problems.lon = 'Longitude must be between -180 and 180.';
  if (f.access.notes.trim().length > 1500) problems.access = 'Keep access notes under 1,500 characters.';
  const show = (k: string) => tried && problems[k];

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTried(true); setErr('');
    if (Object.keys(problems).length || !f.theme || lat === null || lon === null) return setErr('Fix the highlighted fields, then save again.');
    setBusy(true);
    try {
      const saved = await saveAttraction({ name: f.name, description: f.description, place: f.place, theme: f.theme, lat, lon, published: f.published, access: { ...f.access, notes: f.access.notes.trim() } }, item);
      onSaved(saved, !item);
    } catch (error) {
      if (mounted.current) setErr(error instanceof CatalogueError ? error.message : 'The attraction could not be saved. Try again.');
    } finally { if (mounted.current) setBusy(false); }
  };

  return (
    <form onSubmit={submit} noValidate data-testid="form-attraction">
      <div className="drawer-top" style={{ marginBottom: 6 }}>
        <div className="eyebrow">{item ? 'Edit attraction' : 'New attraction'}</div>
        <button type="button" className="icon-button" onClick={onRequestClose} aria-label="Close editor" data-testid="button-close-editor"><X size={18} /></button>
      </div>
      <h2 style={{ font: "600 clamp(30px,5vw,44px)/1 var(--app-font-serif)", letterSpacing: '-.05em', margin: 0 }}>{item ? item.name : 'Add a place'}</h2>
      <fieldset className="adm-form adm-fieldset" disabled={busy}>
        <div><label className="adm-lab" htmlFor="f-name">Name</label>
          <input id="f-name" className={`adm-in${show('name') ? ' bad' : ''}`} value={f.name} maxLength={200} onChange={(e) => set('name', e.target.value)} data-testid="input-name" />
          {show('name') && <p className="adm-err">{problems.name}</p>}</div>
        <div><label className="adm-lab" htmlFor="f-desc">Description</label>
          <textarea id="f-desc" className={`adm-in${show('description') ? ' bad' : ''}`} value={f.description} onChange={(e) => set('description', e.target.value)} data-testid="input-description" />
          <p className="adm-hint" data-testid="text-description-count">{desc.toLocaleString()} / 5,000 characters (minimum 10)</p>
          {show('description') && <p className="adm-err">{problems.description}</p>}</div>
        <div><span className="adm-lab" id="f-theme">Category</span>
          <div className="adm-themes" role="radiogroup" aria-labelledby="f-theme">
            {categories.map((t) => (
              <button key={t} type="button" role="radio" aria-checked={f.theme === t} className="adm-theme" onClick={() => set('theme', t)} data-testid={`radio-theme-${t.toLowerCase()}`}>{t}</button>
            ))}
          </div>
          {show('theme') && <p className="adm-err">{problems.theme}</p>}</div>
        <div><label className="adm-lab" htmlFor="f-place">Address or location label (optional)</label>
          <input id="f-place" className={`adm-in${show('place') ? ' bad' : ''}`} value={f.place} onChange={(e) => set('place', e.target.value)} data-testid="input-place" />
          {show('place') && <p className="adm-err">{problems.place}</p>}</div>
        <div><span className="adm-lab">Location</span>
          <AdminMap lat={lat !== null && Number.isFinite(lat) ? lat : null} lon={lon !== null && Number.isFinite(lon) ? lon : null} label={f.name}
            onPick={(a, o) => setF((p) => ({ ...p, lat: String(a), lon: String(o) }))} />
          <div className="adm-coords" style={{ marginTop: 10 }}>
            <div><label className="adm-lab" htmlFor="f-lat">Latitude</label>
              <input id="f-lat" className={`adm-in${show('lat') ? ' bad' : ''}`} inputMode="decimal" value={f.lat} onChange={(e) => set('lat', e.target.value)} placeholder="55.8642" data-testid="input-latitude" />
              {show('lat') && <p className="adm-err">{problems.lat}</p>}</div>
            <div><label className="adm-lab" htmlFor="f-lon">Longitude</label>
              <input id="f-lon" className={`adm-in${show('lon') ? ' bad' : ''}`} inputMode="decimal" value={f.lon} onChange={(e) => set('lon', e.target.value)} placeholder="-4.2518" data-testid="input-longitude" />
              {show('lon') && <p className="adm-err">{problems.lon}</p>}</div>
          </div>
        </div>
        <fieldset className="adm-fieldset" data-testid="group-access">
          <legend className="adm-lab">Access details (optional)</legend>
          {ACCESS_FIELDS.map(({ key, label }) => (
            <div key={key}><label className="adm-lab" htmlFor={`f-access-${key}`}>{label}</label>
              <select id={`f-access-${key}`} className="adm-in" value={f.access[key]} onChange={(e) => setF((p) => ({ ...p, access: { ...p.access, [key]: e.target.value as AccessState } }))} data-testid={`select-access-${key}`}>
                <option value="unknown">Unknown</option><option value="yes">Yes</option><option value="no">No</option>
              </select></div>
          ))}
          <div><label className="adm-lab" htmlFor="f-access-notes">Access notes (optional)</label>
            <textarea id="f-access-notes" className={`adm-in${show('access') ? ' bad' : ''}`} value={f.access.notes} onChange={(e) => setF((p) => ({ ...p, access: { ...p.access, notes: e.target.value } }))} data-testid="input-access-notes" />
            <p className="adm-hint">{f.access.notes.trim().length.toLocaleString()} / 1,500 characters. Shown to visitors as owner-provided, uncertified information.</p>
            {show('access') && <p className="adm-err">{problems.access}</p>}</div>
        </fieldset>
        <button type="button" role="switch" aria-checked={f.published} className="adm-switch" onClick={() => set('published', !f.published)} data-testid="switch-published">
          <span className="adm-track" />
          <span><strong>{f.published ? 'Published' : 'Draft'}</strong>
            <span className="adm-hint" style={{ display: 'block' }}>{f.published ? 'Visible to visitors in the walk planner.' : 'Hidden from the visitor planner until published.'}</span></span>
        </button>
        <div aria-live="polite">{err && <div className="adm-msg err" role="alert" data-testid="status-save-error">{err}
          {err.includes('access-details-upgrade.sql') && <> <a href={`${import.meta.env.BASE_URL}access-details-upgrade.sql`} download data-testid="link-access-upgrade-sql">Download access-details-upgrade.sql</a></>}</div>}</div>
        <div className="adm-bar">
          <button className="adm-btn pri" disabled={busy || !dirty} data-testid="button-save-attraction"><Save size={15} /> {busy ? 'Saving…' : item ? 'Save changes' : 'Add attraction'}</button>
          <button type="button" className="adm-btn" onClick={onRequestClose} data-testid="button-cancel-editor">{dirty ? 'Discard' : 'Close'}</button>
          {dirty && <span className="adm-sub" style={{ alignSelf: 'center' }} data-testid="status-unsaved">Unsaved changes</span>}
        </div>
      </fieldset>
    </form>
  );
}
