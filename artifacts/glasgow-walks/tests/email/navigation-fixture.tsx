import { createRoot } from 'react-dom/client';
import GoogleMapsNavigationLink from '../../src/GoogleMapsNavigationLink';
import type { NavigationPoint } from '../../src/route-url';

const points: NavigationPoint[] = [
  { lat: 55.86, lon: -4.25 },
  ...Array.from({ length: 6 }, (_, index) => ({
    lat: 55.861 + index * 0.001,
    lon: -4.251 - index * 0.001,
    name: `Stop ${index + 1}`,
  })),
];

const requestedPoints = Number(new URLSearchParams(window.location.search).get('points'));
const routePoints = Number.isInteger(requestedPoints) && requestedPoints >= 2
  ? points.slice(0, Math.min(requestedPoints, points.length))
  : points;

createRoot(document.getElementById('root')!).render(
  <GoogleMapsNavigationLink points={routePoints} testId="route-navigation" />,
);
