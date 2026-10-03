import { useEffect, useRef, useState } from 'react';
import { loadLeaflet } from './browser-helpers';
import { MapTileNotice, useMapTiles } from './map-tiles';

const GLASGOW: [number, number] = [55.8642, -4.2518];
type Props = { lat: number | null; lon: number | null; label: string; onPick: (lat: number, lon: number) => void };

export default function AdminMap({ lat, lon, label, onPick }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<any>(null);
  const marker = useRef<any>(null);
  const pick = useRef(onPick);
  pick.current = onPick;
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [failure, setFailure] = useState<'library' | 'construction'>('library');
  const [attempt, setAttempt] = useState(0);
  const tiles = useMapTiles();
  const round = (n: number) => Math.round(n * 1e6) / 1e6;
  const tip = (m: any) => {
    const node = document.createElement('span');
    node.textContent = label || 'Attraction location';
    m.unbindTooltip();
    m.bindTooltip(node, { direction: 'top', offset: [0, -14] });
  };

  useEffect(() => {
    let active = true;
    let constructed = false;
    let detachTiles: (() => void) | undefined;
    let resize: ReturnType<typeof setTimeout> | undefined;
    setState('loading');
    loadLeaflet().then((L) => {
      if (!active || !el.current || map.current) return;
      constructed = true;
      const m = L.map(el.current, { scrollWheelZoom: false });
      map.current = m;
      m.setView(GLASGOW, 13);
      detachTiles = tiles.attach(L, m);
      m.on('click', (e: any) => pick.current(round(e.latlng.lat), round(e.latlng.lng)));
      map.current = m;
      setState('ready');
      resize = setTimeout(() => { if (active) m.invalidateSize(); }, 250);
    }).catch(() => {
      if (!active) return;
      detachTiles?.();
      map.current?.remove(); map.current = null; marker.current = null;
      setFailure(constructed ? 'construction' : 'library'); setState('error');
    });
    return () => { active = false; clearTimeout(resize); detachTiles?.(); if (map.current) { map.current.remove(); map.current = null; marker.current = null; } };
  }, [attempt, tiles.attach]);

  useEffect(() => {
    const L = window.L;
    const m = map.current;
    if (state !== 'ready' || !m || !L) return;
    const valid = lat !== null && lon !== null && Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
    if (!valid) { if (marker.current) { marker.current.remove(); marker.current = null; } return; }
    if (!marker.current) {
      const icon = L.divIcon({ className: '', html: '<div class="adm-pin"></div>', iconSize: [22, 22], iconAnchor: [3, 22] });
      marker.current = L.marker([lat, lon], { draggable: true, icon }).addTo(m);
      marker.current.on('dragend', () => { const p = marker.current.getLatLng(); pick.current(round(p.lat), round(p.lng)); });
      m.setView([lat, lon], Math.max(m.getZoom(), 15));
    } else {
      const p = marker.current.getLatLng();
      if (p.lat !== lat || p.lng !== lon) { marker.current.setLatLng([lat, lon]); if (!m.getBounds().contains([lat, lon])) m.panTo([lat, lon]); }
    }
    tip(marker.current);
  }, [lat, lon, state, label]);

  return (
    <div>
      <div className="adm-map" data-testid="map-picker">
        <div className="map-canvas" ref={el} />
        {state === 'loading' && <div className="map-status">Loading map…</div>}
        {state === 'error' && <div className="map-status routing-error" role="alert" data-testid="status-map-error">
          {failure === 'library' ? 'The map library or styles could not load. Check your connection.' : 'The interactive map could not be initialized. This is not a background-tile failure.'} Enter the coordinates by hand instead; your selected coordinates are unchanged.
          <button type="button" className="chip" onClick={() => setAttempt(n => n + 1)} data-testid="button-map-retry">Retry map</button>
        </div>}
      </div>
      {state === 'ready' && <MapTileNotice tiles={tiles} preserved="Your selected pin and coordinates are unchanged. You can still move the pin or enter coordinates by hand." testId="picker-map" />}
      <p className="adm-hint">Click the map to place the pin, then drag it to fine-tune. Map tiles © OpenStreetMap contributors.</p>
    </div>
  );
}
