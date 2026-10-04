import type { EmailWalk } from './contract.ts';

export class DeliveryError extends Error {
  constructor(public code: string, public status = 503) { super(code); }
}
export type EmailStop = { name: string; place: string; story: string; lat: number; lon: number };
export type Itinerary = {
  kind: 'planned' | 'curated'; title: string; description: string;
  origin: { lat: number; lon: number }; start: string; stops: EmailStop[];
  distanceMeters: number; durationSeconds: number;
};
export type ReadTable = (table: string, params: URLSearchParams) => Promise<unknown[]>;
const text = (v: unknown, max: number): string => {
  if (typeof v !== 'string' || v.length > max) throw new DeliveryError('service_unavailable');
  return v;
};
const metric = (v: unknown, max: number): number => {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > max) throw new DeliveryError('service_unavailable');
  return v;
};
function stop(value: unknown): EmailStop {
  if (!value || typeof value !== 'object') throw new DeliveryError('service_unavailable');
  const s = value as Record<string, unknown>;
  const lat = s.lat, lon = s.lon;
  if (typeof lat !== 'number' || !Number.isFinite(lat) || Math.abs(lat) > 90 ||
    typeof lon !== 'number' || !Number.isFinite(lon) || Math.abs(lon) > 180) throw new DeliveryError('service_unavailable');
  return { name: text(s.name, 200), place: text(s.place, 300), story: text(s.story, 5000), lat, lon };
}
export async function resolveItinerary(walk: EmailWalk, read: ReadTable): Promise<Itinerary> {
  if (walk.kind === 'curated') {
    const rows = await read('glasgow_curated_walks', new URLSearchParams({
      id: `eq.${walk.walkId}`, published: 'eq.true',
      select: 'title,subtitle,stops,distance_km,minutes', limit: '1',
    }));
    if (rows.length !== 1) throw new DeliveryError('unavailable_walk', 409);
    const row = rows[0] as Record<string, unknown>;
    if (!Array.isArray(row.stops) || row.stops.length < 2 || row.stops.length > 30) throw new DeliveryError('service_unavailable');
    const stops = row.stops.map(stop);
    return { kind: 'curated', title: text(row.title, 200), description: text(row.subtitle, 1000),
      origin: { lat: stops[0].lat, lon: stops[0].lon }, start: stops[0].name, stops,
      distanceMeters: metric(row.distance_km, 100) * 1000, durationSeconds: metric(row.minutes, 10000) * 60 };
  }
  const rows = await read('glasgow_attractions', new URLSearchParams({
    id: `in.(${walk.stopIds.join(',')})`, published: 'eq.true',
    select: 'id,name,place,description,latitude,longitude', limit: '6',
  }));
  const byId = new Map(rows.map(value => {
    const row = value as Record<string, unknown>;
    return [row.id, stop({ ...row, story: row.description, lat: row.latitude, lon: row.longitude })] as const;
  }));
  const stops = walk.stopIds.map(id => {
    const result = byId.get(id);
    if (!result) throw new DeliveryError('unavailable_walk', 409);
    return result;
  });
  return { kind: 'planned', title: 'Your calculated Glasgow walk', description: 'The stops you selected, in your calculated walking order.',
    origin: walk.origin, start: 'Your chosen starting coordinates', stops,
    distanceMeters: walk.distanceMeters, durationSeconds: walk.durationSeconds };
}

const escape = (text: string) => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
const coord = (p: { lat: number; lon: number }) => `${p.lat.toFixed(6)}, ${p.lon.toFixed(6)}`;
const mapLink = (p: { lat: number; lon: number }) => `https://www.openstreetmap.org/?mlat=${p.lat.toFixed(6)}&mlon=${p.lon.toFixed(6)}#map=17/${p.lat.toFixed(6)}/${p.lon.toFixed(6)}`;
export function renderItinerary(itinerary: Itinerary): { subject: string; html: string; text: string } {
  const t = itinerary;
  const type = t.kind === 'planned' ? 'Calculated route' : 'Editorial curated walk';
  const metrics = `${(t.distanceMeters / 1000).toFixed(1)} km · about ${Math.ceil(t.durationSeconds / 60)} min walking, excluding time at stops`;
  const note = t.kind === 'planned'
    ? 'Walking totals were calculated in your browser. Published stop descriptions are checked again when this email is requested.'
    : 'This is the published curated itinerary from its listed start. It does not include a GPS connection from your current location.';
  const disclaimer = 'This email is a stop itinerary, not turn-by-turn navigation. Check pedestrian access, opening hours and local conditions. The map links show locations, not a calculated route.';
  const footer = 'You requested this one-off email from Wander Glasgow. No mailing-list subscription was created. The website does not save your email address or walk; the email provider processes and may retain this message under its own policy.';
  const plain = ['Wander Glasgow', type, t.title, t.description, metrics, note,
    `Start: ${t.start} (${coord(t.origin)})`, mapLink(t.origin), 'Your stops, in order',
    ...t.stops.map((s, i) => `${i + 1}. ${s.name}\n${s.place}\n${s.story}\n${coord(s)}\n${mapLink(s)}`),
    disclaimer, footer].join('\n\n');
  const html = `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#f5f2e9;color:#183a36;font-family:Arial,sans-serif;line-height:1.6">
<div style="max-width:600px;margin:auto;padding:28px 20px">
<p style="font-weight:bold;letter-spacing:2px">WANDER GLASGOW</p><p>${escape(type)}</p>
<h1 style="font-size:28px;line-height:1.2">${escape(t.title)}</h1><p>${escape(t.description)}</p>
<p style="font-weight:bold">${escape(metrics)}</p><p>${escape(note)}</p>
<h2 style="font-size:20px">Starting point</h2><p>${escape(t.start)}<br>${coord(t.origin)}<br><a style="color:#183a36" href="${mapLink(t.origin)}">View starting point on OpenStreetMap</a></p>
<h2 style="font-size:20px">Your stops, in order</h2>
${t.stops.map((s, i) => `<div style="border-top:1px solid #cbd1c7;padding:16px 0"><h3 style="margin:0;font-size:18px">${i + 1}. ${escape(s.name)}</h3><p>${escape(s.place)}</p><p>${escape(s.story)}</p><a style="color:#183a36" href="${mapLink(s)}">View stop on OpenStreetMap</a></div>`).join('')}
<p>${escape(disclaimer)}</p><p style="font-size:12px;border-top:1px solid #cbd1c7;padding-top:16px">${escape(footer)}</p>
</div></body></html>`;
  // Fixed subject: visitor-supplied values cannot become headers.
  return { subject: `Wander Glasgow · ${type}`, html, text: plain };
}