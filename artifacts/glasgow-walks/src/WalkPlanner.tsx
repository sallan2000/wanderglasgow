import { useEffect, useRef, useState } from 'react';
import { LocateFixed, Navigation } from 'lucide-react';
import { loadLeaflet, getPosition } from './browser-helpers';
import { MapTileNotice, useMapTiles } from './map-tiles';
import { planAttractionWalk, WalkPlanningError, SEARCH_RADII_KM, defaultWalkLimitKm, type PlannedWalk, type PlannerOptions } from './walk-planner';
import type { Theme } from './tours';
import type { Position } from './attractions';
import PlannerRecoveryPanel from './components/planner-recovery';
import { CatalogueError, loadPublicCatalogue } from './attraction-store';
import { loadPublicStartingAreas, StartingAreaError } from './starting-area-store';
import { useStartingAreas } from './use-starting-areas';
import AccessDetailsView from './AccessDetailsView';
import type { AccessPreference } from './access-details';
import EmailWalk from './EmailWalk';
import { plannedEmailWalk } from './walk-email';
import ItineraryActions from './ItineraryActions';
import { plannedItinerary } from './itinerary-snapshot';
import { getRecoveryActions, type RecoveryAction } from './planner-recovery';

type Mode = 'theme' | 'nearby';
type Start = string;
type Status = 'idle' | 'locating' | 'planning' | 'ready' | 'error';

const fmtKm = (m: number) => (m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`);

type Props = {
  entry?: { mode: Mode; theme?: Theme } | null;
  categories: string[];
  categoriesLoading: boolean;
  categoriesError: string;
  onRetryCategories: () => void;
};

export default function WalkPlanner({ entry, categories, categoriesLoading, categoriesError, onRetryCategories }: Props) {
  const [mode, setMode] = useState<Mode | null>(null);
  const [themes, setThemes] = useState<Theme[]>([]);
  const [start, setStart] = useState<Start>('gps');
  const startingAreas = useStartingAreas();
  const [radius, setRadius] = useState(2);
  const [maxStops, setMaxStops] = useState<number | 'as-many-as-fit'>(3);
  const [accessPreference, setAccessPreference] = useState<AccessPreference>('any');
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState('');
  const [walkPlanningError, setWalkPlanningError] = useState<WalkPlanningError | null>(null);
  const [catalogueNotice, setCatalogueNotice] = useState('');
  const [plan, setPlan] = useState<PlannedWalk | null>(null);
  const [mapStatus, setMapStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [mapFailure, setMapFailure] = useState<'library' | 'construction'>('library');
  const [mapAttempt, setMapAttempt] = useState(0);
  const tiles = useMapTiles();
  const run = useRef(0);
  const abort = useRef<AbortController | null>(null);
  const mapEl = useRef<HTMLDivElement>(null);

  const cancel = () => {
    run.current++;
    abort.current?.abort();
    abort.current = null;
    setStatus('idle'); setError(''); setCatalogueNotice(''); setPlan(null); setMapStatus('loading');
  };
  useEffect(() => () => { run.current++; abort.current?.abort(); }, []);
  useEffect(() => {
    if (!entry) return;
    cancel();
    setMode(entry.mode);
    setThemes(entry.theme ? [entry.theme] : []);
  }, [entry]);

  const change = (fn: () => void) => { cancel(); fn(); };
  const startReady = start === 'gps' || (!startingAreas.loading && !startingAreas.error && startingAreas.areas.some(area => area.id === start));
  const ready = startReady && (mode === 'nearby' || (mode === 'theme' && themes.length > 0 && !categoriesLoading && !categoriesError && themes.every(theme => categories.includes(theme))));

  const go = async () => {
    if (!ready) return;
    cancel();
    const id = run.current;
    const controller = new AbortController();
    abort.current = controller;
    try {
      let origin: Position;
      if (start === 'gps') {
        setStatus('locating');
        origin = await getPosition();
        if (id !== run.current) return;
      } else {
        setStatus('planning');
        // Re-read before routing: removed or repositioned areas must not use stale coordinates.
        const current = await loadPublicStartingAreas(controller.signal);
        if (id !== run.current) return;
        const selected = current.areas.find(area => area.id === start);
        if (!selected) throw new StartingAreaError('That starting area is no longer available. Refresh the starting points and choose another.');
        origin = { lat: selected.lat, lon: selected.lon };
      }
      setStatus('planning');
      const catalogue = await loadPublicCatalogue(controller.signal);
      if (id !== run.current) return;
      setCatalogueNotice(catalogue.notice ?? '');
      const result = await planAttractionWalk(origin, { theme: mode === 'theme' ? themes : 'All', radiusKm: radius, maxStops, accessPreference }, controller.signal, catalogue.attractions);
      if (id !== run.current) return;
      setPlan(result);
      setStatus('ready');
    } catch (e: any) {
      if (id !== run.current || e?.name === 'AbortError') return;
      let msg = 'Something went wrong planning this walk. Please try again.';
      if (e instanceof WalkPlanningError) { msg = e.message; setWalkPlanningError(e); }
      else if (e instanceof CatalogueError || e instanceof StartingAreaError) msg = e.message;
      else if (e?.code === 1) msg = 'Location permission was declined. Nothing was saved. Choose an available saved starting point to plan without GPS.';
      else if (e?.code === 2 || e?.code === 3) msg = 'Your position could not be found. Pick a Glasgow starting point instead.';
      else if (typeof e?.code === 'number') msg = e.message || 'Your position could not be found. Pick a Glasgow starting point instead.';
      setError(msg); setStatus('error');
    }
  };

  const options: PlannerOptions = {
    theme: mode === 'theme' ? themes : 'All',
    radiusKm: radius,
    maxStops: maxStops,
    accessPreference,
  };
  const recoveryActions = walkPlanningError instanceof WalkPlanningError
    ? getRecoveryActions(walkPlanningError, options, { radii: SEARCH_RADII_KM })
    : [];

  const applyRecovery = (action: RecoveryAction) => {
    cancel();
    switch (action.kind) {
      case 'radius-up':
        setRadius((prev) => {
          const i = SEARCH_RADII_KM.indexOf(prev);
          return i < SEARCH_RADII_KM.length - 1 ? SEARCH_RADII_KM[i + 1] : prev;
        });
        break;
      case 'radius-down':
        setRadius((prev) => {
          const i = SEARCH_RADII_KM.indexOf(prev);
          return i > 0 ? SEARCH_RADII_KM[i - 1] : prev;
        });
        break;
      case 'stops-down':
        setMaxStops((prev) => (prev === 'as-many-as-fit' || prev <= 1 ? 1 : prev - 1));
        break;
      case 'switch-to-nearby':
        setMode('nearby');
        break;
      case 'start-mylocation':
        setStart('gps');
        break;
    }
    go();
  };

  useEffect(() => {
    if (!plan) return;
    setMapStatus('loading');
    let active = true;
    let map: any;
    let constructed = false;
    let detachTiles: (() => void) | undefined;
    let resize: ReturnType<typeof setTimeout> | undefined;
    loadLeaflet().then((L) => {
      if (!active || !mapEl.current) return;
      // Initialise the view before mixed vector layers create their renderers.
      constructed = true;
      map = L.map(mapEl.current, { scrollWheelZoom: false });
      map.setView([plan.origin.lat, plan.origin.lon], 14);
      detachTiles = tiles.attach(L, map);
      const line = L.geoJSON(plan.geometry, { style: { color: '#183a36', weight: 5, opacity: 0.9 } }).addTo(map);
       const tooltip = (text: string) => { const node = document.createElement('span'); node.textContent = text; return node; };
       plan.nearby.filter((n) => !n.included).forEach((n) => L.circleMarker([n.lat, n.lon], { radius: 5, color: '#6b7e76', weight: 2, fillColor: '#e9e4d7', fillOpacity: 1 }).addTo(map).bindTooltip(tooltip(`${n.name} (not on route)`)));
      L.circleMarker([plan.origin.lat, plan.origin.lon], { radius: 8, color: '#f5f2e9', weight: 3, fillColor: '#183a36', fillOpacity: 1 }).addTo(map).bindTooltip('Start');
       plan.stops.forEach((s, i) => L.marker([s.lat, s.lon], { icon: L.divIcon({ className: '', html: `<div class="plan-pin">${i + 1}</div>`, iconSize: [28, 28], iconAnchor: [14, 14] }) }).addTo(map).bindTooltip(tooltip(`${i + 1}. ${s.name}`)));
      map.fitBounds(line.getBounds(), { padding: [30, 30] });
      setMapStatus('ready');
      resize = setTimeout(() => { if (active) map?.invalidateSize(); }, 100);
    }).catch(() => {
      if (!active) return;
      detachTiles?.(); map?.remove(); map = null;
      setMapFailure(constructed ? 'construction' : 'library'); setMapStatus('error');
    });
    return () => { active = false; clearTimeout(resize); detachTiles?.(); map?.remove(); };
  }, [plan, mapAttempt, tiles.attach]);

  const busy = status === 'locating' || status === 'planning';
  const selectedStartName = start === 'gps'
    ? 'My location'
    : startingAreas.areas.find(area => area.id === start)?.name ?? 'Choose a starting point';
  const searchDistanceLabel = radius === 10 ? 'Up to 10 km on foot' : `Within ${radius} km on foot`;
  const stopTargetLabel = maxStops === 'as-many-as-fit' ? 'As many as fit (6+)' : `Up to ${maxStops}`;

  const finalStop = plan !== null && plan.stops.length > 0 ? plan.stops[plan.stops.length - 1] : null;

  return (
    <section className="planner" id="planner" data-testid="section-planner">
      <div className="eyebrow">Out in Glasgow right now?</div>
      <h2>Plan a walk from where you are.</h2>
      <p className="planner-lead">Choose one or more categories, or take in everything nearby. We build a route on real pedestrian paths that visits as many sights as fit, with minimised avoidable backtracking.</p>

      <div className="mode-grid" role="group" aria-label="Choose how to explore">
        <button className={`mode-card${mode === 'theme' ? ' active' : ''}`} aria-pressed={mode === 'theme'} onClick={() => change(() => setMode('theme'))} data-testid="button-mode-theme">
          <strong>Pick categories</strong><span>Combine your interests and visit only stops in your selected categories.</span>
        </button>
        <button className={`mode-card${mode === 'nearby' ? ' active' : ''}`} aria-pressed={mode === 'nearby'} onClick={() => change(() => setMode('nearby'))} data-testid="button-mode-nearby">
          <strong>Explore nearby</strong><span>Every category mixed together, whatever is closest to you.</span>
        </button>
      </div>

      {mode && (
        <div className="planner-form" data-testid="form-planner">
          {mode === 'theme' && (
            <div>
              <span className="field-label" id="planner-category-label">Categories · select one or more</span>
              <div className="chip-row" role="group" aria-labelledby="planner-category-label" aria-describedby="planner-category-help">
                {categories.map((t) => <button key={t} className={`chip${themes.includes(t) ? ' active' : ''}`} aria-pressed={themes.includes(t)} onClick={() => change(() => setThemes(previous => previous.includes(t) ? previous.filter(theme => theme !== t) : [...previous, t]))} data-testid={`button-theme-${t.toLowerCase()}`}>{t}</button>)}
              </div>
              <p className="planner-note" id="planner-category-help">Tap a category to select or deselect it. Only attractions in your selected categories will be included.</p>
              {categoriesLoading && <p className="planner-note" role="status">Loading categories…</p>}
              {categoriesError && <div className="planner-msg" role="alert">{categoriesError} <button className="chip" onClick={onRetryCategories}>Try again</button></div>}
              {!categoriesLoading && !categoriesError && categories.length === 0 && <p className="planner-note">No categories are available yet. Try Explore nearby instead.</p>}
            </div>
          )}
          <div>
            <span className="field-label" id="planner-start-label">Starting point</span>
            <div className="chip-row" role="group" aria-labelledby="planner-start-label">
              {startingAreas.areas.map((area) => <button key={area.id} className={`chip${start === area.id ? ' active' : ''}`} aria-pressed={start === area.id} disabled={startingAreas.loading || Boolean(startingAreas.error)} onClick={() => change(() => setStart(area.id))} data-testid={`button-start-${area.id}`}>{area.name}</button>)}
              <button className={`chip${start === 'gps' ? ' active' : ''}`} aria-pressed={start === 'gps'} onClick={() => change(() => setStart('gps'))} data-testid="button-start-gps">My location</button>
            </div>
            {startingAreas.loading && <p className="planner-note" role="status">Loading starting points…</p>}
            {startingAreas.error && <div className="planner-msg" role="alert" data-testid="status-starting-areas-error">{startingAreas.error} <button className="chip" onClick={() => void startingAreas.refresh()}>Retry starting points</button> You can still use My location.</div>}
            {startingAreas.notice && <p className="planner-note" role="status" data-testid="status-starting-areas-notice">{startingAreas.notice}</p>}
            {!startingAreas.loading && !startingAreas.error && startingAreas.areas.length === 0 && <p className="planner-note">No saved starting points are available. Use My location to plan with GPS.</p>}
            {!startingAreas.loading && !startingAreas.error && start !== 'gps' && !startReady && <p className="planner-msg" role="alert">Your selected starting area was removed. Choose another starting point.</p>}
          </div>
          <div>
            <span className="field-label" id="planner-radius-label">Attraction search distance</span>
            <div className="chip-row" role="group" aria-labelledby="planner-radius-label" aria-describedby="planner-radius-help">
              {SEARCH_RADII_KM.map((r) => <button key={r} className={`chip${radius === r ? ' active' : ''}`} aria-pressed={radius === r} aria-label={r === 10 ? '5 km+, search up to 10 km' : `${r} km`} onClick={() => change(() => setRadius(r))} data-testid={`button-radius-${r}`}>{r === 10 ? '5 km+' : `${r} km`}</button>)}
            </div>
            <p className="planner-note" id="planner-radius-help" data-testid="text-radius-help">
              {radius === 10
                ? 'The 5 km+ option searches for attractions up to 10 km from your starting point along walking routes. The total walk has a separate limit of 15 km; allow extra time for a longer walk.'
                : `Searches for attractions within ${radius} km of your starting point along walking routes. The total walk has a separate limit of ${defaultWalkLimitKm(radius)} km.`}
            </p>
          </div>
          <div>
            <span className="field-label" id="planner-stops-label">How many stops?</span>
            <div className="chip-row" role="group" aria-labelledby="planner-stops-label" aria-describedby="planner-stops-help">
              {[1, 2, 3, 4, 5].map((n) => <button key={n} className={`chip${maxStops === n ? ' active' : ''}`} aria-pressed={maxStops === n} onClick={() => change(() => setMaxStops(n))} data-testid={`button-stops-${n}`}>{n}</button>)}
              <button className={`chip${maxStops === 'as-many-as-fit' ? ' active' : ''}`} aria-pressed={maxStops === 'as-many-as-fit'} aria-label="6 or more stops, as many as fit" onClick={() => change(() => setMaxStops('as-many-as-fit'))} data-testid="button-stops-6plus">6+</button>
            </div>
            <p className="planner-note" id="planner-stops-help" data-testid="text-stop-target-help">
              {maxStops === 'as-many-as-fit'
                ? '6+ includes as many matching sights as fit within your walking-distance limit. If the planner cannot verify a route for a large search, it will ask you to narrow the search rather than guess.'
                : `Plans up to ${maxStops} stops, if they fit within your walking-distance limit. Choose 6+ to include as many matching sights as fit.`}
            </p>
          </div>
          <div>
            <label className="chip-row" htmlFor="planner-step-free" style={{ alignItems: 'center', gap: 8 }}>
              <input id="planner-step-free" type="checkbox" checked={accessPreference === 'step-free'} onChange={(e) => change(() => setAccessPreference(e.target.checked ? 'step-free' : 'any'))} data-testid="checkbox-step-free" />
              <span className="field-label" style={{ margin: 0 }}>Only stops with a recorded step-free entrance</span>
            </label>
            <p className="planner-note" data-testid="text-access-filter-note">This filter only uses entrance information recorded for each attraction. It does not assess the paths between sights and is not a promise of an accessible route.</p>
          </div>
          <div className="planner-summary" data-testid="text-walk-settings" aria-live="polite" aria-atomic="true">
            <strong className="planner-summary-title">Your walk settings</strong>
            <dl className="planner-summary-grid">
              <div><dt>Starting point</dt><dd>{selectedStartName}</dd></div>
              <div><dt>Attraction search</dt><dd>{searchDistanceLabel}</dd></div>
              <div><dt>Maximum walk</dt><dd>{defaultWalkLimitKm(radius)} km total</dd></div>
              <div><dt>Stops</dt><dd>{stopTargetLabel}</dd></div>
            </dl>
          </div>
          <div className="planner-actions">
            <button className="button-primary" disabled={!ready || busy} onClick={go} data-testid="button-plan-route">
              {start === 'gps' ? <LocateFixed size={16} /> : <Navigation size={16} />}
              {status === 'locating' ? 'Finding your position…' : status === 'planning' ? 'Planning your walk…' : start === 'gps' ? 'Use my location and plan' : 'Plan my walk'}
            </button>
          </div>
          {mode === 'theme' && themes.length === 0 && <p className="planner-note" data-testid="text-choose-theme">Choose at least one category to continue.</p>}
          <p className="planner-note" data-testid="text-privacy">The total walk is limited to {defaultWalkLimitKm(radius)} km. Your location is requested only when you press the plan button with My location selected. To build the route, the start coordinates and attraction positions are sent to the independent OpenStreetMap walking service. They are never stored by this site. Walking distances and times exclude time spent at stops.</p>
        </div>
      )}

      <div aria-live="polite">
        {catalogueNotice && <p className="planner-msg" role="status" data-testid="status-catalogue-notice">{catalogueNotice}</p>}
        {busy && <div className="planner-msg loading" data-testid="status-planner-loading">{status === 'locating' ? 'Waiting for your location permission…' : 'Comparing matching sights and finding the shortest stop order. The public walking service is rate limited, so this can take a few seconds.'}</div>}
        {status === 'error' && (
          <div className="planner-msg" role="alert" data-testid="status-planner-error">
            {error}
            {walkPlanningError instanceof WalkPlanningError && recoveryActions.length > 0 && (
              <PlannerRecoveryPanel
                actions={recoveryActions}
                onRetry={() => go()}
                onApply={applyRecovery}
              />
            )}
          </div>
        )}
      </div>

      {plan && status === 'ready' && (
        <div className="plan-result" data-testid="result-plan">
          <div>
            <div className="plan-summary" data-testid="text-plan-summary">
              <span>{Array.isArray(plan.theme) ? `Categories: ${plan.theme.join(', ')}` : plan.theme === 'All' ? 'All categories' : `Category: ${plan.theme}`}</span>
              <span>{plan.stops.length} stops</span>
              <span>{fmtKm(plan.distanceMeters)} walking</span>
              <span>about {Math.ceil(plan.durationSeconds / 60)} min, excluding stops</span>
            </div>
            <div className="plan-start-finish" data-testid="text-plan-start-finish">
              <div className="plan-start-finish-row">
                <dt className="start-finish-kicker">Start</dt>
                <dd className="start-finish-detail">{selectedStartName}</dd>
              </div>
              <div className="plan-start-finish-row">
                <dt className="start-finish-kicker">Finish</dt>
                <dd className="start-finish-detail"><b>{finalStop!.name ?? ''}</b>{finalStop!.place ? ` · ${finalStop!.place}` : ''}</dd>
              </div>
            </div>
            {plan.stops.length > 7 && (
              <div className="planner-msg" role="status" data-testid="status-many-stops">
                This walk includes {plan.stops.length} stops. The estimated time covers walking only, so allow time for visits and check that this itinerary suits your day.
              </div>
            )}
            <EmailWalk walk={plannedEmailWalk(plan)} title="Your calculated Glasgow walk" />
            <ItineraryActions itinerary={plannedItinerary(plan)} />
            {plan.stops.map((s, i) => (
              <article className="plan-stop" key={s.id} data-testid={`stop-plan-${s.id}`}>
                <div className="stop-num">{String(i + 1).padStart(2, '0')}</div>
                <div><h4>{s.name}</h4><small>{s.theme} · {s.place}</small><p>{s.description}</p><AccessDetailsView access={s.access} testId={`access-plan-${s.id}`} /></div>
              </article>
            ))}
            {plan.excludedCount > 0 && (
              <div className="plan-others" data-testid="list-plan-others">
                {plan.excludedCount} more nearby, not included within this walk’s stop and distance limits:
                <ul>{plan.nearby.filter((n) => !n.included).map((n) => <li key={n.id}>{n.name}, {fmtKm(n.walkingDistanceMeters)} from start on foot</li>)}</ul>
              </div>
            )}
            <p className="planner-note" data-testid="text-plan-disclaimer">This is the shortest stop order using the walking service’s current distances, for as many stops as fit your settings. There is no forced return to the start. Dead ends and access routes can still require retracing; the walking service’s paths are not guaranteed to be the shortest possible streets. Check opening hours and access locally.</p>
          </div>
          <div>
            {mapStatus === 'loading' && <p className="planner-note" role="status" data-testid="status-plan-map-loading">Loading the interactive map…</p>}
            {mapStatus === 'error' && <div className="planner-msg" role="alert" data-testid="status-plan-map-error">
              {mapFailure === 'library'
                ? 'The map library could not load. Check your connection and retry.'
                : 'The interactive map could not be initialised; this is not a background-tile failure.'}
              <div style={{ marginTop: 10 }}><button type="button" className="chip" onClick={() => setMapAttempt(n => n + 1)} data-testid="button-plan-map-retry">Retry map</button></div>
              <p className="planner-note" style={{ marginTop: 10 }}>Your walk plan is still here: the ordered stops list, the email version, and the Google Maps route are all available even while the map reloads.</p>
            </div>}
            {mapStatus === 'ready' && <MapTileNotice tiles={tiles} preserved="Your route, start location and stop markers remain on the map, and the ordered attraction list is still available." testId="plan-map" />}
            <div className="plan-map" ref={mapEl} data-testid="map-plan" style={mapStatus === 'error' ? { display: 'none' } : undefined} />
          </div>
        </div>
      )}
    </section>
  );
}
