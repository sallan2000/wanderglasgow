# Security review and launch checks

Review date: 2026-10-04. No review or scanner can guarantee a risk-free website.

## Findings and hardening

The dependency, static-code and privacy/dataflow scans reported no findings.
Manual review covered the portable website, its Supabase SQL installation and
the anonymous walk-email function. Scans are a point-in-time check, not proof
that all defects or deployment misconfigurations have been found.

Verification: TypeScript and production build passed; 102 isolated PostgreSQL
checks, 192 email checks and 60 browser cases passed, including administrator
authentication/recovery, map lifecycle, tampered-CDN rejection and policy
enforcement. Tests used isolated fixtures, not real owner credentials or sends.

- Database policies enforce authorisation server-side. Only owner-authorised
  administrators can write; anonymous and ordinary accounts cannot read drafts.
  The private administrator allow-list is not exposed to API users. Definer
  functions have an empty search path. Local PostgreSQL regression checks
  exercise these policies, not just the interface.
- Catalogue text is rendered as text, including map labels; it is not executed
  as HTML. Email content is escaped and loaded from published database records,
  not arbitrary visitor-provided prose or URLs.
- Builds reject a secret/service-role key in the Supabase publishable-key slot.
  Any `VITE_` setting is public: never put private credentials in one.
- The email function validates bounded requests, verifies Turnstile action and
  hostname server-side, uses atomic global/recipient counters, uses provider
  idempotency and returns sanitised errors. Its service-role and email-provider
  credentials belong only in Supabase Function Secrets.
- Leaflet script and stylesheet now have pinned integrity hashes and anonymous
  cross-origin loading. Different CDN bytes are rejected; retries never bypass
  verification. Upgrade the hashes together with the version after checking
  the new official files.
- `public/_headers` supplies CSP, anti-framing, MIME-sniffing protection,
  no-referrer, restricted device permissions and HTTPS transport protection for
  compatible static hosts. The policy permits required maps, fonts, Supabase
  and Turnstile. Inline *styles* remain necessary for Leaflet/React; inline
  scripts and dynamic JavaScript evaluation are not permitted.

## The owner must verify before launch

1. Serve only over HTTPS. Never expose Vite's development server as production.
2. Confirm the hosting service actually sends the supplied headers. Netlify and
   Cloudflare Pages support `_headers` on static responses; other hosts need
   equivalent server configuration. Check the actual HTML response, including
   `/admin` SPA fallback responses, with browser developer tools or:
   `curl -I https://YOUR-WEBSITE/admin`. A file in the build is not proof the
   server applies it. Custom Supabase domains need their HTTPS/WSS origin added
   to `connect-src`; do not replace the policy with unrestricted wildcards.
   Framing is intentionally blocked on production, including embedding the
   published site in third-party previews. HSTS instructs browsers to keep
   using HTTPS on this hostname for one year after a successful HTTPS visit.
3. In the Supabase SQL Editor, run `supabase/security-audit.sql`. It is read-only.
   Check all four public catalogue tables have RLS enabled; published-only
   read policies apply to attractions/walks and writes require
   `is_attraction_admin()`. Category/starting-area reads are public by design.
   There must be no broad extra policies granting all authenticated users
   write access: permissive PostgreSQL policies combine with OR.
   Private tables must not grant access to `anon`, `authenticated` or `PUBLIC`.
   `is_attraction_admin` may be executable by public API roles, but
   `claim_walk_email_send` must not be. Private allow-list/seed tables are
   protected by revoked schema/table privileges, not necessarily by RLS.
   Missing tables/functions need their supplied setup/upgrade, not bypasses.
4. Use a strong unique administrator password and remove obsolete admin
   authorisations through the project owner. Disable unnecessary public account
   signup if only owner-created administrator accounts are wanted. An ordinary
   account must never gain admin privileges merely by signing up.
5. Set Supabase Auth's Site URL and recovery redirect allow-list to exact trusted
   HTTPS website URLs; remove stale development URLs when no longer needed.
   Supabase/provider-level password protection and sign-in throttling must be
   reviewed in the owner dashboard. This portal does not currently enforce MFA.
6. For email, follow `docs/email-delivery.md`: real production Turnstile keys,
   exact hostname/origin allow-lists, a verified Resend sender and private
   limiter installation. Never use always-pass test keys in production.
   The public function's disabled JWT gate is intentional for anonymous
   visitors; do not extend that exception to other functions.
7. Keep dependencies and pinned CDN files updated and repeat scans periodically.

## Remaining risks and verification limits

- Local tests do not verify policies or settings currently installed in the
  owner's live Supabase project. This review did not change that project or
  access private credentials, send real email or exercise live administrator
  mutations. Production hosting headers are not confirmed until checked there.
- Admin sessions persist in browser storage. Use trusted devices, sign out on
  shared devices and avoid untrusted extensions. Any successful same-origin
  script compromise could access a browser session; CSP/SRI reduce that risk,
  not eliminate it.
- Third-party mapping, routing, fonts, Turnstile, Supabase and email delivery
  still require trust in their operators. They can fail and process request
  metadata. GPS is shared only after explicit action, not persisted by the app;
  email recipients and content are necessarily processed by Resend.
- Turnstile and rate limits reduce email abuse but do not prove the caller owns
  the destination mailbox. The sender is not an arbitrary-content relay; still,
  a caller could send an unwanted itinerary within the limits.
- Public data can be copied and public endpoints can be overloaded. Limits on
  planning protect the browser but do not replace provider capacity protection.
- Walking directions are not guarantees of accessibility, safe conditions,
  admission or opening hours; visitors must assess conditions locally.