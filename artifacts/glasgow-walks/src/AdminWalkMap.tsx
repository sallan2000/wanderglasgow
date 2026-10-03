import { useEffect, useRef, useState } from 'react';
import { loadLeaflet } from './browser-helpers';
import type { Stop } from './tours';
import type { WalkGeometry } from './walk-store';

type Props = { stops: Stop[]; geometry: WalkGeometry | null };

/** Read-only route preview: never infer a path from stop coordinates. */
export default function AdminWalkMap({ stops, geometry }: Props) {
  const canvas = useRef<HTMLDivElement>(null);
  const map = useRef<any>(null);
  const layers = useRef<any>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [tileError, setTileError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [mapVersion, setMapVersion] = useState(0);

  useEffect(() => {
    let active = true;
    let resize: ResizeObserver | undefined;
    setStatus('loading'); setTileError(false);
    loadLeaflet().then(L => {
      if (!active || !canvas.current) return;
      // Establish the view before constructing vector overlays.
      const m = L.map(canvas.current, { scrollWheelZoom: false }).setView([55.8642, -4.2518], 13);
      map.current = m;
      const tiles = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19, attribution: '&copy; OpenStreetMap contributors',
      });
      tiles.on('tileerror', () => { if (active) setTileError(true); });
      tiles.addTo(m);
      layers.current = L.featureGroup().addTo(m);
      resize = new ResizeObserver(() => m.invalidateSize());
      resize.observe(canvas.current);
      setStatus('ready');
      // A cached loader can resolve within the same React batch as loading.
      // Signal the new map instance even if status ends up unchanged.
      setMapVersion(version => version + 1);
    }).catch(() => {
      if (!active) return;
      map.current?.remove(); map.current = null; layers.current = null;
      setStatus('error');
    });
    return () => {
      active = false; resize?.disconnect();
      map.current?.remove(); map.current = null; layers.current = null;
    };
  }, [attempt]);

  useEffect(() => {
    const L = window.L, m = map.current, group = layers.current;
    if (status !== 'ready' || !L || !m || !group) return;
    group.clearLayers();
    try {
      if (geometry) L.geoJSON(geometry, { style: { color: '#183a36', weight: 5, opacity: 0.9 } }).addTo(group);
      stops.forEach((stop, i) => {
        if (!Number.isFinite(stop.lat) || !Number.isFinite(stop.lon) || Math.abs(stop.lat) > 90 || Math.abs(stop.lon) > 180) return;
        const label = `${i + 1}. ${stop.name}`;
        const tip = document.createElement('span');
        tip.textContent = label;
        L.marker([stop.lat, stop.lon], {
          title: label, alt: label,
          icon: L.divIcon({ className: '', html: `<div class="walk-map-pin">${i + 1}</div>`, iconSize: [28, 28], iconAnchor: [14, 14] }),
        }).addTo(group).bindTooltip(tip);
      });
      const bounds = group.getBounds();
      if (bounds.isValid()) m.fitBounds(bounds, { padding: [30, 30], maxZoom: 16 });
    } catch {
      group.clearLayers();
      setStatus('error');
    }
  }, [stops, geometry, status, mapVersion]);

  return <div className="walk-map-preview">
    <div className="walk-map-canvas" ref={canvas} aria-label="Interactive map of ordered walk stops" data-testid="walk-map-preview" />
    {status === 'loading' && <p className="adm-hint" role="status">Loading map…</p>}
    {status === 'error' && <div className="adm-msg err" role="alert" data-testid="walk-status-map-error">The interactive map could not load. Your stops and stories are still available below. <button type="button" className="adm-btn link" onClick={() => setAttempt(a => a + 1)}>Retry map</button></div>}
    {tileError && status !== 'error' && <div className="adm-msg err" role="alert" data-testid="walk-status-tile-error">OpenStreetMap tiles could not load completely. Stops and any calculated route remain visible, but the background map may be incomplete. <button type="button" className="adm-btn link" onClick={() => setAttempt(a => a + 1)}>Retry map tiles</button></div>}
    <p className="adm-hint">Drag to pan; use + / − to zoom. Numbered pins match the stop list. The line, when available, follows the walking network, not straight lines between stops. No location access is needed.</p>
  </div>;
}