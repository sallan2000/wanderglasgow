import { ACCESS_FIELDS, validateAccessDetails } from './access-details';
import type { Position } from './attractions';
import type { ItinerarySnapshot, ItineraryStop } from './itinerary-snapshot';
import { validateItineraryMapSnapshot, type ItineraryMapSnapshot } from './itinerary-map';
import { itineraryStyles } from './itinerary-style';

const escape = (value: string) => value
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');
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
  if (t.accessPreference !== undefined && t.accessPreference !== 'any' && t.accessPreference !== 'step-free') {
    throw new Error('Invalid access preference in this itinerary.');
  }
  for (const stop of t.stops) if (stop.access !== undefined) validateAccessDetails(stop.access);
  if (t.geometry && (t.kind !== 'planned' || t.geometry.type !== 'LineString' ||
    !Array.isArray(t.geometry.coordinates) || t.geometry.coordinates.length < 2 ||
    t.geometry.coordinates.length > 100000 || t.geometry.coordinates.some(p =>
      !Array.isArray(p) || p.length !== 2 || !validPosition({ lon: p[0], lat: p[1] })))) {
    throw new Error('This walking route has invalid geometry. Please calculate the walk again before exporting.');
  }
}

function projectMapPoint(point: Position, bounds: ItineraryMapSnapshot['bounds'], unitScale: number) {
  const latitude = (bounds.south + bounds.north) / 2;
  const xScale = 111_320 * Math.max(0.01, Math.cos(latitude * Math.PI / 180));
  return [
    ((point.lon - bounds.west) * xScale / unitScale).toFixed(1),
    ((bounds.north - point.lat) * 111_320 / unitScale).toFixed(1),
  ];
}

function mapPath(
  coordinates: Position[],
  bounds: ItineraryMapSnapshot['bounds'],
  unitScale: number,
  closed: boolean,
): string {
  const projected = coordinates.map(point => projectMapPoint(point, bounds, unitScale).map(Number));
  const simplified: number[][] = [];
  const toleranceSquared = 0.45 * 0.45;
  for (const point of projected) {
    const previous = simplified.at(-1);
    if (!previous || (point[0] - previous[0]) ** 2 + (point[1] - previous[1]) ** 2 >= toleranceSquared) {
      simplified.push(point);
    }
  }
  const last = projected.at(-1);
  if (last && simplified.at(-1) !== last) simplified.push(last);
  if (simplified.length < (closed ? 3 : 2)) return '';
  return `M${simplified.map(point => `${point[0].toFixed(1)} ${point[1].toFixed(1)}`).join('L')}${closed ? 'Z' : ''}`;
}

function mapMarkers(t: ItinerarySnapshot, bounds: ItineraryMapSnapshot['bounds'], unitScale: number) {
  const markers: Array<{ point: Position; label: string; start: boolean }> = [
    { point: t.start, label: 'S', start: true },
  ];
  t.stops.forEach((stop, index) => {
    const existing = markers.find(marker =>
      Math.abs(marker.point.lat - stop.lat) < 0.00004 && Math.abs(marker.point.lon - stop.lon) < 0.00004);
    if (existing) existing.label = `${existing.label}/${index + 1}`;
    else markers.push({ point: stop, label: String(index + 1), start: false });
  });
  return markers.map(marker => {
    const [x, y] = projectMapPoint(marker.point, bounds, unitScale);
    const fill = marker.start ? '#183a36' : '#ffffff';
    const text = marker.start ? '#ffffff' : '#183a36';
    const fontSize = marker.label.length > 2 ? 8 : 11;
    return `<g data-map-marker="${marker.label}"><circle cx="${x}" cy="${y}" r="12" fill="${fill}" stroke="#183a36" stroke-width="2"/><text x="${x}" y="${y}" dy="4" text-anchor="middle" font-family="Arial,sans-serif" font-size="${fontSize}" font-weight="bold" fill="${text}">${marker.label}</text></g>`;
  }).join('\n');
}

function mapIllustration(t: ItinerarySnapshot, map: ItineraryMapSnapshot): string {
  const { bounds } = map;
  const latitude = (bounds.south + bounds.north) / 2;
  const metresPerLongitudeDegree = 111_320 * Math.max(0.01, Math.cos(latitude * Math.PI / 180));
  const widthMeters = (bounds.east - bounds.west) * metresPerLongitudeDegree;
  const heightMeters = (bounds.north - bounds.south) * 111_320;
  const unitScale = Math.max(widthMeters, heightMeters) / 720;
  const viewWidth = (widthMeters / unitScale).toFixed(1);
  const viewHeight = (heightMeters / unitScale).toFixed(1);
  const featurePath = (feature: ItineraryMapSnapshot['features'][number]) =>
    mapPath(feature.coordinates, bounds, unitScale, feature.closed);
  const greenAreas = map.features.filter(feature => feature.kind === 'green').map(feature => {
    const path = featurePath(feature);
    return path ? `<path d="${path}" fill="#dcead5" stroke="#c5d9bc" stroke-width="1"/>` : '';
  }).join('\n');
  const waterAreas = map.features.filter(feature => feature.kind === 'water').map(feature => {
    const path = featurePath(feature);
    return path ? `<path d="${path}" fill="${feature.closed ? '#d8eaf0' : 'none'}" stroke="#9fcbd8" stroke-width="${feature.closed ? 1 : 3}"/>` : '';
  }).join('\n');
  const waterways = map.features.filter(feature => feature.kind === 'waterway').map(feature => {
    const path = featurePath(feature);
    return path ? `<path d="${path}" fill="none" stroke="#a8d4e1" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>` : '';
  }).join('\n');
  const roads = map.features.filter(feature => feature.kind === 'road').map(feature => {
    const path = featurePath(feature);
    if (!path) return '';
    const major = ['motorway', 'trunk', 'primary'].includes(feature.subtype);
    const secondary = ['secondary', 'tertiary'].includes(feature.subtype);
    const casing = major ? 7 : secondary ? 5 : 3.4;
    const width = major ? 4 : secondary ? 2.6 : 1.5;
    const color = major ? '#e4c989' : secondary ? '#fffdf6' : '#ffffff';
    const outline = major ? '#c6b17e' : '#c6ceca';
    return `<g fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="${path}" stroke="${outline}" stroke-width="${casing}"/><path d="${path}" stroke="${color}" stroke-width="${width}"/></g>`;
  }).join('\n');
  const roadLabels = [...new Set(map.features
    .filter(feature => feature.kind === 'road' && feature.name &&
      ['primary', 'secondary', 'tertiary', 'residential'].includes(feature.subtype))
    .map(feature => feature.name!))].slice(0, 24).map(name => {
      const feature = map.features.find(candidate => candidate.kind === 'road' && candidate.name === name)!;
      const midpoint = feature.coordinates[Math.floor(feature.coordinates.length / 2)];
      const [x, y] = projectMapPoint(midpoint, bounds, unitScale);
      return `<text x="${x}" y="${y}" font-family="Arial,sans-serif" font-size="9" fill="#34433d" stroke="#f5f2e9" stroke-width="3" paint-order="stroke" text-anchor="middle">${escape(name)}</text>`;
    }).join('\n');
  const routePath = t.geometry
    ? mapPath(t.geometry.coordinates.map(([lon, lat]) => ({ lon, lat })), bounds, unitScale, false)
    : '';
  const routeLine = routePath
    ? `<path d="${routePath}" fill="none" stroke="#ffffff" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/><path data-route-line="true" d="${routePath}" fill="none" stroke="#183a36" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`
    : '';
  const description = t.geometry
    ? 'OpenStreetMap street background with the calculated walking route. S is the start and numbered circles match the stops in order. North is up; this is not turn-by-turn navigation.'
    : 'OpenStreetMap street background with the start and numbered stop positions. No calculated pedestrian route is shown. North is up.';
  const routeNote = t.geometry
    ? 'The calculated pedestrian route is shown over the street map.'
    : 'Numbered stop positions only · no calculated pedestrian route is shown.';

  return `<figure class="route-figure">
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewWidth} ${viewHeight}" role="img" aria-labelledby="route-map-title route-map-description">
<title id="route-map-title">Street map for ${escape(t.title)}</title>
<desc id="route-map-description">${description}</desc>
<defs><clipPath id="map-clip"><rect x="0" y="0" width="${viewWidth}" height="${viewHeight}"/></clipPath></defs>
<rect x="0" y="0" width="${viewWidth}" height="${viewHeight}" fill="#f5f2e9"/>
<g clip-path="url(#map-clip)">${greenAreas}${waterAreas}${waterways}${roads}${roadLabels}${routeLine}${mapMarkers(t, bounds, unitScale)}</g>
</svg>
<figcaption class="route-credit">${routeNote} Map data © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a> (ODbL). North is up.</figcaption>
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
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
  return `wander-glasgow-${slug || 'itinerary'}.html`;
}

export function itineraryDocument(
  itinerary: ItinerarySnapshot,
  map: ItineraryMapSnapshot,
  savedAt = new Date(),
): string {
  validate(itinerary);
  validateItineraryMapSnapshot(map);
  if (!Number.isFinite(savedAt.getTime())) throw new Error('The itinerary date is invalid.');
  const t = itinerary;
  const metricLabel = t.kind === 'planned' ? 'Calculated walking totals' : 'Curated walking estimates';
  const note = t.kind === 'planned'
    ? 'This copy includes your chosen starting coordinates and the calculated route, which may include your GPS location. To add its street map, the approximate walk area and standard request information are sent to OpenStreetMap; the itinerary file and stop stories are not. The completed file stays on your device unless you share it.'
    : 'This editorial copy shows the listed start and stops on an OpenStreetMap street map, without a GPS connection or calculated pedestrian route. The approximate map area and standard request information are sent to OpenStreetMap; the itinerary file and stop stories are not.';
  const accessNote = t.accessPreference === 'step-free'
    ? '<p class="access-note">This walk was constrained to attractions with a recorded step-free entrance. Unknown access is excluded. This is not an accessibility certification; paths between sights have not been assessed.</p>'
    : '';
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<meta name="referrer" content="no-referrer"><title>${escape(t.title)} · Wander Glasgow</title>
<style>${itineraryStyles}</style></head><body><main class="itinerary">
<header><p class="brand">WANDER GLASGOW</p><p class="kicker">${t.kind === 'planned' ? 'Calculated walk' : 'Curated walk'} · ${escape(t.category)}</p>
<h1>${escape(t.title)}</h1><p class="description">${escape(t.description)}</p>
<p class="summary">${metricLabel}: ${(t.distanceMeters / 1000).toFixed(2)} km · about ${Math.ceil(t.durationSeconds / 60)} min walking · ${t.stops.length} stops. Time at stops is not included.</p>
${accessNote}
<p class="snapshot-time">Snapshot prepared ${escape(savedAt.toISOString())}. This is a fixed copy; details and local conditions can change.</p></header>
<section class="start"><h2>Starting point</h2><p>${escape(t.start.label)}<br>Coordinates: ${coordinate(t.start)}</p></section>
 ${mapIllustration(t, map)}
<section class="stops"><h2>Your stops, in order</h2>
${t.stops.map((stop, i) => `<article class="stop"><h3>${i + 1}. ${escape(stop.name)}</h3>
<p class="place">${escape(stop.place)} · ${coordinate(stop)}</p><p class="story">${escape(stop.story)}</p>${accessDetails(stop)}</article>`).join('\n')}
</section><footer>
<p class="caveat">This is an itinerary, not turn-by-turn navigation. Check opening hours, pedestrian access and local conditions. Attraction access records are owner-provided, not certification; Unknown is not Yes or No. Paths between sights have not been assessed for accessibility. This is not a promise of an accessible route.</p>
<p class="privacy">${escape(note)}</p>
 <p class="offline-help">This self-contained file embeds the street map and can be read offline or printed using your browser’s Print menu, including Save as PDF where supported. It does not load more map data, update your location or calculate new walks.</p>
</footer></main></body></html>`;
}
