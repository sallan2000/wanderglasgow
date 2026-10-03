# Glasgow Walks

A portable, static React frontend with a user-owned Supabase project for shared attractions and administrator sign-in. There is no Replit-specific database, authentication, storage, connector or runtime dependency, and no product API server is required.

## Build independently

From this directory, with Node.js 22 or newer:

```sh
npm install
npm run typecheck
npm run build
```

Before building, set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` as standard build-time environment variables, or in a local `.env` file. Use a public publishable key or the legacy `anon` key, **never a secret/service_role key**. Vite bundles these settings into the website; the build rejects privileged keys. Do not commit local `.env` files. The same variables work on an independent host.

Upload the contents of `dist/public` to any static web host. Configure an SPA fallback so `/admin` serves `index.html` while real assets and `.sql` downloads remain served normally. Serve over HTTPS so browser geolocation works on phones. `npm run dev` runs locally on port 5173; `PORT` and `BASE_PATH` are optional standard configuration overrides.

## One-time Supabase setup

1. In this directory run `npm run setup:export`, or build the app. This generates `public/setup.sql` with the 27 existing real attractions and `public/grant-admin.sql`. Both are also downloadable from the admin sign-in screen.
2. In your own Supabase project's **SQL Editor**, run the contents of `public/setup.sql`. It creates `public.glasgow_attractions`, a private administrator allow-list, constraints and row-level security. It seeds once: re-running the script preserves later edits and deletions. It does not overwrite another database or grant an arbitrary first user admin rights.
3. Under **Authentication → Users**, create your administrator account with your own email/password and confirm the account. You can use the dashboard's confirmed-user creation; keep passwords out of project files and build variables.
4. Copy `supabase/grant-admin.sql` into SQL Editor, replace `REPLACE_WITH_ADMIN_EMAIL` with that account's email, then run it. Only project-owner SQL access can authorise an administrator; signing up or setting user metadata cannot.
5. Visit `/admin` and sign in. There is no public registration screen. For this admin-only app, disable public user sign-ups in Supabase's Auth settings.
6. Configure Supabase Authentication URL settings: set the Site URL to your own HTTPS website and allow its exact `/admin` URL for password recovery. Add the exact development `/admin` URL if testing reset emails in development. Configure your own email delivery for reliable recovery; review Supabase's email limits and provider policies.

The public key cannot create tables or grant admin access, so steps 2–4 must be completed by the project owner. No privileged key is needed in the website.

## Attraction management and security

An attraction has a name, description, optional location/address label, precise latitude/longitude, **exactly one** theme (Art, Music, History or Sport), and published/draft status. Administrators can choose a point on the map, drag the pin, or enter coordinates directly. Saves persist to Supabase and update the visible list. Deletes require confirmation; stale updates/deletes are rejected using server-owned timestamps.

Both **Pick a theme** and **Explore nearby** load the published catalogue anew when a walk is requested. Drafts are excluded even if an administrator is browsing the visitor site. The eight editorial tours retain their fixed routes/stops; catalogue management changes dynamically planned walks, not those authored tour itineraries.

Before storage is installed, visitor planning explicitly announces that it is using the original catalogue. After installation, a deliberately empty catalogue stays empty; live service failures show errors rather than silently using stale seed data.

Public visitors and ordinary signed-in users can read only published attractions. The database enforces all insert/update/delete permissions against the private admin allow-list. It also checks themes, coordinates, text lengths and duplicate names. Remove a user from `glasgow_walks_private.admin_users` in the SQL Editor to revoke editing access immediately.

Supabase manages authentication, session refresh and password recovery. The website never stores admin passwords. An administrator's session token is stored by the SDK in browser storage; use a trusted device and sign out when finished. User-authored names/descriptions are rendered as text, including map tooltips.

Run `npm run test:admin` for 30 actual PostgreSQL checks in an isolated in-memory database (PGlite), including anonymous/non-admin denial, metadata escalation prevention, drafts, validation, changes visible to visitors, conflicts, revocation and safe seed re-runs. These tests do not alter the Supabase project and are not a substitute for a live sign-in/save check after owner setup.

## Mapping and privacy

The app loads Leaflet from unpkg, map tiles from OpenStreetMap, and walking routes from the independent FOSSGIS/OpenStreetMap foot-routing service. Fonts come from Google Fonts. These require an internet connection and are not Replit services.

Location is requested only after a user action. Visitors can choose a theme or a mixed nearby-attraction walk. A GPS-started plan sends the current location and candidate attraction coordinates to the routing provider to calculate actual pedestrian-network distances. A manually chosen Glasgow starting point does not share GPS coordinates. Locations are not persisted.

The nearby planner uses a bounded catalogue of up to 12 nearby candidates, excludes attractions beyond the chosen walking radius, and finds the shortest open route for the largest number of stops that fits the selected stop count and total walking-distance limit. It does not force a return to the starting point. Road layouts can still require reusing a street; this reduces avoidable backtracking rather than guaranteeing none. Walking times exclude sightseeing.

Run `npm run test:planner` to check optimisation against exhaustive small-graph solutions and verify theme, budget, cancellation and error handling. Add `-- --live` to check the independent foot-routing service.

Public map and routing endpoints have usage policies and no availability guarantee. Review their current terms and capacity before a large public launch, and configure a contracted or self-hosted provider if needed.

Tour information describes sightseeing stops, not guaranteed access or admission. Check venue opening and access information locally. Walking routes are suggestions, not accessibility or safety guarantees.