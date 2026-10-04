import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import AdminEditor from '../../src/AdminEditor';
import WalkPlanner from '../../src/WalkPlanner';
import { listManagedAttractions, type ManagedAttraction } from '../../src/attraction-store';
import '../../src/index.css';

function Editor() {
  const [item, setItem] = useState<ManagedAttraction>();
  const [ready, setReady] = useState(false);
  const [version, setVersion] = useState(0);
  const [status, setStatus] = useState('');
  useEffect(() => {
    void listManagedAttractions().then(rows => { setItem(rows[0]); setReady(true); });
  }, []);
  return <section className="adm" style={{ maxWidth: 700, padding: 24 }}>
    <p role="status">{status}</p>
    {ready && <AdminEditor key={version} item={item} categories={['History']}
      onDirty={() => {}} onRequestClose={() => setStatus('Close requested')}
      onSaved={saved => { setItem(saved); setVersion(v => v + 1); setStatus('Saved and reopened'); }} />}
  </section>;
}

createRoot(document.getElementById('root')!).render(new URLSearchParams(location.search).has('editor')
  ? <Editor /> : <WalkPlanner categories={['History']} categoriesLoading={false} categoriesError="" onRetryCategories={() => {}} />);