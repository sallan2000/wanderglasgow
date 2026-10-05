import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Plus, RefreshCw, Trash2, X } from 'lucide-react';
import {
  addAttractionCategory, CatalogueError, CategoryManagementSetupError,
  listAttractionCategoryUsage, removeAttractionCategory,
  type CategoryRemovalResult, type CategoryUsage,
} from './attraction-store';
import { useTrap } from './AdminWalkEditor';

type Props = {
  categories: string[];
  loading: boolean;
  error: string;
  needsSetup: boolean;
  onAdded: (name: string) => void;
  onRemoved: (category: string, replacement: string) => void;
  onRefresh: () => void;
  onClose: () => void;
};

function countLabel(count: number, singular: string) {
  return `${count} ${count === 1 ? singular : `${singular}s`}`;
}

function RemoveCategoryDialog({
  category, replacements, usage, replacement, setReplacement, busy, error, onCancel, onConfirm,
}: {
  category: string;
  replacements: string[];
  usage: CategoryUsage;
  replacement: string;
  setReplacement: (value: string) => void;
  busy: boolean;
  error: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useTrap(ref, onCancel);
  const noRecords = usage.attractions === 0 && usage.walks === 0;
  return (
    <div className="adm-ov center" role="presentation" data-testid="overlay-remove-category">
      <div ref={ref} data-walk-trap tabIndex={-1} className="adm-dlg category-remove-dialog"
        role="alertdialog" aria-modal="true" aria-labelledby="category-remove-title" data-testid="dialog-remove-category">
        <h2 id="category-remove-title">Remove {category}?</h2>
        <p>
          {noRecords
            ? `No attractions or curated walks currently use ${category}. Only the category will be removed.`
            : `This will move ${countLabel(usage.attractions, 'attraction')} and ${countLabel(usage.walks, 'curated walk')} to the replacement category. Their records and walk details will be preserved.`}
        </p>
        <label className="adm-lab" htmlFor="category-replacement">Replacement category</label>
        <select id="category-replacement" className="adm-in" value={replacement}
          onChange={event => setReplacement(event.target.value)} disabled={busy} data-testid="select-category-replacement">
          <option value="">Choose a category…</option>
          {replacements.map(name => <option key={name} value={name}>{name}</option>)}
        </select>
        {error && <div className="adm-msg err" role="alert" data-testid="status-remove-category-error">{error}</div>}
        <div className="adm-dlg-acts">
          <button type="button" className="adm-btn" data-autofocus onClick={onCancel} disabled={busy} data-testid="button-cancel-remove-category">Cancel</button>
          <button type="button" className="adm-btn warn" onClick={onConfirm} disabled={busy || !replacement}
            data-testid="button-confirm-remove-category">
            {busy ? 'Moving records…' : noRecords ? 'Remove category' : `Move and remove ${category}`}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminCategories({ categories, loading, error, needsSetup, onAdded, onRemoved, onRefresh, onClose }: Props) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [note, setNote] = useState('');
  const [usage, setUsage] = useState<CategoryUsage[]>([]);
  const [usageLoading, setUsageLoading] = useState(false);
  const [usageError, setUsageError] = useState('');
  const [managementNeedsSetup, setManagementNeedsSetup] = useState(false);
  const [usageVersion, setUsageVersion] = useState(0);
  const [removingCategory, setRemovingCategory] = useState('');
  const [replacement, setReplacement] = useState('');
  const [removeBusy, setRemoveBusy] = useState(false);
  const [removeError, setRemoveError] = useState('');
  const alive = useRef(true);
  const refreshButton = useRef<HTMLButtonElement>(null);
  const removeTrigger = useRef<HTMLButtonElement | null>(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const refreshUsage = useCallback(async () => {
    setUsageLoading(true);
    setUsageError('');
    setManagementNeedsSetup(false);
    try {
      const entries = await listAttractionCategoryUsage();
      if (alive.current) setUsage(entries);
    } catch (e) {
      if (alive.current) {
        setUsage([]);
        setUsageError(e instanceof CatalogueError ? e.message : 'Category usage could not be checked. Try again.');
        setManagementNeedsSetup(e instanceof CategoryManagementSetupError);
      }
    } finally { if (alive.current) setUsageLoading(false); }
  }, []);
  useEffect(() => {
    if (!loading && !error) void refreshUsage();
  }, [categories, loading, error, usageVersion, refreshUsage]);

  const closeRemoval = useCallback(() => {
    if (removeBusy) return;
    setRemovingCategory('');
    setReplacement('');
    setRemoveError('');
  }, [removeBusy]);

  const beginRemoval = (category: string, button: HTMLButtonElement) => {
    removeTrigger.current = button;
    setRemovingCategory(category);
    setReplacement('');
    setRemoveError('');
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || removeBusy || loading || error) return;
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

  const confirmRemoval = async () => {
    const selectedUsage = usage.find(entry => entry.category === removingCategory);
    if (busy || removeBusy || !selectedUsage || !replacement || !categories.includes(replacement) || replacement === removingCategory) return;
    setRemoveBusy(true);
    setRemoveError('');
    setNote('');
    try {
      const result: CategoryRemovalResult = await removeAttractionCategory(
        removingCategory, replacement, selectedUsage.attractions, selectedUsage.walks,
      );
      onRemoved(removingCategory, replacement);
      if (alive.current) {
        setNote(`${removingCategory} was removed. Moved ${countLabel(result.attractionsMoved, 'attraction')} and ${countLabel(result.walksMoved, 'curated walk')} to ${replacement}.`);
        setRemovingCategory('');
        setReplacement('');
        requestAnimationFrame(() => {
          if (removeTrigger.current?.isConnected) removeTrigger.current.focus();
          else refreshButton.current?.focus();
        });
      }
    } catch (e) {
      if (alive.current) {
        const message = e instanceof CatalogueError ? e.message : 'The category could not be removed. Refresh and try again.';
        setRemoveError(message);
        if (message.includes('usage changed')) setUsageVersion(version => version + 1);
      }
    } finally { if (alive.current) setRemoveBusy(false); }
  };

  const refresh = () => {
    setUsageVersion(version => version + 1);
    onRefresh();
  };

  const selectedUsage = usage.find(entry => entry.category === removingCategory);
  const canRemove = !loading && !error && !usageLoading && !usageError && !removeBusy && categories.length > 1;

  return (
    <section className="adm-category-panel" id="admin-categories" aria-labelledby="category-heading" data-testid="panel-categories">
      <div className="adm-category-head">
        <div><div className="eyebrow">Attraction categories</div><h2 id="category-heading">Make room for more interests</h2></div>
        <div className="adm-acts">
          <button ref={refreshButton} className="adm-btn" onClick={refresh} disabled={loading || busy || removeBusy} data-testid="button-refresh-categories"><RefreshCw size={15} /> Refresh</button>
          <button className="adm-ibtn" onClick={onClose} aria-label="Close category management" data-testid="button-close-categories"><X size={16} /></button>
        </div>
      </div>
      <p>Add a category such as Food &amp; drink, Architecture or Nature, or remove one you no longer use. Every attraction must still have exactly one category.</p>
      {loading && <p role="status">Loading categories…</p>}
      {error && <div className="adm-msg err" role="alert" data-testid="status-category-load-error">
        {error}
        {needsSetup && <p className="adm-category-upgrade">
          Download the <a href={import.meta.env.BASE_URL + 'categories-upgrade.sql'} target="_blank" rel="noreferrer" data-testid="link-category-upgrade">category upgrade SQL</a>,
          copy the whole script into a new Supabase SQL Editor query, and run it. This preserves your attractions and administrator access. Then click Refresh.
        </p>}
      </div>}
      <ul className="adm-category-list" aria-label="Existing categories" data-testid="list-categories">
        {categories.map(category => {
          const counts = usage.find(entry => entry.category === category);
          return <li className="adm-category-item" key={category} data-testid={`category-item-${category.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}>
            <strong>{category}</strong>
            {counts
              ? <span className="adm-category-usage" data-testid={`category-usage-${category.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}>
                  {countLabel(counts.attractions, 'attraction')} · {countLabel(counts.walks, 'curated walk')}
                </span>
              : <span className="adm-category-usage">{usageLoading ? 'Checking usage…' : 'Usage unavailable'}</span>}
            {counts && <button type="button" className="adm-btn" onClick={event => beginRemoval(category, event.currentTarget)}
              disabled={!canRemove || category === removingCategory} aria-label={`Remove ${category} category`}
              data-testid={`button-remove-category-${category.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}>
              <Trash2 size={14} /> Remove
            </button>}
          </li>;
        })}
      </ul>
      {categories.length < 2 && !loading && <p className="adm-hint">At least one other category is needed as a replacement.</p>}
      {managementNeedsSetup && <div className="adm-category-upgrade" role="note" data-testid="status-category-management-upgrade">
        <p>Category removal needs a database update. Download the <a href={import.meta.env.BASE_URL + 'categories-upgrade.sql'} download="categories-upgrade.sql" target="_blank" rel="noreferrer">updated categories-upgrade.sql</a>,
          run the whole script in your Supabase SQL Editor, then refresh. Existing categories and records are preserved.</p>
      </div>}
      {usageError && !managementNeedsSetup && <div className="adm-msg err" role="alert" data-testid="status-category-usage-error">
        {usageError} <button type="button" className="adm-btn link" onClick={() => setUsageVersion(version => version + 1)} data-testid="button-retry-category-usage">Retry</button>
      </div>}
      {categories.length > 1 && !usageLoading && !usageError && usage.length === 0 && <p className="adm-msg err" role="alert">No category usage data is available. Refresh before removing a category.</p>}
      <form className="adm-category-form" onSubmit={submit} noValidate data-testid="form-category">
        <div>
          <label className="adm-lab" htmlFor="category-name">New category name</label>
          <input id="category-name" className="adm-in" value={name} maxLength={40} placeholder="For example, Architecture"
            onChange={event => { setName(event.target.value); setSaveError(''); setNote(''); }}
            disabled={busy || removeBusy || loading || Boolean(error)} data-testid="input-category-name" />
          <p className="adm-hint">2–40 characters. Names must be unique, regardless of capitalisation.</p>
        </div>
        <button className="adm-btn pri" disabled={busy || removeBusy || loading || Boolean(error) || !name.trim()} data-testid="button-save-category">
          <Plus size={15} /> {busy ? 'Adding…' : 'Add category'}
        </button>
      </form>
      <div aria-live="polite">
        {saveError && <div className="adm-msg err" role="alert" data-testid="status-category-save-error">{saveError}</div>}
        {note && <div className="adm-msg ok" data-testid="status-category-added">{note}</div>}
      </div>
      {removingCategory && selectedUsage && <RemoveCategoryDialog category={removingCategory}
        replacements={categories.filter(category => category !== removingCategory)}
        usage={selectedUsage} replacement={replacement} setReplacement={setReplacement}
        busy={removeBusy} error={removeError} onCancel={closeRemoval} onConfirm={confirmRemoval} />}
    </section>
  );
}