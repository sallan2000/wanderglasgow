# Wander Glasgow

The public brand is Wander Glasgow. Existing internal artifact/package names, database identifiers and sign-in storage keys intentionally stay unchanged.
**Why:** A branding rename must preserve existing URLs, attraction data and administrator sessions.

A mobile-friendly, self-guided Glasgow walking-tour website with art, music, history and sport themes.

## Run & Operate

- `pnpm --filter @workspace/glasgow-walks run dev` — run the website.
- `pnpm --filter @workspace/glasgow-walks run typecheck` — check the app.
- `pnpm --filter @workspace/glasgow-walks run build` — produce static files in `artifacts/glasgow-walks/dist/public`.
- Visitor editorial tours are static; shared attraction management uses external Supabase. Build settings: `VITE_SUPABASE_URL` and public `VITE_SUPABASE_PUBLISHABLE_KEY`. No product API server or Replit database. Geolocation requires HTTPS.
- See `artifacts/glasgow-walks/README.md` for independent-host build instructions and external mapping-service assumptions.

## Stack

- React, TypeScript, Vite, and plain CSS in a portable static web app.
- Leaflet/OpenStreetMap maps and an independent OSRM foot-routing endpoint.
- The API server and database packages are unused scaffolds, not product dependencies.

## Where things live

- Website: `artifacts/glasgow-walks`.
- Curated tours and stops: `src/tours.ts`.
- Supabase client and shared catalogue: `src/attraction-store.ts`. Admin portal: `/admin`.
- Database installation: generated `public/setup.sql`; first-admin authorisation: `supabase/grant-admin.sql`. These must be run by the Supabase project owner.
- Interface, geolocation and map routing: `src/App.tsx`.

## Architecture decisions

- All tour ranking runs on the device. Do not persist GPS coordinates.
- Stops are sightseeing viewpoints, not promises of admission or current opening. Avoid descriptions that assume closed/restoring venues can be entered.
- Public mapping endpoints suit an initial small-scale version, not an unlimited-traffic availability promise. Review service policies before public launch.
- Admin sign-in and shared attraction storage use a user-owned Supabase project, accessed directly through standard APIs. Enforce editing permissions with database row-level security, not just hidden admin controls.
- **Why:** The user approved choosing an independent setup; one provider for authentication and storage avoids extra service accounts while retaining hosting independence.

## Product

- Eight themed Glasgow walks across art, music, history and sport.
- Nearby-start recommendations after explicit GPS permission.
- Visitors choose one or more categories, or all nearby attractions. A category-selected walk includes only attractions matching any selected category; non-selected categories are excluded from both the route and nearby suggestions. Order those attractions using actual pedestrian-network distances, with bounded detours and no forced return to the start.
- The “5 km+” search is capped at 10 km on foot and allows a total walk up to 15 km. The 1–5 km search options retain their 5 km total-walk limit. Longer searches also include nearer attractions.
- Administrators add/edit/delete attractions with descriptions, exact map coordinates, one best-fitting theme, and draft/published status. Both dynamic visitor modes refetch published attractions whenever a walk is planned.
- Interactive stop maps and true foot-network routes, with a no-GPS route-from-tour-start option.

## User preferences

- The user requires the website not to rely on any Replit-specific infrastructure or services.
- Keep the frontend portable using standard browser APIs and independently available mapping and data services. Do not add Replit databases, auth, storage, connectors at runtime, or runtime APIs.
- **Why:** The user explicitly requested hosting and service independence.

## Gotchas

- Keep the package name matched to its configured managed workflow.
- Estimates exclude sightseeing time. Nearby-start distances are straight-line distances and must remain labelled as such.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
