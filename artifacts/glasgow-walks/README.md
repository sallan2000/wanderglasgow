# Wander Glasgow

A portable, static React frontend with a user-owned Supabase project for shared attractions, curated walks and administrator sign-in. There is no Replit-specific database, authentication, storage, connector or runtime dependency, and no product API server is required.

Optional direct walk emailing uses a function in that same owner-managed Supabase project plus Resend and Cloudflare Turnstile; the frontend remains independently hostable.

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

## Managing walking starting areas

Open **Admin → Attractions → Manage starting areas** to add a starting point, rename it, move its pin, or remove it with confirmation. Coordinates can also be entered by hand if the map is unavailable. Names must be unique regardless of capitalisation, 2–80 characters long, and cannot be “My location” (the separate GPS option). Saved areas are immediately public; they are route origins, not attraction categories or neighborhood filters.

For an existing installation, download `starting-areas-upgrade.sql` from the management panel and run the whole script in your own Supabase SQL Editor, then click Refresh. The original Supabase setup must already be installed. Fresh `setup.sql` includes this extension. It seeds City centre, West End, and East End with their original coordinates once. Re-running either script preserves custom entries, edits, deletions, attractions, curated walks, and administrator access.

Visitors read the saved names and coordinates on page load, focus, and every minute while visible; selecting a saved point rechecks its current coordinates before planning. Only approved administrators can write, with database-enforced permissions and stale-edit protection. An empty saved list stays empty, leaving GPS available. Only an unconfigured or not-yet-installed table shows the original three points with a notice; genuine service failures show a retry instead.

Run `npm run test:starting-areas` for isolated storage request/validation checks and `npm run test:admin` for real PostgreSQL permissions and upgrade preservation checks. `npm run test:starting-areas:browser` renders the actual admin form, public planner, and storage code against a fixture-only transport, covering CRUD, failed saves/deletes, removed origins, empty/error/retry states, mobile layout, and keyboard dialogs. It blocks external requests and never writes to the owner's Supabase project. It uses the same Chromium setup described in the walk-editor browser section below.

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

## Emailing walks

Visitors can use **Email this walk** on a completed planner result or in a curated-walk detail view. They enter their own address, explicitly consent to sharing the itinerary, complete a security check, and send. The form reports provider acceptance, not guaranteed inbox delivery. It remains available when the map cannot load.

Email delivery is disabled until the owner completes [the email setup guide](docs/email-delivery.md): verify a sender domain in Resend, configure Cloudflare Turnstile, run `public/email-delivery-upgrade.sql`, set the function's private secrets in Supabase, deploy `send-walk-email`, and rebuild the website with its public Turnstile site key. Fresh setup alone does not enable sending. No Replit connector or email-provider secret belongs in the frontend.

Emails contain readable stop itineraries and OpenStreetMap point links, not stored/shareable GPS tracks or turn-by-turn directions. Planner email includes the precise origin only after confirmation; curated email uses the latest published editorial stops from the listed start, never the visitor's GPS connector route. Stop prose is loaded from published database records, not accepted from the browser.

The app does not store addresses or routes or log request contents. The private database keeps keyed, non-plaintext abuse counters (three attempts per recipient and 100 globally per hour); counters older than two hours are removed on the next send attempt. Resend necessarily receives the address and email body and may retain them under its own policy. Cloudflare processes security checks. See the setup guide for retention, duplicate-retry limits, and provider troubleshooting.

`npm run test:email` checks the actual function, payload validation, canonical email content, fake provider outcomes, retries, and real isolated PostgreSQL limiter permissions. `npm run test:email:browser` verifies the rendered planner and curated email forms, consent, pending/failure/retry/success, keyboard/mobile behavior and setup-unavailable states. Neither suite sends real email or contacts the owner's Supabase.

## Mapping and privacy

### Repeatable walk editor browser regressions

Run `pnpm --filter @workspace/glasgow-walks run test:walks:browser` from the workspace root
(or `pnpm run test:walks:browser` from this artifact). The suite type-checks its fixture,
starts its own loopback-only Vite server on port 4179, and runs Chromium. It does not
need a running app, Supabase credentials, or an internet connection once dependencies
and Chromium are installed. On Replit it uses `/repl/tools/bin/chromium`; elsewhere
run `pnpm exec playwright install chromium` in this artifact or set
`WALK_TEST_CHROMIUM` to an existing Chromium executable. Failures retain screenshots,
traces and error context in `test-results/walk-browser/`.

The fixture renders the real `AdminWalkEditor`, `AdminWalkMap`, `browser-helpers`,
app styles and Leaflet library. A test-only Vite plugin replaces the editor's storage
and measurement imports; the save stub throws, route promises are manually settled,
and every unexpected external request fails the test. CDN library/styles and tile
responses are served from local fixtures, with no Supabase writes or location access.
Responses deliberately ignore abort so late success/failure guards are exercised.
A test-only coordinate button calls `setStops` without `invalidate`, checking the
coordinate-change effect independently of reorder/remove handlers; this control
is not included in the app's build.

Coverage includes delayed reorder/remove responses, changed coordinates, story-only
edits, map-library timeout and stylesheet failure/retry, tile error/retry, cleanup
when hiding/reopening (including pending library loads), dirty discard and focus
restoration, zero/one-stop previews and publishing validation, and mobile map sizing.
These component checks complement `test:walks` transport checks, not live database
or administrator authentication tests.

The app loads Leaflet from unpkg, map tiles from OpenStreetMap, and walking routes from the independent FOSSGIS/OpenStreetMap foot-routing service. Fonts come from Google Fonts. These require an internet connection and are not Replit services.

Location is requested only after a user action. Visitors can choose a theme or a mixed nearby-attraction walk. A GPS-started plan sends the current location and candidate attraction coordinates to the routing provider to calculate actual pedestrian-network distances. A manually chosen Glasgow starting point does not share GPS coordinates. Locations are not persisted.

The planner compares **all matching candidates within the chosen straight-line radius**, then excludes those beyond that radius on foot. It proves the shortest stop order, using supplied pedestrian-network distances, for the largest number of stops that fits the selected stop target and total walking-distance limit. There is no forced return to the starting point. The old nearest-12 shortlist is not used. Both category and nearby modes use the same optimiser.

Search is exact, not a greedy approximation: feasible greedy paths only provide pruning bounds; directed links, disconnected paths, zero-distance links and distance budgets are respected. It yields regularly so controls and cancellation stay responsive. To protect the public provider and mobile browsers, searches with over 50 geographically eligible candidates or those exceeding the computation allowance (two million expanded states / 12 seconds) fail with guidance to narrow the search, rather than silently dropping sights or calling an approximate result optimal. A final measured route must agree with its optimised distance within two metres of rounding tolerance; otherwise planning fails visibly and can be retried.

**Limits of the guarantee:** [OSRM's table API](https://project-osrm.org/docs/v5.24.0/api/#table-service) supplies distances along its fastest/profile-preferred walking paths, not necessarily the physically shortest paths. The app proves the best stop order under those supplied distances, not a global shortest-path guarantee across every street. Dead ends, bridges and access routes can still require reusing a street; avoiding all retracing can itself make a walk longer. Walking times exclude sightseeing. Public requests retain at least one-second spacing and no live requests are needed for the automated optimisation checks.

Run `npm run test:planner` to check optimisation against exhaustive small-graph solutions and verify theme, budget, cancellation and error handling. Add `-- --live` to check the independent foot-routing service.

Public map and routing endpoints have usage policies and no availability guarantee. Review their current terms and capacity before a large public launch, and configure a contracted or self-hosted provider if needed.

Tour information describes sightseeing stops, not guaranteed access or admission. Check venue opening and access information locally. Walking routes are suggestions, not accessibility or safety guarantees.