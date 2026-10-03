import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, Clock3, LocateFixed, MapPin, Navigation, Route as RouteIcon, X } from 'lucide-react';
import { loadLeaflet, getPosition } from './browser-helpers';
import { MapTileNotice, useMapTiles } from './map-tiles';
import glasgowMapArtwork from './assets/wander-glasgow-map.png';
import WalkPlanner from './WalkPlanner';
import AdminPortal from './AdminPortal';
import { type Tour, type Theme } from './tours';
import { useAttractionCategories } from './hooks/use-attraction-categories';
import { useCuratedWalks } from './hooks/use-curated-walks';


const themeCount = (theme: Theme, tours: Tour[]) => {
  const count = tours.filter(tour => tour.theme === theme).length;
  return count ? `${String(count).padStart(2, '0')} CURATED WALKS` : 'PLAN YOUR WALK';
};

type Position = { lat: number; lon: number };
type GeoStatus = 'idle' | 'loading' | 'success' | 'denied' | 'unavailable' | 'error';


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

function PublicApp() {
  const categoryList = useAttractionCategories();
  const curated = useCuratedWalks();
  const tours = curated.walks;
  const toursRef = useRef(tours);
  toursRef.current = tours;
  const [activeTheme, setActiveTheme] = useState<Theme | 'All'>('All');
  const [plannerEntry, setPlannerEntry] = useState<{ mode: 'theme' | 'nearby'; theme?: Theme } | null>(null);
  const [selected, setSelected] = useState<Tour | null>(null);
  const [geoStatus, setGeoStatus] = useState<GeoStatus>('idle');
  const [nearby, setNearby] = useState<{ tour: Tour; distance: number }[]>([]);
  const [geoMessage, setGeoMessage] = useState('');
  const [toast, setToast] = useState('');
  const tourList = useMemo(() => tours.filter((tour) => activeTheme === 'All' || tour.theme === activeTheme), [activeTheme, tours]);
  const nearbyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSelected(current => {
      if (!current) return null;
      const next = tours.find(tour => tour.id === current.id);
      return next && JSON.stringify(next) === JSON.stringify(current) ? current : next ?? null;
    });
    setNearby(current => current.filter(item => {
      const next = tours.find(tour => tour.id === item.tour.id);
      return next && JSON.stringify(next) === JSON.stringify(item.tour);
    }));
  }, [tours]);

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
      const ranked = toursRef.current.map((tour) => ({
        tour,
        distance: distanceKm(position, { lat: tour.stops[0].lat, lon: tour.stops[0].lon }),
      })).sort((a, b) => a.distance - b.distance).slice(0, 3);
      setNearby(ranked);
      setGeoStatus('success');
      setGeoMessage('Closest starting points, shown by straight-line distance rather than walking distance. Your coordinates stay on this device.');
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
        <a href="#top" className="brand" data-testid="link-home" aria-label="Wander Glasgow home">
          <span className="brand-mark"><span>W</span></span>
          <span className="brand-name">Wander Glasgow</span>
        </a>
        <nav className="nav-links" aria-label="Main navigation">
          <button onClick={() => document.getElementById('walks')?.scrollIntoView({ behavior: 'smooth' })} data-testid="nav-browse">Curated tours</button>
          <button onClick={() => { setPlannerEntry({ mode: 'theme' }); document.getElementById('planner')?.scrollIntoView({ behavior: 'smooth' }); }} data-testid="nav-themes">Explore by category</button>
          <button className="nav-pill" onClick={() => document.getElementById('planner')?.scrollIntoView({ behavior: 'smooth' })} data-testid="nav-planner">Plan my walk</button>
        </nav>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <div className="eyebrow">Your city guide, on foot</div>
          <h1>Glasgow is<br />better <em>on foot.</em></h1>
          <p>Take the long way round. Find the stories tucked between the big sights, with a curated walk for whatever you’re curious about.</p>
          <div className="hero-actions">
            <button className="button-primary" onClick={() => document.getElementById('planner')?.scrollIntoView({ behavior: 'smooth' })} data-testid="button-plan-walk">
              <span className="hero-cta-wide">Plan a walk from where I am</span>
              <span className="hero-cta-compact">Plan my walk</span>
              <ArrowRight size={17} />
            </button>
            <button className="button-secondary" onClick={() => document.getElementById('walks')?.scrollIntoView({ behavior: 'smooth' })} data-testid="button-explore-walks">Or browse curated tours <ArrowDown size={15} /></button>
          </div>
          <div className="hero-footnote">MADE FOR WANDERING · NO APP REQUIRED</div>
        </div>
        <div className="hero-art" role="img" aria-label="Illustrated Glasgow street map with the River Clyde, a walking route, and landmark markers">
          <div className="circle-note">GOOD<br />STORIES<br />AHEAD</div>
          <div className="map-illustration">
            <img className="map-artwork" src={glasgowMapArtwork} alt="" />
            <div className="map-label loc-1">Kelvingrove</div><div className="map-label loc-2">The Barras</div><div className="map-label loc-3">City Centre</div>
            <div className="route-dash" /><div className="map-pin pin-one" /><div className="map-pin pin-two" />
            <div className="map-stamp">YOUR CITY<br />YOUR PACE</div>
          </div>
        </div>
      </section>

      <WalkPlanner entry={plannerEntry} categories={categoryList.categories} categoriesLoading={categoryList.loading}
        categoriesError={categoryList.error} onRetryCategories={() => void categoryList.reload()} />

      <div className="intro-strip">
        <span>01 / Pick categories</span>
        <strong>Follow your interests and discover another side of Glasgow.</strong>
        <span>02 / Take a turn</span>
      </div>

      <section className="section" id="themes">
        <div className="section-head">
          <div><div className="eyebrow">Pick your kind of Glasgow</div><h2>What brings you out?</h2></div>
          <p className="section-sub">Choose your interest and build a walk around it, or explore one of our curated tours.</p>
        </div>
        {categoryList.loading && <p className="section-sub" role="status">Loading categories…</p>}
        {categoryList.notice && <p className="section-sub" role="status">{categoryList.notice}</p>}
        {categoryList.error && <div className="planner-msg" role="alert">{categoryList.error} <button className="chip" onClick={() => void categoryList.reload()}>Try again</button></div>}
        <div className="theme-list">
          {categoryList.categories.map((theme, index) => (
            <button key={theme} className={`theme-button${activeTheme === theme ? ' active' : ''}`} onClick={() => { setActiveTheme(theme); setPlannerEntry({ mode: 'theme', theme }); document.getElementById('planner')?.scrollIntoView({ behavior: 'smooth' }); }} data-testid={`filter-theme-${theme.toLowerCase()}`} aria-pressed={activeTheme === theme}>
              <span><span className="theme-count">{String(index + 1).padStart(2, '0')} / {themeCount(theme, tours)}</span><br /><span className="theme-name">{theme}</span></span><ArrowRight size={17} />
            </button>
          ))}
        </div>
      </section>

      <section className="section tour-area" id="walks">
        <div className="section-head">
          <div><div className="eyebrow">The good stuff is in between</div><h2>{activeTheme === 'All' ? 'Walks worth taking.' : `${activeTheme}, on foot.`}</h2></div>
          <p className="section-sub">Distances and walking times follow the walking network and exclude time at stops. Open a walk for its sights and route.</p>
        </div>
        <div className="tour-toolbar">
          <p data-testid="text-tour-count">{String(tourList.length).padStart(2, '0')} CURATED WALKS</p>
          {activeTheme !== 'All' && <button className="button-secondary" onClick={() => setActiveTheme('All')} data-testid="button-clear-filter">Show all walks <X size={14} /></button>}
        </div>
        {curated.loading && tours.length === 0 && <p className="section-sub" role="status">Loading curated walks…</p>}
        {curated.notice && <p className="section-sub" role="status">{curated.notice}</p>}
        {curated.error && <div className="planner-msg" role="alert">{curated.error} <button className="chip" onClick={() => void curated.reload()}>Try again</button></div>}
        <div className="tour-list">
          {!curated.loading && !curated.error && tourList.length === 0 && <p className="section-sub">There are no curated tours for this category yet. Use the planner above to build a walk from its published attractions.</p>}
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
        <button className="location-button" disabled={geoStatus === 'loading' || curated.loading || tours.length === 0 || !!curated.error} onClick={requestNearby} data-testid="button-find-nearby">
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
        <a href="#top" className="brand" data-testid="footer-brand"><span className="brand-mark"><span>W</span></span><span className="brand-name">Wander Glasgow</span></a>
        <span>Made for the city. Best enjoyed at your own pace.</span>
        <a href={`${import.meta.env.BASE_URL}admin`} data-testid="link-admin">Admin sign in</a>
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
  const [mapFailure, setMapFailure] = useState<'library' | 'construction' | null>(null);
  const [mapAttempt, setMapAttempt] = useState(0);
  const tiles = useMapTiles();
  const [routeState, setRouteState] = useState<'idle' | 'locating' | 'routing' | 'ready' | 'error'>('idle');
  const [routeError, setRouteError] = useState('');
  const [routeInfo, setRouteInfo] = useState('');
  const routeRun = useRef(0);
  const routeAbort = useRef<AbortController | null>(null);

  useEffect(() => {
    let active = true;
    let constructed = false;
    let detachTiles: (() => void) | undefined;
    let resize: ReturnType<typeof setTimeout> | undefined;
    routeRun.current++; routeAbort.current?.abort();
    setMapLoaded(false); setMapFailure(null); setRouteState('idle'); setRouteError(''); setRouteInfo('');
    routeLayer.current = null;
    loadLeaflet().then((L) => {
      if (!active || !mapRef.current || mapInstance.current) return;
      constructed = true;
      const map = L.map(mapRef.current, { scrollWheelZoom: false, zoomControl: true, attributionControl: true });
      mapInstance.current = map;
      map.setView([tour.stops[0].lat, tour.stops[0].lon], 14);
      detachTiles = tiles.attach(L, map);
      const bounds: [number, number][] = [];
      tour.stops.forEach((stop, index) => {
        const point: [number, number] = [stop.lat, stop.lon];
        bounds.push(point);
        const label = document.createElement('span');
        label.textContent = `${index + 1}. ${stop.name}`;
        L.circleMarker(point, { radius: 8, color: '#f5f2e9', weight: 3, fillColor: '#d86543', fillOpacity: 1 })
          .addTo(map).bindTooltip(label, { direction: 'top', offset: [0, -8] });
      });
      L.polyline(bounds, { color: '#d86543', opacity: 0.5, weight: 3, dashArray: '5 8' }).addTo(map);
      map.fitBounds(bounds, { padding: [34, 34] });
      mapInstance.current = map;
      setMapLoaded(true);
      resize = setTimeout(() => { if (active) map.invalidateSize(); }, 100);
    }).catch(() => {
      if (!active) return;
      detachTiles?.(); mapInstance.current?.remove(); mapInstance.current = null;
      setMapFailure(constructed ? 'construction' : 'library');
    });
    return () => { active = false; clearTimeout(resize); detachTiles?.(); routeRun.current++; routeAbort.current?.abort(); if (mapInstance.current) { mapInstance.current.remove(); mapInstance.current = null; } };
  }, [tour, mapAttempt, tiles.attach]);

  const beginRoute = async (useGps = true) => {
    const run = ++routeRun.current;
    routeAbort.current?.abort();
    const controller = new AbortController();
    routeAbort.current = controller;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    setRouteState(useGps ? 'locating' : 'routing');
    setRouteError('');
    setRouteInfo('');
    if (routeLayer.current) {
      routeLayer.current.remove();
      routeLayer.current = null;
    }
    try {
      if (!mapInstance.current || !window.L) throw new Error('Map is not ready.');
      const firstStop = { lat: tour.stops[0].lat, lon: tour.stops[0].lon };
      const position = useGps ? await getPosition() : firstStop;
      if (run !== routeRun.current) return;
      if (useGps && distanceKm(position, firstStop) > 25) {
        throw Object.assign(new Error('You appear to be outside Glasgow. Choose “Route from tour start” to plan the walk without your location.'), { code: 0 });
      }
      setRouteState('routing');
      const stops = tour.stops.map((stop) => ({ lat: stop.lat, lon: stop.lon }));
      const points = useGps ? [position, ...stops] : stops;
      const coordinates = points.map((point) => `${point.lon},${point.lat}`).join(';');
      const url = `https://routing.openstreetmap.de/routed-foot/route/v1/foot/${coordinates}?overview=full&geometries=geojson`;
      timeout = setTimeout(() => controller.abort(), 30000);
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw new Error(`Walking service returned ${response.status}.`);
      const result = await response.json();
      const pedestrianRoute = result.routes?.[0];
      if (result.code !== 'Ok' || !pedestrianRoute?.geometry?.coordinates?.length) throw new Error('The walking service returned no route.');
      if (run !== routeRun.current || !mapInstance.current) return;
      const L = window.L;
      const route = L.geoJSON(pedestrianRoute.geometry, { style: { color: '#183a36', weight: 5, opacity: 0.9 } });
      routeLayer.current = route.addTo(mapInstance.current);
      const startMarker = L.circleMarker([position.lat, position.lon], { radius: 7, color: '#fff9e8', weight: 3, fillColor: '#183a36', fillOpacity: 1 }).bindTooltip(useGps ? 'You are here' : 'Tour start');
      routeLayer.current.addLayer(startMarker);
      mapInstance.current.fitBounds(route.getBounds(), { padding: [35, 35] });
      setRouteInfo(`Walking route from ${useGps ? 'your location' : 'the tour start'} · ${(pedestrianRoute.distance / 1000).toFixed(1)} km · about ${Math.ceil(pedestrianRoute.duration / 60)} min, excluding stops`);
      setRouteState('ready');
    } catch (error) {
      if (run !== routeRun.current) return;
      const geoError = error as GeolocationPositionError & { code?: number };
      if (geoError.code === 1) {
        setRouteState('error');
        setRouteError('Location permission was declined. No coordinates were saved. Choose “Route from tour start” to get a walking route without GPS.');
      } else if (geoError.code === 2 || geoError.code === 3 || geoError.code === 0) {
        setRouteState('error');
        setRouteError(geoError.message || 'Current location is unavailable. Browse the stops below and start from the listed first stop.');
      } else {
        setRouteState('error');
        setRouteError('The walking service could not provide a route just now. No pedestrian route has been drawn; please try again.');
      }
    } finally { if (timeout) clearTimeout(timeout); }
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
          {!mapLoaded && !mapFailure && <div className="map-loading" role="status" data-testid="status-map-loading">Loading the interactive map…</div>}
          <div className="map-canvas" ref={mapRef} data-testid="map-tour" />
          {(routeState === 'locating' || routeState === 'routing') && <div className="map-status" role="status" data-testid="status-route-loading">{routeState === 'locating' ? 'Waiting for your location permission…' : 'Finding a route on the walking network…'}</div>}
          {routeInfo && <div className="map-status" data-testid="status-route-ready">{routeInfo}</div>}
          {routeError && routeState === 'error' && <div className="map-status routing-error" role="alert" data-testid="status-route-error">{routeError}</div>}
        </div>
        {mapFailure && <div className="planner-msg" role="alert" data-testid="status-tour-map-error">
          {mapFailure === 'library' ? 'The map library or styles could not load. Check your connection.' : 'The interactive map could not be initialized. This is not a background-tile failure.'} The ordered stop list remains available below.
          <div style={{ marginTop: 10 }}><button type="button" className="chip" onClick={() => setMapAttempt(n => n + 1)} data-testid="button-tour-map-retry">Retry map</button></div>
        </div>}
        {mapLoaded && <MapTileNotice tiles={tiles} preserved="Your stop markers and any calculated walking route remain on the map. Routing and the stop list are still available." testId="tour-map" />}
        <div className="map-credit">Map tiles © OpenStreetMap contributors · The dashed overview line is a stop-order guide, not pedestrian routing.</div>
        <div className="route-actions">
          <button className="button-primary" onClick={() => beginRoute(true)} disabled={!mapLoaded || routeState === 'locating' || routeState === 'routing'} data-testid="button-start-walking-route">
            <Navigation size={16} /> {routeState === 'locating' ? 'Requesting location…' : routeState === 'routing' ? 'Finding walking route…' : routeState === 'ready' ? 'Refresh walking route' : 'Start walking route'}
          </button>
          <button className="button-secondary" onClick={() => beginRoute(false)} disabled={!mapLoaded || routeState === 'locating' || routeState === 'routing'} data-testid="button-route-tour-start">Route from tour start <ArrowRight size={14} /></button>
          <p className="map-credit">Routing sends the tour stops—and your coordinates only if you use GPS—to the independent OpenStreetMap walking service. Opening hours and access can change; check locally before entering attractions.</p>
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

function App() {
  const admin = window.location.pathname.slice(import.meta.env.BASE_URL.length).replace(/\/$/, '') === 'admin';
  useEffect(() => {
    if (!admin) return;
    document.title = 'Attraction administration · Wander Glasgow';
    const robots = document.createElement('meta');
    robots.name = 'robots'; robots.content = 'noindex, nofollow';
    document.head.appendChild(robots);
    return () => robots.remove();
  }, [admin]);
  return admin ? <AdminPortal /> : <PublicApp />;
}

export default App;