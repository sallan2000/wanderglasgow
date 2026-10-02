# Glasgow Walks

A portable, static React website. No backend, database, accounts, Replit services, or secret keys are required.

## Build independently

From this directory, with Node.js 22 or newer:

```sh
npm install
npm run typecheck
npm run build
```

Upload the contents of `dist/public` to any static web host. Serve it over HTTPS so browser geolocation works on phones. `npm run dev` runs locally on port 5173; `PORT` and `BASE_PATH` are optional standard configuration overrides.

## Mapping and privacy

The app loads Leaflet from unpkg, map tiles from OpenStreetMap, and walking routes from the independent FOSSGIS/OpenStreetMap foot-routing service. Fonts come from Google Fonts. These require an internet connection and are not Replit services.

Location is requested only after a user action. Visitors can choose a theme or a mixed nearby-attraction walk. A GPS-started plan sends the current location and candidate attraction coordinates to the routing provider to calculate actual pedestrian-network distances. A manually chosen Glasgow starting point does not share GPS coordinates. Locations are not persisted.

The nearby planner uses a bounded catalogue of up to 12 nearby candidates, excludes attractions beyond the chosen walking radius, and finds the shortest open route for the largest number of stops that fits the selected stop count and total walking-distance limit. It does not force a return to the starting point. Road layouts can still require reusing a street; this reduces avoidable backtracking rather than guaranteeing none. Walking times exclude sightseeing.

Run `npm run test:planner` to check optimisation against exhaustive small-graph solutions and verify theme, budget, cancellation and error handling. Add `-- --live` to check the independent foot-routing service.

Public map and routing endpoints have usage policies and no availability guarantee. Review their current terms and capacity before a large public launch, and configure a contracted or self-hosted provider if needed.

Tour information describes sightseeing stops, not guaranteed access or admission. Check venue opening and access information locally. Walking routes are suggestions, not accessibility or safety guarantees.