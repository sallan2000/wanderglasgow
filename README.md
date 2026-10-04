# Wander Glasgow

A portable, static React frontend with a user-owned Supabase project for shared attractions, curated walks and administrator sign-in. There is no Replit-specific database, authentication, storage, connector or runtime dependency, and no product API server is required.

Optional direct walk emailing uses a function in that same owner-managed Supabase project plus Resend and Cloudflare Turnstile; the frontend remains independently hostable.

## Who can do what

| Role | Available actions |
| --- | --- |
| Visitor, without signing in | Browse published curated walks, filter by category, view stops and maps, find nearby walk starts, generate a walk, and optionally email an itinerary. |
| Authorised administrator | Sign in at `/admin`, manage attractions, add categories, manage starting areas, and create, edit, publish, unpublish or delete curated walks. |
| Supabase project owner | Install/upgrade database storage, create accounts, grant/revoke admin access, configure authentication and optional email delivery, and audit live permissions. |

There is no visitor registration, personal walk library, automatic itinerary saving, turn-by-turn navigation or public administrator signup screen.

## Visitor guide

### Browse a curated walk

1. Choose **Curated tours**, or scroll to the curated-walk cards.
2. Category buttons filter the curated list and also open the planner with that category selected. **Show all walks** clears the curated-list filter.
3. Open a walk card to see its title, subtitle, category, listed start, approximate distance, walking time, ordered stop stories and interactive map.
4. Choose **Start walking route** to request your location and draw a pedestrian route from it through the listed stops. If you are more than 25 km from the first stop, use the non-GPS option instead.
5. Choose **Route from tour start** to calculate a route from the first stop without sharing your GPS position.
6. Close the detail drawer using **All walks**, the close button, Escape, or the background outside it.

The curated stop order is editorial: requesting a route does not optimise or reorder it. Displayed walking times exclude time at attractions. A failed map/routing service does not prevent reading stop stories; retries are offered rather than drawing an invented walking route.

**Find walks near me** ranks up to three curated walks by straight-line distance to their first stops. This is not a walking-distance calculation and does not send GPS coordinates to the walking service.

### Generate a walk

1. Open **Plan my walk**.
2. Choose **Pick categories** and select one or more categories, or **Explore nearby** to consider all categories.
3. Choose an administrator-maintained starting point or **My location**. The latter requests browser permission only when you press the plan button.
4. Select a radius and a target of **1–6 stops**, then calculate the walk.
5. Read the ordered stops, measured distance/time, route map and the list of additional nearby sights not included within the selected limits.
6. Change your settings and plan again, or use the offered retry after an error. Changing settings cancels/invalidates the previous plan; it is not saved as a personal itinerary.

| Radius choice | Eligible distance from the start on foot | Total walking limit |
| --- | --- | --- |
| 1, 2, 3, 4 or 5 km | The selected radius | 5 km |
| 5 km+ | Up to 10 km | 15 km |

The planner first filters by straight-line radius, checks actual pedestrian-network distances, and considers all eligible matching sights. It maximises the feasible stop count up to your target, then proves the shortest stop order under the supplied walking distances. It does not force a return to the start.

This is **not** a guarantee of zero doubling back or the physically shortest street paths: the provider returns distances along its preferred walking paths, and dead ends or access routes may require retracing. Searches over 50 geographically eligible candidates, or those too expensive to prove within the computation allowance, ask you to narrow your settings instead of silently approximating. See [Routing behaviour and limitations](#routing-behaviour-and-limitations).

### Email an itinerary

If the owner has enabled sending, choose **Email this walk** in a curated detail drawer or on a completed generated walk. Enter your own email address, tick the consent box, complete the security check and send.

- A generated-walk email includes its precise start, ordered stops and measured totals.
- A curated-walk email includes the latest published editorial itinerary, not your optional GPS connector.
- Emails contain readable stop information and OpenStreetMap point links, not a stored GPS track or turn-by-turn directions.
- The success message means the provider accepted the request, not that delivery to the inbox is guaranteed.
- If sending is unavailable, the walk remains readable. See [Emailing walks](#emailing-walks) for setup and privacy details.

## Development and independent hosting

Use Node.js 22 or newer and pnpm. Run these commands from the **repository root**; this is a pnpm workspace, not an npm-managed repository:

```sh
pnpm install
pnpm --filter @workspace/glasgow-walks run dev
```

Outside a managed workflow, the development port defaults to 5173. `PORT` overrides the port, and `BASE_PATH` sets the build's URL prefix when hosting below `/`. The admin URL is relative to that prefix, for example `/walks/admin` for `BASE_PATH=/walks/`.

Set the following at **build time**, either in the build environment or an uncommitted `artifacts/glasgow-walks/.env.local`:

| Variable | Purpose |
| --- | --- |
| `VITE_SUPABASE_URL` | URL of the owner's Supabase project. |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Public publishable key or legacy `anon` key. The build rejects a privileged key in this field. |
| `VITE_TURNSTILE_SITE_KEY` | Optional public site key; required for the email security check. |

Vite includes `VITE_` values in the browser bundle. Never put secret/service-role keys or private email credentials in these variables. Build-environment settings must be supplied again on another host; it cannot read secrets held by Replit. The static website does not need `SESSION_SECRET`.

Build from the repository root:

```sh
pnpm --filter @workspace/glasgow-walks run typecheck
pnpm --filter @workspace/glasgow-walks run build
```

Upload **the contents of `artifacts/glasgow-walks/dist/public`** to a static HTTPS host. No Replit API server or database needs to run. Configure an SPA fallback so the admin path serves `index.html`, while real assets and `.sql` downloads remain served normally. If deploying under a subpath, build with the matching `BASE_PATH`.

The build copies `artifacts/glasgow-walks/public/_headers` for compatible hosts such as Netlify/Cloudflare Pages. Other hosts require equivalent header configuration. Verify the actual deployed responses, including `/admin`; merely uploading this file is not proof the headers are active. The supplied policy intentionally blocks framing and needs an explicit adjustment for custom Supabase domains. See [the security checklist](artifacts/glasgow-walks/docs/security-review.md).

## One-time Supabase setup

1. From the repository root run `pnpm --filter @workspace/glasgow-walks run setup:export`, or build the app. This generates `artifacts/glasgow-walks/public/setup.sql` with 27 initial attractions and eight original curated walks, plus `artifacts/glasgow-walks/public/grant-admin.sql`. Use these repository files for owner setup; the normal sign-in/password-reset forms do not show setup downloads.
2. In your own Supabase project's **SQL Editor**, run the contents of `artifacts/glasgow-walks/public/setup.sql`. It creates `public.glasgow_attractions`, a private administrator allow-list, constraints and row-level security. It seeds once: re-running the script preserves later edits and deletions. It does not overwrite another database or grant an arbitrary first user admin rights.
3. Under **Authentication → Users**, create your administrator account with your own email/password and confirm the account. You can use the dashboard's confirmed-user creation; keep passwords out of project files and build variables.
4. Copy `artifacts/glasgow-walks/supabase/grant-admin.sql` into SQL Editor, replace `REPLACE_WITH_ADMIN_EMAIL` with that account's email, then run it. Only project-owner SQL access can authorise an administrator; signing up or setting user metadata cannot.
5. Visit `/admin` and sign in. There is no public registration screen. For this admin-only app, disable public user sign-ups in Supabase's Auth settings.
6. Configure Supabase Authentication URL settings: set the Site URL to your own HTTPS website and allow its exact `/admin` URL for password recovery. Add the exact development `/admin` URL if testing reset emails in development. Configure your own email delivery for reliable recovery; review Supabase's email limits and provider policies.

The public key cannot create tables or grant admin access, so steps 2–4 must be completed by the project owner. No privileged key is needed in the website.

## Administrator guide

### Sign in, recover access and sign out

Use **Admin sign in** in the footer or visit `/admin` (relative to `BASE_PATH`). Sign in with an account the project owner has explicitly authorised. A valid Supabase account alone is not sufficient; the portal checks the private admin allow-list, and database policies enforce permissions on every write.

**Forgot your password?** sends a recovery request through Supabase. Open the reset link on the same device, enter and confirm a new password of at least eight characters, then save it. Delivery and redirect configuration depend on the owner's Supabase Auth setup. **Sign out** ends the session; the SDK persists session tokens in browser storage, so use a trusted device.

The portal has **Attractions** and **Curated walks** sections. Saving is explicit, not automatic. Unsaved form contents are local; do not assume that switching sections, reloading or closing the browser preserves them.

### Attractions

See [the security review and launch checklist](artifacts/glasgow-walks/docs/security-review.md) for
integrity-protected map loading, supplied production response headers and a
read-only Supabase policy audit. The local scans/tests do not certify live
Supabase settings or headers on a separate host.

An attraction has a name, description, optional location/address label, precise latitude/longitude, **exactly one** category from the shared category list, and published/draft status. The original categories are Art, Music, History and Sport. Administrators can choose a point on the map, drag the pin, or enter coordinates directly. Saves persist to Supabase and update the visible list. Deletes require confirmation; stale updates/deletes are rejected using server-owned timestamps.

1. In **Attractions**, search by name/address and filter by category or draft/published status. **Refresh** reloads the catalogue and categories.
2. Choose **Add attraction** or edit an existing entry. Supply a name, a description, a category and coordinates; the address/location label is optional.
3. Use the map or type the coordinates. Map/library or tile failures do not require inventing coordinates and do not remove the manual fields.
4. Set the **Published/Draft** switch and then save. Drafts are hidden from visitor planning; changing the switch alone does not persist the edit.
5. To remove an attraction, choose its delete action and confirm. Deletion does not rewrite stop snapshots in already-authored curated walks.

Names are case-insensitively unique (2–200 characters). Descriptions require 10–5,000 characters; location labels allow up to 300. Latitude/longitude and category membership are validated in the client and database.

### Attraction access details

In the attraction editor, record **Step-free entrance**, **Accessible toilet** and **Seating / rest point** as Unknown, Yes or No, plus an optional owner-provided note (up to 1,500 characters). Save explicitly. Older attractions default to Unknown; this is not the same as No. These records are owner-maintained information, not certification.

For an existing Supabase installation, run `artifacts/glasgow-walks/public/access-details-upgrade.sql` in the owner's SQL Editor. The script is re-runnable, preserves existing records and permissions, and adds the fields without altering administrator access. Fresh `setup.sql` already includes it. An older installation can still be read; saving requires the upgrade, with a download link shown if columns are missing.

In either planner mode, **Only stops with a recorded step-free entrance** excludes both No and Unknown entrances before routing. Generated stop cards show the recorded details and note. Clear the filter if nothing matches. The preference is held only in memory and is not stored.

The filter describes attraction entrances only: paths between sights are **not assessed**, and it does not promise an accessible walking route. Curated stop snapshots and emailed itineraries do not yet include these structured access details.

### Add custom categories

If the original four-category database is already installed, download `categories-upgrade.sql` from **Admin → Manage categories** (or use `artifacts/glasgow-walks/public/categories-upgrade.sql` in this repository) and run its entire contents in the same Supabase project's SQL Editor. This one-time, re-runnable update preserves attraction data, timestamps, drafts and administrator access. Fresh installations already include it in `artifacts/glasgow-walks/public/setup.sql`.

After upgrading, open **Manage categories**, enter a name of 2–40 characters, and click **Add category**. Category names are unique regardless of capitalisation; `All` is reserved for the unfiltered view. New categories persist in Supabase and appear immediately in the current admin session's editor and filter. Visitor choices refresh on page load and when returning focus to the page. An empty category can be selected, but planning reports that no published matching attractions are available.

Only approved administrators can add categories. Public visitors and ordinary signed-in users can read the list but cannot modify it. Each attraction's category is enforced by a foreign key, not a hard-coded four-value check. This interface adds categories; it does not rename or delete existing categories.

Both **Pick categories** and **Explore nearby** load the published attraction catalogue anew when a walk is requested. Pick categories accepts one or more choices and excludes all non-selected categories. Draft attractions are excluded even if an administrator is browsing the visitor site. Search choices are 1, 2, 3, 4, 5 and “5 km+”; the latter searches up to 10 km on foot with a 15 km total-walk limit, while other choices retain a 5 km total-walk limit.

### Starting areas

Open **Admin → Attractions → Manage starting areas** to add a starting point, rename it, move its pin, or remove it with confirmation. Coordinates can also be entered by hand if the map is unavailable. Names must be unique regardless of capitalisation, 2–80 characters long, and cannot be “My location” (the separate GPS option). Saved areas are immediately public; they are route origins, not attraction categories or neighborhood filters.

For an existing installation, download `starting-areas-upgrade.sql` from the management panel and run the whole script in your own Supabase SQL Editor, then click Refresh. The original Supabase setup must already be installed. Fresh `artifacts/glasgow-walks/public/setup.sql` includes this extension. It seeds City centre, West End, and East End with their original coordinates once. Re-running either script preserves custom entries, edits, deletions, attractions, curated walks, and administrator access.

Visitors read the saved names and coordinates on page load, focus, and every minute while visible; selecting a saved point rechecks its current coordinates before planning. Only approved administrators can write, with database-enforced permissions and stale-edit protection. An empty saved list stays empty, leaving GPS available. Only an unconfigured or not-yet-installed table shows the original three points with a notice; genuine service failures show a retry instead.

### Curated walks

For an existing Supabase installation, sign in and choose **Curated walks**. Download `curated-walks-upgrade.sql` from the setup message, run its complete contents in your Supabase project's SQL Editor, and refresh. Fresh installs already include it in `artifacts/glasgow-walks/public/setup.sql`. The upgrade imports the original eight walks once and preserves existing attractions, custom categories and admin authorisations. Re-running setup or the upgrade will not overwrite edits or resurrect deleted walks.

1. In **Curated walks**, search by title/subtitle, filter by category or draft/published status, and refresh the list as needed.
2. Choose **Add walk** or edit an existing walk. Enter a title, subtitle and category.
3. Add published attractions as stops, move them with the up/down controls, remove unwanted stops, and edit their narratives.
4. Preview the map and calculate the walking distance/time. Measurement follows your chosen order; it does not optimise or reorder a curated walk.
5. **Save draft** keeps an unfinished walk hidden from visitors. **Publish** requires 2–30 valid stops and walking measurements; an unmeasured order is measured automatically during publishing.
6. To hide a published walk, use **Unpublish as draft** and save. To remove it permanently, choose delete and confirm; source attractions are not deleted.

The first stop is the listed start; there is no forced return leg. Changing stops, coordinates or order invalidates the old measurement. Editing only story text preserves the route measurement. A preview with zero/one stop has no invented route. Route-service errors do not substitute straight-line estimates. Walking times exclude sightseeing.

Walks can be searched, edited, unpublished by saving as a draft, or deleted with confirmation. Concurrent updates/deletes use server-owned timestamps to prevent stale edits. Deleting a walk does not delete attractions. Stops are editorial snapshots: later changes to source attractions do not silently change an existing walk. Review affected walks explicitly when their source places change.

The visitor site reads only published walks, including added walks and edits to originals. It refreshes on focus and every minute while visible; reload also fetches the current catalogue. Only an explicitly unconfigured/not-installed shared table shows the original-walk fallback, with a notice. A genuine service failure is reported, and an intentionally empty catalogue stays empty.

## Shared data and permissions

Before storage is installed, visitor planning explicitly announces that it is using the original catalogue. After installation, a deliberately empty catalogue stays empty; live service failures show errors rather than silently using stale seed data.

Public visitors and ordinary signed-in users can read only published attractions. The database enforces all insert/update/delete permissions against the private admin allow-list. It also checks categories, coordinates, text lengths and duplicate names. Remove a user from `glasgow_walks_private.admin_users` in the SQL Editor to revoke editing access immediately.

Supabase manages authentication, session refresh and password recovery. The website never stores admin passwords. An administrator's session token is stored by the SDK in browser storage; use a trusted device and sign out when finished. User-authored names/descriptions are rendered as text, including map tooltips.

Fresh `artifacts/glasgow-walks/public/setup.sql` includes the catalogue, categories, starting areas and curated-walk extensions. For an older installation, run only the relevant supplied upgrades: `categories-upgrade.sql`, `starting-areas-upgrade.sql` and/or `curated-walks-upgrade.sql`. They are exported to `artifacts/glasgow-walks/public/`, re-runnable and designed to preserve edits, deletions and authorisations. The separate email upgrade is optional and is not enabled by fresh catalogue setup.

## Emailing walks

Visitors can use **Email this walk** on a completed planner result or in a curated-walk detail view. They enter their own address, explicitly consent to sharing the itinerary, complete a security check, and send. The form reports provider acceptance, not guaranteed inbox delivery. It remains available when the map cannot load.

Email delivery is disabled until the owner completes [the email setup guide](artifacts/glasgow-walks/docs/email-delivery.md): verify a sender domain in Resend, configure Cloudflare Turnstile, run `artifacts/glasgow-walks/public/email-delivery-upgrade.sql`, set the function's private secrets in Supabase, deploy `send-walk-email`, and rebuild the website with its public Turnstile site key. Fresh setup alone does not enable sending. No Replit connector or email-provider secret belongs in the frontend.

Emails contain readable stop itineraries and OpenStreetMap point links, not stored/shareable GPS tracks or turn-by-turn directions. Planner email includes the precise origin only after confirmation; curated email uses the latest published editorial stops from the listed start, never the visitor's GPS connector route. Stop prose is loaded from published database records, not accepted from the browser.

The app does not store addresses or routes or log request contents. The private database keeps keyed, non-plaintext abuse counters (three attempts per recipient and 100 globally per hour); counters older than two hours are removed on the next send attempt. Resend necessarily receives the address and email body and may retain them under its own policy. Cloudflare processes security checks. See the setup guide for retention, duplicate-retry limits, and provider troubleshooting.

## Automated checks

From the repository root, run `pnpm --filter @workspace/glasgow-walks run <script>`. From the artifact directory, use `pnpm run <script>`.

| Script | Coverage |
| --- | --- |
| `typecheck` | Application TypeScript. |
| `build` | Export owner setup SQL and produce the static website. |
| `setup:export` | Regenerate downloadable owner setup and upgrade SQL without building the website. |
| `serve` | Preview an existing static build locally; not a production hosting service. |
| `test:planner` | Exact optimisation versus exhaustive examples, candidate selection, categories, budgets, cancellation, distance consistency and errors. |
| `test:access` | Access validation, legacy Unknown defaults, storage contracts, filtering and real isolated PostgreSQL upgrade/fresh-setup permissions. |
| `test:access:browser` | Actual editor saving/reopening/reloading, schema-upgrade guidance, visitor access display/filter and keyboard/mobile controls with intercepted services. |
| `test:admin` | Real isolated PostgreSQL permissions, drafts, validation, conflicts, safe upgrades/seeds, revocation and the read-only audit script. |
| `test:walks` | Curated-walk validation and storage/measurement request contracts. |
| `test:starting-areas` | Starting-area validation and storage request contracts. |
| `test:email` | Email handler, validation, fake providers, retry behaviour and isolated PostgreSQL rate-limiter permissions. |
| `test:walks:browser` | Auth/recovery, editor/map lifecycle, integrity/policy checks and the separate walk-list suite. |
| `test:walks:list:browser` | Walk lists, filters, refresh and failure/retry states. |
| `test:admin:browser` | Administrator sign-in/recovery components. |
| `test:starting-areas:browser` | Starting-area management and public planner with isolated transport. |
| `test:email:browser` | Visitor email forms and planning integration, including consent, errors, retries and keyboard/mobile states. |

Browser suites start their own fixture servers and use Chromium; the app's workflow does not need to be running. On Replit the configurations can use `/repl/tools/bin/chromium`. Elsewhere, from this artifact run `pnpm exec playwright install chromium`, or set `WALK_TEST_CHROMIUM` to an existing executable. Failures retain screenshots/traces under `artifacts/glasgow-walks/test-results/`.

The normal suites use local fixtures and/or isolated PGlite databases: they do not mutate the owner's Supabase project or send real email. They are not proof that live owner settings are correct. `pnpm run test:planner -- --live`, from the artifact directory, additionally calls the public foot-routing service using a fixed Glasgow example.

## Mapping and privacy

The app loads Leaflet from unpkg, map tiles from OpenStreetMap, and walking routes from the independent FOSSGIS/OpenStreetMap foot-routing service. Fonts come from Google Fonts. These require an internet connection and are not Replit services.

Location is requested only after a user action. Visitors can choose a theme or a mixed nearby-attraction walk. A GPS-started plan sends the current location and candidate attraction coordinates to the routing provider to calculate actual pedestrian-network distances. A manually chosen Glasgow starting point does not share GPS coordinates. Locations are not persisted.

### Routing behaviour and limitations

The planner compares **all matching candidates within the chosen straight-line radius**, then excludes those beyond that radius on foot. It proves the shortest stop order, using supplied pedestrian-network distances, for the largest number of stops that fits the selected stop target and total walking-distance limit. There is no forced return to the starting point. The old nearest-12 shortlist is not used. Both category and nearby modes use the same optimiser.

Search is exact, not a greedy approximation: feasible greedy paths only provide pruning bounds; directed links, disconnected paths, zero-distance links and distance budgets are respected. It yields regularly so controls and cancellation stay responsive. To protect the public provider and mobile browsers, searches with over 50 geographically eligible candidates or those exceeding the computation allowance (two million expanded states / 12 seconds) fail with guidance to narrow the search, rather than silently dropping sights or calling an approximate result optimal. A final measured route must agree with its optimised distance within two metres of rounding tolerance; otherwise planning fails visibly and can be retried.

**Limits of the guarantee:** [OSRM's table API](https://project-osrm.org/docs/v5.24.0/api/#table-service) supplies distances along its fastest/profile-preferred walking paths, not necessarily the physically shortest paths. The app proves the best stop order under those supplied distances, not a global shortest-path guarantee across every street. Dead ends, bridges and access routes can still require reusing a street; avoiding all retracing can itself make a walk longer. Walking times exclude sightseeing. Public requests retain at least one-second spacing and no live requests are needed for the automated optimisation checks.

Public map and routing endpoints have usage policies and no availability guarantee. Review their current terms and capacity before a large public launch, and configure a contracted or self-hosted provider if needed.

Tour information describes sightseeing stops, not guaranteed access or admission. Check venue opening and access information locally. Walking routes are suggestions, not accessibility or safety guarantees.

## Important files

Paths below are relative to the repository root.

| Path | Responsibility |
| --- | --- |
| `artifacts/glasgow-walks/src/App.tsx`, `artifacts/glasgow-walks/src/WalkPlanner.tsx` | Visitor screens, curated details and generated-walk controls. |
| `artifacts/glasgow-walks/src/walk-planner.ts`, `artifacts/glasgow-walks/src/efficient-walk-order.ts` | Foot-routing integration and bounded exact stop-order search. |
| `artifacts/glasgow-walks/src/AdminPortal.tsx`, `artifacts/glasgow-walks/src/AdminAuth.tsx` | Admin session/access gate and password recovery. |
| `artifacts/glasgow-walks/src/AdminManager.tsx`, `artifacts/glasgow-walks/src/AdminEditor.tsx`, `artifacts/glasgow-walks/src/AdminCategories.tsx` | Attraction and category management. |
| `artifacts/glasgow-walks/src/AdminStartingAreas.tsx`, `artifacts/glasgow-walks/src/starting-area-store.ts` | Starting-point management and storage. |
| `artifacts/glasgow-walks/src/AdminWalks.tsx`, `artifacts/glasgow-walks/src/AdminWalkEditor.tsx`, `artifacts/glasgow-walks/src/walk-store.ts` | Curated-walk editing, measurement and persistence. |
| `artifacts/glasgow-walks/src/attraction-store.ts`, `artifacts/glasgow-walks/src/hooks/`, `artifacts/glasgow-walks/src/use-starting-areas.ts` | Supabase access and public refresh/fallback behaviour. |
| `artifacts/glasgow-walks/src/browser-helpers.ts`, `artifacts/glasgow-walks/src/map-tiles.tsx` | Integrity-checked Leaflet loading, geolocation and tile-failure handling. |
| `artifacts/glasgow-walks/src/tours.ts`, `artifacts/glasgow-walks/src/attractions.ts` | Original seed/fallback content, not the live admin-editable database. |
| `artifacts/glasgow-walks/scripts/export-supabase-setup.mjs`, `artifacts/glasgow-walks/supabase/`, `artifacts/glasgow-walks/public/*.sql` | Owner-run database installation and upgrades. |
| `artifacts/glasgow-walks/supabase/functions/send-walk-email/` | Optional server-side email dispatch. |
| `artifacts/glasgow-walks/public/_headers`, `artifacts/glasgow-walks/supabase/security-audit.sql` | Hosting-policy template and read-only live database audit. |
| `artifacts/glasgow-walks/docs/email-delivery.md`, `artifacts/glasgow-walks/docs/security-review.md` | Owner setup, launch checks and remaining limitations. |

The workspace's API-server/database packages are unused scaffolds, not dependencies of this website's runtime.