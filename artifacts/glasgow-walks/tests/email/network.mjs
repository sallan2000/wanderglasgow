import { expect } from '@playwright/test';

const stops = [
  { name: 'Fixture first sight', place: 'George Square', story: 'A published story about the first stop.', lat: 55.8642, lon: -4.2518 },
  { name: 'Fixture second sight', place: 'Buchanan Street', story: 'A published story about the second stop.', lat: 55.8651, lon: -4.256 },
];
const updated_at = '2026-10-04T10:00:00Z';
const tables = {
  glasgow_attraction_categories: [{ name: 'History' }],
  glasgow_starting_areas: [{ id: 'fixture-area', name: 'Fixture starting area', latitude: 55.863, longitude: -4.2501, updated_at }],
  glasgow_attractions: stops.map((s, i) => ({ id: `fixture-stop-${i + 1}`, name: s.name, place: s.place, description: s.story,
    latitude: s.lat, longitude: s.lon, theme: 'History', published: true, updated_at })),
  glasgow_curated_walks: [{ id: 'fixture-curated', title: 'Fixture editorial Glasgow', subtitle: 'A published walking itinerary for this fixture.',
    theme: 'History', stops, distance_km: 2.1, minutes: 29, published: true, updated_at }],
};
const turnstile = `
let nextToken=0; const widgets=new Map();
window.turnstile = {
  render(container, options) {
    const id = String(++nextToken);
    const button = document.createElement('button');
    button.type='button'; button.textContent='Complete security check';
    button.dataset.testid='fixture-security-check';
    button.onclick=()=>{ options.callback('fixture-token-'+id); button.textContent='Security check complete'; };
    container.appendChild(button); widgets.set(id,{container, options});
    window.expireFixtureSecurity=()=>options['expired-callback']();
    return id;
  },
  remove(id) { const widget=widgets.get(id); if(widget)widget.container.replaceChildren(); widgets.delete(id); }
};`;

export async function isolateEmail(page) {
  const state = { sends: [], securityLoads: 0, unexpected: [], errors: [], send: null, securityFails: false,
    catalogue: null, walkingMatrix: null, routeDistanceOverride: null, routingRequests: [], mapRequests: [] };
  let tablePoints, distances;
  page.on('pageerror', error => state.errors.push(error.message));
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: {
      getCurrentPosition(success) { queueMicrotask(() => success({ coords: { latitude: 55.8625, longitude: -4.249 } })); },
    } });
  });
  await page.route('**/*', async route => {
    const u = new URL(route.request().url());
    if (u.hostname === '127.0.0.1') return route.continue();
    if (u.hostname === 'supabase.fixture.invalid') {
      const cors = { 'Access-Control-Allow-Origin': 'http://127.0.0.1:4185', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Content-Type': 'application/json' };
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
      if (u.pathname === '/functions/v1/send-walk-email') {
        state.sends.push(route.request().postDataJSON());
        if (state.send) return state.send(route, cors);
        return route.fulfill({ status: 200, headers: cors, body: '{"status":"accepted"}' });
      }
      const table = u.pathname.replace('/rest/v1/', '');
      if (table in tables) return route.fulfill({ status: 200, headers: cors,
        body: JSON.stringify(table === 'glasgow_attractions' && state.catalogue ? state.catalogue : tables[table]) });
      state.unexpected.push(u.pathname); return route.abort();
    }
    if (u.hostname === 'challenges.cloudflare.com') {
      state.securityLoads++;
      if (state.securityFails) return route.abort();
      return route.fulfill({ status: 200, contentType: 'text/javascript', body: turnstile });
    }
    if (u.hostname === 'routing.openstreetmap.de') {
      const points = u.pathname.split('/').at(-1).split(';').map(point => point.split(',').map(Number));
      state.routingRequests.push({ points, continueStraight: u.searchParams.get('continue_straight') });
      if (u.pathname.includes('/table/')) {
        tablePoints = points;
        distances = state.walkingMatrix ?? [[0, 400, 600], [400, 0, 300], [600, 300, 0]];
        return route.fulfill({ json: { code: 'Ok', distances } });
      }
      if (u.pathname.includes('/route/')) {
        const indices = points.map(point => tablePoints.findIndex(p => p[0] === point[0] && p[1] === point[1]));
        const distance = indices.slice(1).reduce((sum, index, i) => sum + distances[indices[i]][index], 0);
        return route.fulfill({ json: { code: 'Ok', routes: [{
          distance: state.routeDistanceOverride ?? distance, duration: 550, geometry: { type: 'LineString', coordinates: points },
        }] } });
      }
    }
    if (u.hostname === 'overpass-api.de' && u.pathname === '/api/interpreter') {
      const query = u.searchParams.get('data') ?? '';
      const match = query.match(/\((-?[0-9.]+,-?[0-9.]+,-?[0-9.]+,-?[0-9.]+)\)/);
      if (!match) {
        state.unexpected.push('invalid-map-bounds');
        return route.fulfill({ status: 400, body: 'Missing map bounds' });
      }
      const [south, west, north, east] = match[1].split(',').map(Number);
      state.mapRequests.push({ query, bounds: { south, west, north, east } });
      const lat = (south + north) / 2, lon = (west + east) / 2;
      const latSpan = north - south, lonSpan = east - west;
      return route.fulfill({
        status: 200,
        headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
        body: JSON.stringify({ elements: [
          { type: 'way', id: 101, tags: { highway: 'primary', name: 'Sauchiehall Street' },
            geometry: [{ lat: lat - latSpan * 0.3, lon: lon - lonSpan * 0.35 }, { lat: lat + latSpan * 0.3, lon: lon + lonSpan * 0.35 }] },
          { type: 'way', id: 102, tags: { highway: 'residential', name: 'Rose Street' },
            geometry: [{ lat: lat - latSpan * 0.25, lon: lon + lonSpan * 0.35 }, { lat: lat + latSpan * 0.25, lon: lon - lonSpan * 0.35 }] },
          { type: 'way', id: 103, tags: { leisure: 'park' },
            geometry: [{ lat: lat, lon: lon }, { lat: lat, lon: lon + lonSpan * 0.1 }, { lat: lat + latSpan * 0.1, lon }, { lat, lon }] },
        ] }),
      });
    }
    // Deliberately fail background maps; email must still function without them.
    if (u.hostname === 'unpkg.com' || u.hostname.endsWith('.tile.openstreetmap.org')) return route.abort();
    if (u.hostname === 'fonts.googleapis.com' || u.hostname === 'fonts.gstatic.com' || u.hostname === 'images.unsplash.com') return route.fulfill({ status: 200, body: '' });
    state.unexpected.push(u.hostname); return route.abort();
  });
  state.assertClean = () => { expect(state.unexpected).toEqual([]); expect(state.errors).toEqual([]); };
  return state;
}
export async function openCurated(page, query = '') {
  await page.goto(`/tests/email/index.html${query}`);
  await page.getByTestId('card-tour-fixture-curated').click();
  await page.getByTestId('button-email-walk').click();
}
export async function fillEmail(page, address = 'myself@example.invalid') {
  await page.getByTestId('input-email-walk').fill(address);
  await page.getByTestId('checkbox-email-consent').check();
  await page.getByTestId('fixture-security-check').click();
}