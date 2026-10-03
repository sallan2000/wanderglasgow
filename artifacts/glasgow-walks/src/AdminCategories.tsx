import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Plus, RefreshCw, X } from 'lucide-react';
import { addAttractionCategory, CatalogueError } from './attraction-store';

type Props = {
  categories: string[];
  loading: boolean;
  error: string;
  needsSetup: boolean;
  onAdded: (name: string) => void;
  onRefresh: () => void;
  onClose: () => void;
};

export default function AdminCategories({ categories, loading, error, needsSetup, onAdded, onRefresh, onClose }: Props) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [note, setNote] = useState('');
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || loading || error) return;
    setBusy(true); setSaveError(''); setNote('');
    try {
      const added = await addAttractionCategory(name);
      onAdded(added);
      if (alive.current) {
        setName('');
        setNote(`${added} was added. It is now available when adding or editing attractions and in the visitor planner.`);
      }
    } catch (e) {
      if (alive.current) setSaveError(e instanceof CatalogueError ? e.message : 'The category could not be added. Try again.');
    } finally { if (alive.current) setBusy(false); }
  };

  return (
    <section className="adm-category-panel" id="admin-categories" aria-labelledby="category-heading" data-testid="panel-categories">
      <div className="adm-category-head">
        <div><div className="eyebrow">Attraction categories</div><h2 id="category-heading">Make room for more interests</h2></div>
        <div className="adm-acts">
          <button className="adm-btn" onClick={onRefresh} disabled={loading || busy} data-testid="button-refresh-categories"><RefreshCw size={15} /> Refresh</button>
          <button className="adm-ibtn" onClick={onClose} aria-label="Close category management" data-testid="button-close-categories"><X size={16} /></button>
        </div>
      </div>
      <p>Add a category such as Food &amp; drink, Architecture or Nature. Each attraction still belongs to exactly one category.</p>
      {loading && <p role="status">Loading categories…</p>}
      {error && <div className="adm-msg err" role="alert" data-testid="status-category-load-error">
        {error}
        {needsSetup && <p className="adm-category-upgrade">
          Download the <a href={import.meta.env.BASE_URL + 'categories-upgrade.sql'} target="_blank" rel="noreferrer" data-testid="link-category-upgrade">category upgrade SQL</a>,
          copy the whole script into a new Supabase SQL Editor query, and run it. This preserves your attractions and administrator access. Then click Refresh.
        </p>}
      </div>}
      <ul className="adm-category-list" aria-label="Existing categories" data-testid="list-categories">
        {categories.map(category => <li key={category}>{category}</li>)}
      </ul>
      <form className="adm-category-form" onSubmit={submit} noValidate data-testid="form-category">
        <div>
          <label className="adm-lab" htmlFor="category-name">New category name</label>
          <input id="category-name" className="adm-in" value={name} maxLength={40} placeholder="For example, Architecture"
            onChange={event => { setName(event.target.value); setSaveError(''); setNote(''); }}
            disabled={busy || loading || Boolean(error)} data-testid="input-category-name" />
          <p className="adm-hint">2–40 characters. Names must be unique, regardless of capitalisation.</p>
        </div>
        <button className="adm-btn pri" disabled={busy || loading || Boolean(error) || !name.trim()} data-testid="button-save-category">
          <Plus size={15} /> {busy ? 'Adding…' : 'Add category'}
        </button>
      </form>
      <div aria-live="polite">
        {saveError && <div className="adm-msg err" role="alert" data-testid="status-category-save-error">{saveError}</div>}
        {note && <div className="adm-msg ok" data-testid="status-category-added">{note}</div>}
      </div>
    </section>
  );
}