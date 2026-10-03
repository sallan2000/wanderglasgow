import { useEffect, useRef, useState } from 'react';
import { loadLeaflet } from './browser-helpers';
import { MapTileNotice, useMapTiles } from './map-tiles';
import type { Stop } from './tours';
import type { WalkGeometry } from './walk-store';

type Props = { stops: Stop[]; geometry: WalkGeometry | null };

/** Read-only route preview: never infer a path from stop coordinates. */
export default function AdminWalkMap({ stops, geometry }: Props) {
  const canvas = useRef<HTMLDivElement>(null);
  const map = useRef<any>(null);
  const layers = useRef<any>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [failure, setFailure] = useState<'leaflet' | 'initialization' | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [mapVersion, setMapVersion] = useState(0);
  const tiles = useMapTiles();

  useEffect(() => {
    let active = true;
    let resize: ResizeObserver | undefined;
    let detachTiles: (() => void) | undefined;
    setStatus('loading');
    setFailure(null);
    loadLeaflet().then(L => {
      if (!active || !canvas.current) return;
      let m: any;
      try {
        // Establish the view before constructing vector overlays.
        m = L.map(canvas.current, { scrollWheelZoom: false });
        map.current = m;
        m.setView([55.8642, -4.2518], 13);
        detachTiles = tiles.attach(L, m);
        layers.current = L.featureGroup().addTo(m);
        resize = new ResizeObserver(() => m.invalidateSize());
        resize.observe(canvas.current);
        setStatus('ready');
        // A cached loader can resolve within the same React batch as loading.
        // Signal the new map instance even if status ends up unchanged.
        setMapVersion(version => version + 1);
      } catch {
        detachTiles?.();
        m?.remove();
        if (map.current === m) map.current = null;
        layers.current = null;
        setFailure('initialization');
        setStatus('error');
      }
    }, () => {
      if (!active) return;
      detachTiles?.();
      map.current?.remove(); map.current = null; layers.current = null;
      setFailure('leaflet');
      setStatus('error');
    });
    return () => {
      active = false; resize?.disconnect(); detachTiles?.();
      map.current?.remove(); map.current = null; layers.current = null;
    };
  }, [attempt, tiles.attach]);

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
      setFailure('initialization');
      setStatus('error');
    }
  }, [stops, geometry, status, mapVersion]);

  return <div className="walk-map-preview">
    <div className="walk-map-canvas" ref={canvas} aria-label="Interactive map of ordered walk stops" data-testid="walk-map-preview" />
    {status === 'loading' && <p className="adm-hint" role="status">Loading map…</p>}
    {status === 'error' && failure === 'leaflet' && <div className="adm-msg err" role="alert" data-testid="walk-status-map-error" data-failure="leaflet">
      Leaflet could not load, so the interactive preview is unavailable. Your stops and stories are still available below.{' '}
      <button type="button" className="adm-btn link" onClick={() => setAttempt(a => a + 1)}>Retry loading Leaflet</button>
    </div>}
    {status === 'error' && failure === 'initialization' && <div className="adm-msg err" role="alert" data-testid="walk-status-map-error" data-failure="initialization">
      Leaflet loaded, but the preview map could not be initialized. Your stops and stories are still available below.{' '}
      <button type="button" className="adm-btn link" onClick={() => setAttempt(a => a + 1)}>Retry map initialization</button>
    </div>}
    {status === 'ready' && <MapTileNotice
      tiles={tiles}
      preserved="Stops and any calculated route remain visible, but the background map may be incomplete."
      testId="walk"
      noticeTestId="walk-status-tile-error"
      className="adm-msg err"
      retryClassName="adm-btn link"
      retryLabel="Retry map tiles"
    />}
    <p className="adm-hint">Drag to pan; use + / − to zoom. Numbered pins match the stop list. The line, when available, follows the walking network, not straight lines between stops. No location access is needed.</p>
  </div>;
}