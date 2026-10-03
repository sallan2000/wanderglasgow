import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import WalkPlanner from '../../src/WalkPlanner';
import AdminMap from '../../src/AdminMap';
import '../../src/index.css';
import '../../src/admin.css';

function MapHarness() {
  const component = new URLSearchParams(location.search).get('component') === 'planner' ? 'planner' : 'admin';
  const [mounted, setMounted] = useState(true);
  const [lat, setLat] = useState<number | null>(55.86);
  const [lon, setLon] = useState<number | null>(-4.25);
  const [label, setLabel] = useState('Cathedral fixture');
  const [pickVersion, setPickVersion] = useState(1);
  const [picked, setPicked] = useState('');

  return (
    <main>
      <button type="button" data-testid="fixture-toggle-mount" onClick={() => setMounted(value => !value)}>
        {mounted ? 'Hide map component' : 'Show map component'}
      </button>
      {component === 'planner' ? (
        mounted && <WalkPlanner entry={null} categories={['History']} categoriesLoading={false}
          categoriesError="" onRetryCategories={() => {}} />
      ) : mounted ? (
        <section>
          <button type="button" data-testid="fixture-move-marker" onClick={() => { setLat(55.875); setLon(-4.29); }}>
            Move marker
          </button>
          <button type="button" data-testid="fixture-update-label" onClick={() => setLabel('Updated museum fixture')}>
            Update marker label
          </button>
          <button type="button" data-testid="fixture-update-handler" onClick={() => setPickVersion(2)}>
            Update map click handler
          </button>
          <output data-testid="fixture-picked">{picked}</output>
          <AdminMap lat={lat} lon={lon} label={label}
            onPick={(nextLat, nextLon) => setPicked(`${pickVersion}:${nextLat.toFixed(6)},${nextLon.toFixed(6)}`)} />
        </section>
      ) : null}
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<MapHarness />);