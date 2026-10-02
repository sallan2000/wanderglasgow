# Glasgow Walks

A mobile-friendly, self-guided Glasgow walking-tour website with art, music, history and sport themes.

## Run & Operate

- `pnpm --filter @workspace/glasgow-walks run dev` — run the website.
- `pnpm --filter @workspace/glasgow-walks run typecheck` — check the app.
- `pnpm --filter @workspace/glasgow-walks run build` — produce static files in `artifacts/glasgow-walks/dist/public`.
- No required environment variables, credentials, API server, or database. Geolocation requires HTTPS.
- See `artifacts/glasgow-walks/README.md` for independent-host build instructions and external mapping-service assumptions.

## Stack

- React, TypeScript, Vite, and plain CSS in a portable static web app.
- Leaflet/OpenStreetMap maps and an independent OSRM foot-routing endpoint.
- The API server and database packages are unused scaffolds, not product dependencies.

## Where things live

- Website: `artifacts/glasgow-walks`.
- Curated tours and stops: `src/tours.ts`.
- Interface, geolocation and map routing: `src/App.tsx`.

## Architecture decisions

- All tour ranking runs on the device. Do not persist GPS coordinates.
- Stops are sightseeing viewpoints, not promises of admission or current opening. Avoid descriptions that assume closed/restoring venues can be entered.
- Public mapping endpoints suit an initial small-scale version, not an unlimited-traffic availability promise. Review service policies before public launch.

## Product

- Eight themed Glasgow walks across art, music, history and sport.
- Nearby-start recommendations after explicit GPS permission.
- Visitors choose a theme or all nearby attractions. Order those attractions using actual pedestrian-network distances, with bounded detours and no forced return to the start.
- Interactive stop maps and true foot-network routes, with a no-GPS route-from-tour-start option.

## User preferences

- The user requires the website not to rely on any Replit-specific infrastructure or services.
- Keep the product a portable static website using standard browser APIs and independently available mapping services. Do not add Replit databases, auth, connectors, storage, or runtime APIs.
- **Why:** The user explicitly requested hosting and service independence.

## Gotchas

- Keep the package name matched to its configured managed workflow.
- Estimates exclude sightseeing time. Nearby-start distances are straight-line distances and must remain labelled as such.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
