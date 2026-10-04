import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import AdminWalkEditor from '../../src/AdminWalkEditor';
import { state, CatalogueError, configureSaveFixture } from './transport';
import '../../src/index.css';
import '../../src/admin.css';

configureSaveFixture(new URLSearchParams(location.search).get('allowSave') === 'true');

const stops = [
  { name: 'Cathedral', place: 'Castle Street', lat: 55.862, lon: -4.234, story: 'An original cathedral story.' },
  { name: 'George Square', place: 'City centre', lat: 55.86, lon: -4.25, story: 'An original square story.' },
  { name: 'Kelvingrove', place: 'West End', lat: 55.868, lon: -4.29, story: 'An original museum story.' },
];
const count = Number(new URLSearchParams(location.search).get('stops') ?? 3);
const walk = {
  id: 'fixture', title: 'Fixture Glasgow walk', subtitle: 'A walk used only for component tests.',
  theme: 'History', stops: stops.slice(0, count), distanceKm: 0, minutes: 0,
  start: count ? stops[0].name : '',
  published: false, updatedAt: '2026-10-03T00:00:00Z',
};
Object.assign(window, {
  walkFixture: {
    state,
    complete(index: number, distanceKm = 2.4, minutes = 32) {
      const routeStops = state.requests[index].stops as typeof stops;
      const geometry = {
        type: 'LineString',
        coordinates: routeStops.flatMap((s, i) => i === 0
          ? [[s.lon, s.lat]] : [[s.lon + 0.0002, s.lat + 0.0003], [s.lon, s.lat]]),
      };
      state.requests[index].resolve({ distanceKm, minutes, geometry });
    },
    fail(index: number) { state.requests[index].reject(new CatalogueError('Fixture walking route unavailable')); },
    failNextSave() { state.failNextSave = true; },
  },
});

function Harness() {
  const [open, setOpen] = useState(true);
  return <>
    <button type="button" data-testid="fixture-reopen" onClick={() => setOpen(true)}>Open editor</button>
    {!open && <p data-testid="fixture-closed">Editor closed without saving</p>}
    {open && <AdminWalkEditor walk={walk} categories={['History']}
      attractions={[]} attractionsLoading={false} attractionsError=""
      onReloadSources={() => {}} onSaved={() => setOpen(false)}
      onClose={() => setOpen(false)} />}
  </>;
}
createRoot(document.getElementById('root')!).render(<Harness />);