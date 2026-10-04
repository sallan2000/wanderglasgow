# Enable one-off walk emails

Direct email is optional. These steps run in your own service accounts, outside Replit. The website stays a static build; only email dispatch uses a Supabase Edge Function. No visitor accounts or mailing list are needed.

## 1. Configure Resend

- Create/use your own [Resend](https://resend.com) account and verify a sending domain with the DNS records Resend supplies. Use an address on that domain, for example `Wander Glasgow <walks@your-domain.example>`.
- Create a **sending-only**, domain-restricted API key. Put it only in **Supabase → Edge Functions → Secrets**, named `RESEND_API_KEY`. Never put this private key in chat, a source file, a Vite variable, or a Replit connector.
- Review Resend's sending limits, terms, and [privacy policy](https://resend.com/legal/privacy-policy). Its testing domain does not support arbitrary visitor recipients; use your verified domain.

## 2. Configure Cloudflare Turnstile

- Create a [Turnstile widget](https://developers.cloudflare.com/turnstile/get-started/) in your own Cloudflare account. Authorise each exact website hostname on which visitors may send email, including your independent production host.
- Put the private widget secret in Supabase Function Secrets as `TURNSTILE_SECRET_KEY`.
- The widget's **public site key** goes into your standard website build configuration as `VITE_TURNSTILE_SITE_KEY`. It is public by design; never substitute the private secret.
- For independent local testing you may authorise `localhost`; add `http://localhost:5173` to the origin allow-list below. Real production should use HTTPS. Do not use Cloudflare's always-pass test keys in production. Blocked scripts/privacy extensions can prevent verification; the visitor gets a retry, not an unprotected send.

## 3. Install the private rate limiter

First install the original website Supabase setup and published catalogue. In the same project's SQL Editor run the entire `public/email-delivery-upgrade.sql` (or `supabase/email-delivery.sql`). The build exports the downloadable SQL. It is re-runnable and does not change attraction/walk/admin records or reset current rate counters.

Only `service_role` can claim rate-limit capacity. The function enforces three attempts per recipient and 100 attempts globally per hour, counting provider failures and retries. These conservative limits prevent the public feature becoming an unrestricted sender. Change the two limits in the SQL only after reviewing your provider budget and abuse risk.

Rate keys are HMAC digests, not plaintext addresses. Counts expire logically after one hour; rows older than two hours are deleted on the next verified request. When no further requests arrive, old digests can remain until the next cleanup, but no raw address, location, content or token is ever written. If your policy requires physical cleanup on a fixed schedule, schedule a database-owner job to delete rows older than two hours.

## 4. Set function secrets in Supabase

Use **Supabase → Edge Functions → Secrets** (not website build variables) for:

| Name | Value |
| --- | --- |
| `RESEND_API_KEY` | Your private Resend sending-only key |
| `WALK_EMAIL_FROM` | Verified sender address, optionally with a display name |
| `TURNSTILE_SECRET_KEY` | Your private widget secret |
| `WALK_EMAIL_HASH_SECRET` | A cryptographically random secret of at least 32 characters, generated privately |
| `WALK_EMAIL_ALLOWED_ORIGINS` | Comma-separated exact origins, e.g. `https://your-domain.example,https://another-approved-host.example` — no trailing slash or path |

Supabase supplies `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` automatically to its functions. The service-role key is never requested by the website or shipped in its bundle. Do not change or expose it.

## 5. Deploy the function

With the [Supabase CLI](https://supabase.com/docs/guides/functions/deploy) installed on your own machine, run from `artifacts/glasgow-walks`:

```sh
supabase login
supabase link --project-ref YOUR_PROJECT_REFERENCE
supabase functions deploy send-walk-email --no-verify-jwt
```

The supplied `supabase/config.toml` disables the JWT gate for **this function only** because visitors are anonymous and a publishable key is not a user JWT. Do not disable auth on your other functions. This function independently requires an exact allowed origin, a server-verified Turnstile token whose action/hostname match the request, a private atomic limiter claim and bounded typed inputs. CORS alone is not an abuse/security boundary.

The CLI uploads the supplied `supabase/functions/send-walk-email` directory. Deployment does not apply the limiter SQL or configure secrets for you. No hosted Replit API server is used.

## 6. Rebuild and verify

Keep the existing public `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`, add `VITE_TURNSTILE_SITE_KEY`, then rebuild and upload the static website.

1. Open a published curated walk, click **Email this walk**, enter your own address and confirm. Complete the security check and send.
2. Confirm the interface says the email service accepted the request, then check your own inbox/spam folder.
3. Calculate a planner route and send it to yourself. Verify its order, measured totals and explicitly consented starting coordinates.
4. Disable/decline consent and verify sending does not start. Try an incorrect address and verify correction is possible.

These are live owner checks; the automated suites use fixtures and cannot establish your domain's inbox delivery. Do not send test messages to other people.

## Email contents and privacy

- The server reads only published records, including canonical names, stories and coordinates. A removed/unpublished walk or attraction is rejected; client-supplied prose, URLs, arbitrary subjects, attachments, CC and BCC are not accepted.
- Planner requests send only origin, ordered attraction IDs and bounded numeric totals, not route geometry or excluded nearby places. The email is an itinerary, not a retrievable exact route or turn-by-turn map.
- Curated requests send a walk ID only; emails use current published editorial stops, not the visitor's optional GPS connector.
- Emails have a readable HTML version and a plain-text version. Only generated OpenStreetMap location links appear. All record text is HTML-escaped.
- Do not add request/body/provider logging, analytics with addresses or coordinates, or database itinerary storage. Hosting/network providers still process requests, Cloudflare processes security verification, and Resend receives recipient and email content. Review their actual terms and retention; the app cannot promise the provider deletes a message immediately.

## Delivery and retry behavior

Acceptance by Resend is not proof of delivery; spam filtering, bounces, domain configuration and provider limits still apply. Provider errors are redacted in visitor responses, and no raw upstream error is logged. Check your own provider dashboard privately for configuration/delivery details.

Retries in the same form for the same address and itinerary reuse an idempotency reference; Resend deduplicates it for 24 hours. A failed/expired security check must be completed again for each attempt. Closing/reloading/changing the recipient or route starts a new reference, so if a send was uncertain check your inbox before starting another. If published records change between attempts, Resend may reject the reused reference instead of sending different content twice.

Never automatically retry a send in the background, bypass a failed security check, or silently substitute the original seed catalogue when server storage is unavailable.

## Isolated checks

```sh
npm run test:email
npm run test:email:browser
```

The first suite uses the actual Web-API handler, fake HTTP providers and an isolated PostgreSQL database. The browser suite blocks external requests and renders the actual visitor components. No real email, private keys or owner-database mutation is required. Chromium setup is described in the main README.