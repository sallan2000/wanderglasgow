import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, Clock3, LocateFixed, MapPin, Navigation, Route as RouteIcon, X } from 'lucide-react';
import { tours, type Tour, type Theme } from './tours';

declare global {
  interface Window { L?: any; }
}

const themes: Theme[] = ['Art', 'Music', 'History', 'Sport'];
const themeCount = (theme: Theme) => `${String(tours.filter((tour) => tour.theme === theme).length).padStart(2, '0')} WALKS`;

type Position = { lat: number; lon: number };
type GeoStatus = 'idle' | 'loading' | 'success' | 'denied' | 'unavailable' | 'error';

function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  return new Promise<any>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('[data-leaflet]');
    if (existing) {
      existing.addEventListener('load', () => window.L ? resolve(window.L) : reject(new Error('Map library unavailable')));
      existing.addEventListener('error', () => reject(new Error('Could not load map library')));
      return;
    }
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(css);
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.async = true;
    script.dataset.leaflet = 'true';
    script.onload = () => window.L ? resolve(window.L) : reject(new Error('Map library unavailable'));
    script.onerror = () => reject(new Error('Could not load map library'));
    document.head.appendChild(script);
  });
}

function getPosition(): Promise<Position> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(Object.assign(new Error('Location is not available in this browser.'), { code: 0 }));
      return;
    }
    if (!window.isSecureContext) {
      reject(Object.assign(new Error('Location needs a secure HTTPS connection. Browse by starting point instead.'), { code: 0 }));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (location) => resolve({ lat: location.coords.latitude, lon: location.coords.longitude }),
      (error) => reject(error),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 },
    );
  });
}

function distanceKm(a: Position, b: Position) {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const dLat = radians(b.lat - a.lat);
  const dLon = radians(b.lon - a.lon);
  const value = Math.sin(dLat / 2) ** 2 + Math.cos(radians(a.lat)) * Math.cos(radians(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function locationMessage(status: GeoStatus, message: string) {
  if (status === 'denied') return 'Location permission was declined. No coordinates were saved. Choose any walk below to browse its stops and map.';
  if (status === 'unavailable') return 'Your position could not be found. Check your device location settings, or browse walks by their listed starting point.';
  if (status === 'error') return message || 'Location could not be checked. You can still explore all walks without it.';
  return message;
}

function App() {
  const [activeTheme, setActiveTheme] = useState<Theme | 'All'>('All');
  const [selected, setSelected] = useState<Tour | null>(null);
  const [geoStatus, setGeoStatus] = useState<GeoStatus>('idle');
  const [nearby, setNearby] = useState<{ tour: Tour; distance: number }[]>([]);
  const [geoMessage, setGeoMessage] = useState('');
  const [toast, setToast] = useState('');
  const tourList = useMemo(() => tours.filter((tour) => activeTheme === 'All' || tour.theme === activeTheme), [activeTheme]);
  const nearbyRef = useRef<HTMLDivElement>(null);

  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(''), 3800);
  };

  const requestNearby = async () => {
    setGeoStatus('loading');
    setNearby([]);
    setGeoMessage('');
    try {
      const position = await getPosition();
      const ranked = tours.map((tour) => ({
        tour,
        distance: distanceKm(position, { lat: tour.stops[0].lat, lon: tour.stops[0].lon }),
      })).sort((a, b) => a.distance - b.distance).slice(0, 3);
      setNearby(ranked);
      setGeoStatus('success');
      setGeoMessage('Closest starting points to your current position. Your coordinates stay on this device.');
      window.setTimeout(() => nearbyRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50);
    } catch (error) {
      const geoError = error as GeolocationPositionError & { code?: number };
      const status: GeoStatus = geoError.code === 1 ? 'denied' : geoError.code === 2 || geoError.code === 3 ? 'unavailable' : 'error';
      setGeoStatus(status);
      setGeoMessage(locationMessage(status, geoError.message));
    }
  };

  useEffect(() => {
    if (!selected) return;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') setSelected(null); };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [selected]);

  return (
    <main className="app-shell">
      <header className="topbar">
        <a href="#top" className="brand" data-testid="link-home" aria-label="Glasgow Walks home">
          <span className="brand-mark"><span>G</span></span>
          <span className="brand-name">Glasgow Walks</span>
        </a>
        <nav className="nav-links" aria-label="Main navigation">
          <button onClick={() => document.getElementById('walks')?.scrollIntoView({ behavior: 'smooth' })} data-testid="nav-browse">The walks</button>
          <button onClick={() => document.getElementById('themes')?.scrollIntoView({ behavior: 'smooth' })} data-testid="nav-themes">Explore by theme</button>
          <button className="nav-pill" onClick={() => document.getElementById('nearby')?.scrollIntoView({ behavior: 'smooth' })} data-testid="nav-nearby">Find a walk near me</button>
        </nav>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <div className="eyebrow">A local's guide, on foot</div>
          <h1>Glasgow is<br />better <em>on foot.</em></h1>
          <p>Take the long way round. Find the stories tucked between the big sights, with a local-made walk for whatever you’re curious about.</p>
          <div className="hero-actions">
            <button className="button-primary" onClick={() => document.getElementById('walks')?.scrollIntoView({ behavior: 'smooth' })} data-testid="button-explore-walks">Find your walk <ArrowRight size={17} /></button>
            <button className="button-secondary" onClick={() => document.getElementById('themes')?.scrollIntoView({ behavior: 'smooth' })} data-testid="button-browse-themes">Browse the themes <ArrowDown size={15} /></button>
          </div>
          <div className="hero-footnote">MADE FOR WANDERING · NO APP REQUIRED</div>
        </div>
        <div className="hero-art" aria-label="Illustrated map of Glasgow and a walking route">
          <div className="circle-note">GOOD<br />STORIES<br />AHEAD</div>
          <div className="map-illustration">
            <div className="map-river" />
            <div className="map-road road-a" /><div className="map-road road-b" /><div className="map-road road-c" />
            <div className="map-label loc-1">Kelvingrove</div><div className="map-label loc-2">The Barras</div><div className="map-label loc-3">City Centre</div>
            <div className="route-dash" /><div className="map-pin pin-one" /><div className="map-pin pin-two" />
            <div className="map-stamp">YOUR CITY<br />YOUR PACE</div>
          </div>
        </div>
      </section>

      <div className="intro-strip">
        <span>01 / Take a theme</span>
        <strong>Art, music, history, sport — follow what pulls you in.</strong>
        <span>02 / Take a turn</span>
      </div>

      <section className="section" id="themes">
        <div className="section-head">
          <div><div className="eyebrow">Pick your kind of Glasgow</div><h2>What brings you out?</h2></div>
          <p className="section-sub">Four ways into the city. Each walk is mapped, paced and packed with places worth stopping for.</p>
        </div>
        <div className="theme-list">
          {themes.map((theme, index) => (
            <button key={theme} className={`theme-button${activeTheme === theme ? ' active' : ''}`} onClick={() => { setActiveTheme(activeTheme === theme ? 'All' : theme); document.getElementById('walks')?.scrollIntoView({ behavior: 'smooth' }); }} data-testid={`filter-theme-${theme.toLowerCase()}`} aria-pressed={activeTheme === theme}>
              <span><span className="theme-count">{String(index + 1).padStart(2, '0')} / {themeCount(theme)}</span><br /><span className="theme-name">{theme}</span></span><ArrowRight size={17} />
            </button>
          ))}
        </div>
      </section>

      <section className="section tour-area" id="walks">
        <div className="section-head">
          <div><div className="eyebrow">The good stuff is in between</div><h2>{activeTheme === 'All' ? 'Walks worth taking.' : `${activeTheme}, on foot.`}</h2></div>
          <p className="section-sub">All distances are approximate walking routes. Open a walk for the stops, stories and directions.</p>
        </div>
        <div className="tour-toolbar">
          <p data-testid="text-tour-count">{String(tourList.length).padStart(2, '0')} CURATED WALKS</p>
          {activeTheme !== 'All' && <button className="button-secondary" onClick={() => setActiveTheme('All')} data-testid="button-clear-filter">Show all walks <X size={14} /></button>}
        </div>
        <div className="tour-list">
          {tourList.map((tour, index) => (
            <article className="tour-card" key={tour.id} role="button" tabIndex={0} onClick={() => setSelected(tour)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') setSelected(tour); }} data-testid={`card-tour-${tour.id}`}>
              <div><div className="tour-kicker">{tour.theme} · STARTS AT {tour.start}</div><h3>{tour.title}</h3><p>{tour.subtitle}</p><div className="tour-meta"><span><RouteIcon size={13} /> {tour.distanceKm.toFixed(1)} km</span><span><Clock3 size={13} /> {tour.minutes} min</span><span>{tour.stops.length} stops</span></div></div>
              <span className="tour-arrow"><ArrowRight size={16} /></span><span className="tour-number">{String(index + 1).padStart(2, '0')}</span>
            </article>
          ))}
        </div>
      </section>

      <section className="nearby-panel" id="nearby">
        <div>
          <div className="eyebrow">Out and about?</div>
          <h2>Let Glasgow meet you where you are.</h2>
          <p>Share your location just this once to see the closest walk starts. Your position is used on this device only, unless you choose to start a routed walk.</p>
        </div>
        <button className="location-button" disabled={geoStatus === 'loading'} onClick={requestNearby} data-testid="button-find-nearby">
          <LocateFixed size={17} /> {geoStatus === 'loading' ? 'Finding your position…' : 'Find walks near me'}
        </button>
        {(geoStatus !== 'idle' && geoStatus !== 'loading') && (
          <div className="nearby-results" ref={nearbyRef} aria-live="polite">
            <div className={geoStatus === 'success' ? '' : 'geo-message'} data-testid="status-location">{geoMessage}</div>
            {nearby.map(({ tour, distance }) => (
              <button className="nearby-result" key={tour.id} onClick={() => setSelected(tour)} data-testid={`nearby-tour-${tour.id}`}>
                <span>{tour.title}<small style={{ display: 'block', marginTop: 4, fontWeight: 400, color: '#586e5f' }}>Starts at {tour.start}</small></span>
                <span>{distance < 1 ? `${Math.round(distance * 1000)} m` : `${distance.toFixed(1)} km`} <ArrowRight size={14} /></span>
              </button>
            ))}
          </div>
        )}
      </section>

      <footer className="footer">
        <a href="#top" className="brand" data-testid="footer-brand"><span className="brand-mark"><span>G</span></span><span className="brand-name">Glasgow Walks</span></a>
        <span>Made for the city. Best enjoyed at your own pace.</span>
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" data-testid="link-osm-credit">Map data © OpenStreetMap contributors</a>
      </footer>

      {selected && <TourDetail tour={selected} onClose={() => setSelected(null)} notify={notify} />}
      {toast && <div className="toast" role="status" data-testid="status-toast">{toast}</div>}
    </main>
  );
}

function TourDetail({ tour, onClose, notify }: { tour: Tour; onClose: () => void; notify: (message: string) => void }) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);
  const routeLayer = useRef<any>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [routeState, setRouteState] = useState<'idle' | 'locating' | 'routing' | 'ready' | 'error'>('idle');
  const [routeError, setRouteError] = useState('');
  const [routeInfo, setRouteInfo] = useState('');

  useEffect(() => {
    let active = true;
    loadLeaflet().then((L) => {
      if (!active || !mapRef.current || mapInstance.current) return;
      const map = L.map(mapRef.current, { scrollWheelZoom: false, zoomControl: true, attributionControl: true }).setView([tour.stops[0].lat, tour.stops[0].lon], 14);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a>',
      }).addTo(map);
      const bounds: [number, number][] = [];
      tour.stops.forEach((stop, index) => {
        const point: [number, number] = [stop.lat, stop.lon];
        bounds.push(point);
        L.circleMarker(point, { radius: 8, color: '#f5f2e9', weight: 3, fillColor: '#d86543', fillOpacity: 1 })
          .addTo(map).bindTooltip(`${index + 1}. ${stop.name}`, { direction: 'top', offset: [0, -8] });
      });
      L.polyline(bounds, { color: '#d86543', opacity: 0.5, weight: 3, dashArray: '5 8' }).addTo(map);
      map.fitBounds(bounds, { padding: [34, 34] });
      mapInstance.current = map;
      setMapLoaded(true);
      window.setTimeout(() => map.invalidateSize(), 100);
    }).catch(() => {
      if (active) setRouteError('The interactive map could not load. Check your connection and use the stop list below.');
    });
    return () => { active = false; if (mapInstance.current) { mapInstance.current.remove(); mapInstance.current = null; } };
  }, [tour]);

  const beginRoute = async () => {
    setRouteState('locating');
    setRouteError('');
    setRouteInfo('');
    try {
      const position = await getPosition();
      setRouteState('routing');
      const points = [position, ...tour.stops.map((stop) => ({ lat: stop.lat, lon: stop.lon }))];
      const lonlats = points.map((point) => `${point.lon},${point.lat}`).join('|');
      const url = `https://brouter.de/brouter?lonlats=${encodeURIComponent(lonlats)}&profile=trekking&alternativeidx=0&format=geojson`;
      const response = await fetch(url);
      if (!response.ok) throw new Error(`BRouter returned ${response.status}.`);
      const geojson = await response.json();
      if (!geojson?.features?.length) throw new Error('The walking router returned no route.');
      const L = window.L;
      const route = L.geoJSON(geojson, { style: { color: '#183a36', weight: 5, opacity: 0.9 } });
      if (routeLayer.current) routeLayer.current.remove();
      routeLayer.current = route.addTo(mapInstance.current);
      const startMarker = L.circleMarker([position.lat, position.lon], { radius: 7, color: '#fff9e8', weight: 3, fillColor: '#183a36', fillOpacity: 1 }).addTo(mapInstance.current).bindTooltip('You are here');
      routeLayer.current.addLayer(startMarker);
      mapInstance.current.fitBounds(route.getBounds(), { padding: [35, 35] });
      const distance = geojson.features[0]?.properties?.['track-length'] || geojson.features[0]?.properties?.distance;
      setRouteInfo(typeof distance === 'number' ? `Pedestrian route from your location · ${(distance / 1000).toFixed(1)} km` : 'Pedestrian route from your current location');
      setRouteState('ready');
    } catch (error) {
      const geoError = error as GeolocationPositionError & { code?: number };
      if (geoError.code === 1) {
        setRouteState('error');
        setRouteError('Location permission was declined. No coordinates were saved. You can still follow the listed stops from the start point.');
      } else if (geoError.code === 2 || geoError.code === 3 || geoError.code === 0) {
        setRouteState('error');
        setRouteError(geoError.message || 'Current location is unavailable. Browse the stops below and start from the listed first stop.');
      } else {
        setRouteState('error');
        setRouteError('BRouter could not provide a walking route just now. No route has been drawn; try again or use the stop order below.');
      }
    }
  };

  return (
    <div className="detail-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }} data-testid="overlay-tour-detail">
      <section className="detail-drawer" role="dialog" aria-modal="true" aria-labelledby="detail-title" data-testid={`dialog-tour-${tour.id}`}>
        <div className="drawer-top"><button className="button-secondary" onClick={onClose} data-testid="button-close-detail"><ArrowLeft size={16} /> All walks</button><button className="icon-button" onClick={onClose} aria-label="Close tour details" data-testid="button-dismiss-detail"><X size={18} /></button></div>
        <div className="eyebrow">{tour.theme} walk · starts at {tour.start}</div>
        <h2 id="detail-title">{tour.title}</h2>
        <div className="drawer-summary">{tour.subtitle} Follow a considered route through real Glasgow places, with room to pause and look around.</div>
        <div className="drawer-stats"><span><RouteIcon size={14} /> {tour.distanceKm.toFixed(1)} km approx.</span><span><Clock3 size={14} /> {tour.minutes} min walking</span><span><MapPin size={14} /> {tour.stops.length} stops</span></div>

        <div className="map-wrap">
          {!mapLoaded && <div className="map-loading" data-testid="status-map-loading">{routeError || 'Loading OpenStreetMap…'}</div>}
          <div className="map-canvas" ref={mapRef} data-testid="map-tour" />
          {(routeState === 'locating' || routeState === 'routing') && <div className="map-status" role="status" data-testid="status-route-loading">{routeState === 'locating' ? 'Waiting for your location permission…' : 'Asking BRouter for a walking-network route…'}</div>}
          {routeInfo && <div className="map-status" data-testid="status-route-ready">{routeInfo}</div>}
          {routeError && routeState === 'error' && <div className="map-status routing-error" role="alert" data-testid="status-route-error">{routeError}</div>}
        </div>
        <div className="map-credit">Map tiles © OpenStreetMap contributors · The dashed overview line is a stop-order guide, not pedestrian routing.</div>
        <div className="route-actions">
          <button className="button-primary" onClick={beginRoute} disabled={routeState === 'locating' || routeState === 'routing'} data-testid="button-start-walking-route">
            <Navigation size={16} /> {routeState === 'locating' ? 'Requesting location…' : routeState === 'routing' ? 'Finding walking route…' : routeState === 'ready' ? 'Refresh walking route' : 'Start walking route'}
          </button>
          {routeState === 'error' && <button className="button-secondary" onClick={beginRoute} data-testid="button-retry-route">Try again <ArrowRight size={14} /></button>}
        </div>
        <h3 className="stops-heading">Your stops, in order</h3>
        {tour.stops.map((stop, index) => (
          <article className="stop-row" key={stop.name} data-testid={`stop-${tour.id}-${index + 1}`}>
            <div className="stop-num">{String(index + 1).padStart(2, '0')}</div>
            <div><h4>{stop.name}</h4><p>{stop.place} · {stop.story}</p></div>
          </article>
        ))}
      </section>
    </div>
  );
}

export default App;