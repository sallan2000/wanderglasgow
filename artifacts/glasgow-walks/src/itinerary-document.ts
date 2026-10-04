import { ACCESS_FIELDS, validateAccessDetails } from './access-details';
import type { Position } from './attractions';
import type { ItinerarySnapshot, ItineraryStop } from './itinerary-snapshot';
import { itineraryStyles } from './itinerary-style';

const escape = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
const coordinate = (point: Position) => `${point.lat.toFixed(6)}, ${point.lon.toFixed(6)}`;
const validPosition = (p: Position) => p && Number.isFinite(p.lat) && Number.isFinite(p.lon) &&
  Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180;

function validate(itinerary: ItinerarySnapshot) {
  const t = itinerary;
  if (!t || !['curated', 'planned'].includes(t.kind) || !validPosition(t.start) ||
    !Array.isArray(t.stops) || !t.stops.length || t.stops.length > 30 ||
    !Number.isFinite(t.distanceMeters) || t.distanceMeters < 0 ||
    !Number.isFinite(t.durationSeconds) || t.durationSeconds < 0 ||
    [t.title, t.description, t.category, t.start.label].some(v => typeof v !== 'string') ||
    t.stops.some(s => !validPosition(s) || [s.name, s.place, s.story].some(v => typeof v !== 'string'))) {
    throw new Error('This itinerary is incomplete. Please choose a complete walk before printing or downloading.');
  }
  for (const stop of t.stops) if (stop.access !== undefined) validateAccessDetails(stop.access);
  if (t.geometry && (t.kind !== 'planned' || t.geometry.type !== 'LineString' ||
    !Array.isArray(t.geometry.coordinates) || t.geometry.coordinates.length < 2 ||
    t.geometry.coordinates.length > 100000 || t.geometry.coordinates.some(p =>
      !Array.isArray(p) || p.length !== 2 || !validPosition({ lon: p[0], lat: p[1] })))) {
    throw new Error('This walking route has invalid geometry. Please calculate the walk again before exporting.');
  }
}

// This is a route-shape illustration, not a street map. Use only an actual
// calculated LineString; never connect the curated stops with a fabricated path.
function routeIllustration(t: ItinerarySnapshot): string {
  if (!t.geometry) return '';
  const lonScale = Math.max(0.01, Math.cos(t.start.lat * Math.PI / 180));
  const points = t.geometry.coordinates.map(([lon, lat]) => [lon * lonScale, -lat]);
  const markers = [t.start, ...t.stops].map(p => [p.lon * lonScale, -p.lat]);
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of [...points, ...markers]) {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  const scale = Math.min(640 / Math.max(maxX - minX, 1e-6), 340 / Math.max(maxY - minY, 1e-6));
  const project = ([x, y]: number[]) => [
    (360 + (x - (minX + maxX) / 2) * scale).toFixed(2),
    (210 + (y - (minY + maxY) / 2) * scale).toFixed(2),
  ];
  return `<figure class="route-figure">
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 420" role="img" aria-labelledby="route-title route-description">
<title id="route-title">Calculated walking-route shape</title>
<desc id="route-description">North is up. S is the chosen start; numbers match the ordered stops. There is no street background or turn-by-turn navigation.</desc>
<rect x="1" y="1" width="718" height="418" rx="8" fill="#f7f7f4" stroke="#b5bdb9"/>
<polyline points="${points.map(p => project(p).join(',')).join(' ')}" fill="none" stroke="#183a36" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"/>
${markers.map((point, i) => {
    const [x, y] = project(point);
    return `<g><circle cx="${x}" cy="${y}" r="12" fill="${i ? '#fff' : '#183a36'}" stroke="#183a36" stroke-width="2"/><text x="${x}" y="${y}" dy="4" text-anchor="middle" font-family="Arial,sans-serif" font-size="12" font-weight="bold" fill="${i ? '#183a36' : '#fff'}">${i || 'S'}</text></g>`;
  }).join('')}
</svg>
<figcaption class="route-credit">Calculated route shape only · north up · no street map. Route data © OpenStreetMap contributors (${escape('https://www.openstreetmap.org/copyright')}).</figcaption>
</figure>`;
}

function accessDetails(stop: ItineraryStop): string {
  if (stop.access === undefined) return '<section class="access"><h4>Attraction access: Unknown</h4><p>No structured access information is included in this snapshot. Check locally.</p></section>';
  const a = validateAccessDetails(stop.access);
  const labels = { unknown: 'Unknown', yes: 'Yes', no: 'No' };
  return `<section class="access"><h4>Attraction access (owner-provided, not certified)</h4>
<ul>${ACCESS_FIELDS.map(f => `<li>${escape(f.label)}: ${labels[a[f.key]]}</li>`).join('')}</ul>
${a.notes ? `<p class="notes">Owner-provided note: ${escape(a.notes)}</p>` : ''}</section>`;
}

export function itineraryFilename(itinerary: ItinerarySnapshot): string {
  const slug = itinerary.title.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
  return `wander-glasgow-${slug || 'itinerary'}.html`;
}

export function itineraryDocument(itinerary: ItinerarySnapshot, savedAt = new Date()): string {
  validate(itinerary);
  if (!Number.isFinite(savedAt.getTime())) throw new Error('The itinerary date is invalid.');
  const t = itinerary;
  const metricLabel = t.kind === 'planned' ? 'Calculated walking totals' : 'Curated walking estimates';
  const note = t.kind === 'planned'
    ? 'This copy includes the chosen starting coordinates and, when available, the calculated route shape. The start may be your GPS location. The file stays on your device unless you share it; this export does not upload or retain your itinerary on the site.'
    : 'This is the editorial itinerary from its listed start. It does not include a GPS connection or a calculated pedestrian-route illustration, even if you separately previewed a walking route.';
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<meta name="referrer" content="no-referrer"><title>${escape(t.title)} · Wander Glasgow</title>
<style>${itineraryStyles}</style></head><body><main class="itinerary">
<header><p class="brand">WANDER GLASGOW</p><p class="kicker">${t.kind === 'planned' ? 'Calculated walk' : 'Curated walk'} · ${escape(t.category)}</p>
<h1>${escape(t.title)}</h1><p class="description">${escape(t.description)}</p>
<p class="summary">${metricLabel}: ${(t.distanceMeters / 1000).toFixed(2)} km · about ${Math.ceil(t.durationSeconds / 60)} min walking · ${t.stops.length} stops. Time at stops is not included.</p>
<p class="snapshot-time">Snapshot prepared ${escape(savedAt.toISOString())}. This is a fixed copy; details and local conditions can change.</p></header>
<section class="start"><h2>Starting point</h2><p>${escape(t.start.label)}<br>Coordinates: ${coordinate(t.start)}</p></section>
${routeIllustration(t)}
<section class="stops"><h2>Your stops, in order</h2>
${t.stops.map((stop, i) => `<article class="stop"><h3>${i + 1}. ${escape(stop.name)}</h3>
<p class="place">${escape(stop.place)} · ${coordinate(stop)}</p><p class="story">${escape(stop.story)}</p>${accessDetails(stop)}</article>`).join('\n')}
</section><footer>
<p class="caveat">This is an itinerary, not turn-by-turn navigation. Check opening hours, pedestrian access and local conditions. Attraction access records are owner-provided, not certification; Unknown is not Yes or No. Paths between sights have not been assessed for accessibility. This is not a promise of an accessible route.</p>
<p class="privacy">${escape(note)}</p>
<p class="offline-help">This self-contained file can be read offline and printed using your browser’s Print menu, including Save as PDF where supported. It does not load live maps, update your location or calculate new walks.</p>
</footer></main></body></html>`;
}