# Wander Glasgow

A portable, static React frontend with a user-owned Supabase project for shared attractions, curated walks and administrator sign-in. There is no Replit-specific database, authentication, storage, connector or runtime dependency, and no product API server is required.

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

1. In this directory run `npm run setup:export`, or build the app. This generates `public/setup.sql` with the 27 existing real attractions and eight original curated walks, plus `public/grant-admin.sql`. Both are also downloadable from the admin sign-in screen.
2. In your own Supabase project's **SQL Editor**, run the contents of `public/setup.sql`. It creates `public.glasgow_attractions`, a private administrator allow-list, constraints and row-level security. It seeds once: re-running the script preserves later edits and deletions. It does not overwrite another database or grant an arbitrary first user admin rights.
3. Under **Authentication → Users**, create your administrator account with your own email/password and confirm the account. You can use the dashboard's confirmed-user creation; keep passwords out of project files and build variables.
4. Copy `supabase/grant-admin.sql` into SQL Editor, replace `REPLACE_WITH_ADMIN_EMAIL` with that account's email, then run it. Only project-owner SQL access can authorise an administrator; signing up or setting user metadata cannot.
5. Visit `/admin` and sign in. There is no public registration screen. For this admin-only app, disable public user sign-ups in Supabase's Auth settings.
6. Configure Supabase Authentication URL settings: set the Site URL to your own HTTPS website and allow its exact `/admin` URL for password recovery. Add the exact development `/admin` URL if testing reset emails in development. Configure your own email delivery for reliable recovery; review Supabase's email limits and provider policies.

The public key cannot create tables or grant admin access, so steps 2–4 must be completed by the project owner. No privileged key is needed in the website.

## Attraction management and security

An attraction has a name, description, optional location/address label, precise latitude/longitude, **exactly one** category from the shared category list, and published/draft status. The original categories are Art, Music, History and Sport. Administrators can choose a point on the map, drag the pin, or enter coordinates directly. Saves persist to Supabase and update the visible list. Deletes require confirmation; stale updates/deletes are rejected using server-owned timestamps.

### Add custom categories

If the original four-category database is already installed, download `categories-upgrade.sql` from **Admin → Manage categories** (or the owner setup disclosure) and run its entire contents in the same Supabase project's SQL Editor. This one-time, re-runnable update preserves attraction data, timestamps, drafts and administrator access. Fresh installations already include it in `setup.sql`.

After upgrading, open **Manage categories**, enter a name of 2–40 characters, and click **Add category**. Category names are unique regardless of capitalisation; `All` is reserved for the unfiltered view. New categories persist in Supabase and appear immediately in the current admin session's editor and filter. Visitor choices refresh on page load and when returning focus to the page. An empty category can be selected, but planning reports that no published matching attractions are available.

Only approved administrators can add categories. Public visitors and ordinary signed-in users can read the list but cannot modify it. Each attraction's category is enforced by a foreign key, not a hard-coded four-value check. This interface adds categories; it does not rename or delete existing categories.

Both **Pick categories** and **Explore nearby** load the published attraction catalogue anew when a walk is requested. Pick categories accepts one or more choices and excludes all non-selected categories. Draft attractions are excluded even if an administrator is browsing the visitor site. Search choices are 1, 2, 3, 4, 5 and “5 km+”; the latter searches up to 10 km on foot with a 15 km total-walk limit, while other choices retain a 5 km total-walk limit.

## Creating curated walks

For an existing Supabase installation, sign in and choose **Curated walks**. Download `curated-walks-upgrade.sql` from the setup message, run its complete contents in your Supabase project's SQL Editor, and refresh. Fresh installs already include it in `setup.sql`. The upgrade imports the original eight walks once and preserves existing attractions, custom categories and admin authorisations. Re-running setup or the upgrade will not overwrite edits or resurrect deleted walks.

In **Curated walks → Add walk**, enter a title, description and category. Add published attractions, reorder them with the up/down controls, and edit the stop narratives as needed. The first stop is the listed start; there is no forced return leg. Save an unfinished walk as a draft, or publish a 2–30-stop walk after calculating its walking-network distance/time. Publishing automatically measures an unmeasured order. Changing stops or their order invalidates the old measurement; route-service errors do not substitute straight-line estimates. Walking times exclude sightseeing.

Walks can be searched, edited, unpublished by saving as a draft, or deleted with confirmation. Concurrent updates/deletes use server-owned timestamps to prevent stale edits. Deleting a walk does not delete attractions. Stops are editorial snapshots: later changes to source attractions do not silently change an existing walk. Review affected walks explicitly when their source places change.

The visitor site reads only published walks, including added walks and edits to originals. It refreshes on focus and every minute while visible; reload also fetches the current catalogue. Only an explicitly unconfigured/not-installed shared table shows the original-walk fallback, with a notice. A genuine service failure is reported, and an intentionally empty catalogue stays empty.

Run `npm run test:walks` for isolated validation and Supabase request-contract tests. `npm run test:admin` also exercises actual PostgreSQL curated-walk policies, publication, stop snapshots, conflict protection and upgrade idempotency. These do not mutate the owner's remote project.

Before storage is installed, visitor planning explicitly announces that it is using the original catalogue. After installation, a deliberately empty catalogue stays empty; live service failures show errors rather than silently using stale seed data.

Public visitors and ordinary signed-in users can read only published attractions. The database enforces all insert/update/delete permissions against the private admin allow-list. It also checks categories, coordinates, text lengths and duplicate names. Remove a user from `glasgow_walks_private.admin_users` in the SQL Editor to revoke editing access immediately.

Supabase manages authentication, session refresh and password recovery. The website never stores admin passwords. An administrator's session token is stored by the SDK in browser storage; use a trusted device and sign out when finished. User-authored names/descriptions are rendered as text, including map tooltips.

Run `npm run test:admin` for actual PostgreSQL checks in an isolated in-memory database (PGlite), including the existing-installation category upgrade, custom category permissions/persistence, anonymous/non-admin denial, metadata escalation prevention, drafts, validation, changes visible to visitors, conflicts, revocation and safe seed re-runs. These tests do not alter the Supabase project and are not a substitute for a live sign-in/save check after owner setup.

## Mapping and privacy

The app loads Leaflet from unpkg, map tiles from OpenStreetMap, and walking routes from the independent FOSSGIS/OpenStreetMap foot-routing service. Fonts come from Google Fonts. These require an internet connection and are not Replit services.

Location is requested only after a user action. Visitors can choose a theme or a mixed nearby-attraction walk. A GPS-started plan sends the current location and candidate attraction coordinates to the routing provider to calculate actual pedestrian-network distances. A manually chosen Glasgow starting point does not share GPS coordinates. Locations are not persisted.

The nearby planner uses a bounded catalogue of up to 12 nearby candidates, excludes attractions beyond the chosen walking radius, and finds the shortest open route for the largest number of stops that fits the selected stop count and total walking-distance limit. It does not force a return to the starting point. Road layouts can still require reusing a street; this reduces avoidable backtracking rather than guaranteeing none. Walking times exclude sightseeing.

Run `npm run test:planner` to check optimisation against exhaustive small-graph solutions and verify theme, budget, cancellation and error handling. Add `-- --live` to check the independent foot-routing service.

Public map and routing endpoints have usage policies and no availability guarantee. Review their current terms and capacity before a large public launch, and configure a contracted or self-hosted provider if needed.

Tour information describes sightseeing stops, not guaranteed access or admission. Check venue opening and access information locally. Walking routes are suggestions, not accessibility or safety guarantees.