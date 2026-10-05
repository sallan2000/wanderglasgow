import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import AdminCategories from '../../src/AdminCategories';
import '../../src/index.css';
import '../../src/admin.css';

const fixture = {
  categories: ['Art', 'History', 'Sport'],
  usage: [
    { category_name: 'Art', attraction_count: 1, curated_walk_count: 0 },
    { category_name: 'History', attraction_count: 3, curated_walk_count: 2 },
    { category_name: 'Sport', attraction_count: 2, curated_walk_count: 1 },
  ],
};

function Harness() {
  const [categories, setCategories] = useState(fixture.categories);
  const [notice, setNotice] = useState('');
  return <>
    <AdminCategories categories={categories} loading={false} error="" needsSetup={false}
      onAdded={name => setCategories(current => [...current, name])}
      onRemoved={(name, replacement) => setCategories(current => current.filter(category => category !== name))}
      onRefresh={() => {}} onClose={() => {}} />
    <p role="status" data-testid="fixture-category-notice">{notice}</p>
    <button type="button" data-testid="fixture-restore-notice" onClick={() => setNotice('ready')}>Fixture</button>
  </>;
}

createRoot(document.getElementById('root')!).render(<Harness />);
