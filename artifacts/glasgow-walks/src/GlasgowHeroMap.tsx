import mapArtwork from './assets/wander-glasgow-map-modern.webp';

type Place = {
  id: 'kelvingrove' | 'university' | 'school' | 'chambers' | 'cathedral' | 'barras';
  name: string;
  lat: number;
  lon: number;
  label: 'east' | 'west' | 'south';
};

const bounds = { north: 55.878, south: 55.844, west: -4.303, east: -4.220 };
const mercator = (latitude: number) => {
  const radians = latitude * Math.PI / 180;
  return Math.log(Math.tan(Math.PI / 4 + radians / 2));
};
const northing = mercator(bounds.north);
const southing = mercator(bounds.south);
const project = (lat: number, lon: number) => ({
  x: ((lon - bounds.west) / (bounds.east - bounds.west)) * 100,
  y: ((northing - mercator(lat)) / (northing - southing)) * 100,
});

// Actual stop coordinates from the published Glasgow walks, projected into the illustration.
const places: Place[] = [
  { id: 'kelvingrove', name: 'Kelvingrove', lat: 55.8686, lon: -4.2905, label: 'east' },
  { id: 'university', name: 'University', lat: 55.8716587, lon: -4.2883961, label: 'east' },
  { id: 'school', name: 'The Art School', lat: 55.8653, lon: -4.2631, label: 'east' },
  { id: 'chambers', name: 'City Chambers', lat: 55.8608, lon: -4.2498, label: 'south' },
  { id: 'cathedral', name: 'Glasgow Cathedral', lat: 55.8629, lon: -4.2344, label: 'west' },
  { id: 'barras', name: 'The Barras', lat: 55.855084, lon: -4.2367353, label: 'west' },
];
const points = Object.fromEntries(places.map(place => [place.id, project(place.lat, place.lon)])) as
  Record<Place['id'], { x: number; y: number }>;

function LandmarkGlyph({ id }: { id: Place['id'] }) {
  const stroke = '#24463e';
  const roof = '#d87853';
  const stone = '#f2eee3';
  return <svg className={`hero-landmark-art landmark-${id}`} viewBox="0 0 48 40" aria-hidden="true">
    <ellipse cx="24" cy="37" rx="18" ry="2" fill="#183a36" opacity=".16" />
    {id === 'kelvingrove' && <>
      <path d="M5 17 12 11 19 17 24 9 29 17 37 11 43 17v18H5z" fill={stone} stroke={stroke} strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M4 18h40M22 35V22h5v13M11 23v5m6-5v5m17-5v5" fill="none" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" />
      <path d="M20 9h8M24 9V5" stroke={roof} strokeWidth="2" strokeLinecap="round" />
    </>}
    {id === 'university' && <>
      <path d="m21 13 3-10 3 10zm-12 8 5-6 5 6v12H9zm20 0 5-6 5 6v12H29z" fill={roof} stroke={stroke} strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M7 22h34v12H7zM4 35h40" fill={stone} stroke={stroke} strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M12 25v4m9-4v4m9-4v4m7-4v4" stroke={stroke} strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="24" cy="12" r="1.3" fill={stone} />
    </>}
    {id === 'school' && <>
      <path d="m5 16 25-9 12 8v20H5z" fill={stone} stroke={stroke} strokeWidth="1.6" strokeLinejoin="round" />
      <path d="m30 7 5-3 1 8M3 17l27-10m-18 14v4m7-6v4m6-7v4m6-2v4M15 35V29h6v6" fill="none" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="m30 7 6 5" stroke={roof} strokeWidth="2" />
    </>}
    {id === 'chambers' && <>
      <path d="M6 17 24 7l18 10v3H6z" fill={roof} stroke={stroke} strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M9 21h30v13H9zM5 35h38" fill={stone} stroke={stroke} strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M14 23v9m7-9v9m7-9v9m7-9v9" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="24" cy="14" r="1.5" fill={stone} />
    </>}
    {id === 'cathedral' && <>
      <path d="M7 34V19l6-7 6 7v15m4 0V11l6-7 6 7v23m1 0V17l5-6 4 6v17z" fill={stone} stroke={stroke} strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M4 35h41m-27-12v6m12-12v6m10 4v3" fill="none" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" />
      <path d="M26 4h6M29 4V1" stroke={roof} strokeWidth="1.7" strokeLinecap="round" />
    </>}
    {id === 'barras' && <>
      <path d="M7 35V24a17 17 0 0 1 34 0v11z" fill={roof} stroke={stroke} strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M13 35V24a11 11 0 0 1 22 0v11z" fill={stone} stroke={stroke} strokeWidth="1.4" />
      <path d="M3 36h42" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" />
      <path d="M17 12q7-7 14 0" fill="none" stroke="#9cb778" strokeWidth="2" strokeLinecap="round" />
      <circle cx="18" cy="23" r="1" fill={roof} /><circle cx="24" cy="19" r="1" fill={roof} /><circle cx="30" cy="23" r="1" fill={roof} />
    </>}
  </svg>;
}

export default function GlasgowHeroMap() {
  return (
    <div className="hero-art" role="img" aria-label="Illustrated central Glasgow map with Kelvingrove, the university, the Art School, City Chambers, Glasgow Cathedral and the Barras shown in their real relative locations.">
      <div className="map-illustration">
        <img className="map-artwork" src={mapArtwork} alt="" />
        <svg className="hero-route" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <path d={`M ${points.kelvingrove.x} ${points.kelvingrove.y} C 25 26, 32 41, ${points.school.x} ${points.school.y} S 56 43, ${points.chambers.x} ${points.chambers.y} S 74 59, ${points.barras.x} ${points.barras.y}`}
            fill="none" stroke="#fbf8ef" strokeWidth="1.7" strokeLinecap="round" />
          <path d={`M ${points.kelvingrove.x} ${points.kelvingrove.y} C 25 26, 32 41, ${points.school.x} ${points.school.y} S 56 43, ${points.chambers.x} ${points.chambers.y} S 74 59, ${points.barras.x} ${points.barras.y}`}
            fill="none" stroke="#c76043" strokeWidth=".68" strokeDasharray="1.4 1.45" strokeLinecap="round" />
        </svg>
        {places.map(place => {
          const point = points[place.id];
          return <div key={place.id} className={`hero-landmark landmark-${place.id}`} style={{ left: `${point.x}%`, top: `${point.y}%` }}>
            <LandmarkGlyph id={place.id} />
            <span className={`hero-landmark-name label-${place.label}`}>{place.name}</span>
          </div>;
        })}
        <div className="hero-map-tag"><span /> CENTRAL GLASGOW <i>55.86° N</i></div>
      </div>
    </div>
  );
}